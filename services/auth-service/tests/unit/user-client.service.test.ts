/**
 * Unit tests for user-client.service.ts
 *
 * Mocks global fetch to test every branch:
 *   - 200 → VerifiedUser returned
 *   - 401 → InvalidCredentialsError thrown
 *   - 5xx → ServiceUnavailableError thrown
 *   - network error → ServiceUnavailableError thrown
 */
import { verifyCredentials } from '../../src/services/user-client.service';
import { InvalidCredentialsError, ServiceUnavailableError } from '../../src/errors';

jest.mock('ioredis', () => require('ioredis-mock'));

const MOCK_URL = 'http://localhost:3000/api/internal/verify-credentials';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('user-client.service — verifyCredentials', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns VerifiedUser on 200 response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { id: 'user-abc', email: 'jane@example.com' }),
    );

    const result = await verifyCredentials('jane@example.com', 'password123');
    expect(result).toEqual({ id: 'user-abc', email: 'jane@example.com' });
  });

  it('calls the correct URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { id: 'user-abc', email: 'jane@example.com' }),
    );

    await verifyCredentials('jane@example.com', 'password123');

    expect(fetchSpy).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
  });

  it('sends email and password in request body', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { id: 'user-abc', email: 'jane@example.com' }),
    );

    await verifyCredentials('jane@example.com', 'password123');

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as { email: string; password: string };
    expect(body.email).toBe('jane@example.com');
    expect(body.password).toBe('password123');
  });

  it('sends X-Internal-Api-Key header', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { id: 'user-abc', email: 'jane@example.com' }),
    );

    await verifyCredentials('jane@example.com', 'password123');

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['X-Internal-Api-Key']).toBe('test-internal-api-key');
  });

  it('throws InvalidCredentialsError on 401 response', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { error: 'invalid_credentials' }));

    await expect(verifyCredentials('jane@example.com', 'wrong')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('throws ServiceUnavailableError on 500 response', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(500, { error: 'internal_server_error' }));

    await expect(
      verifyCredentials('jane@example.com', 'password123'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('throws ServiceUnavailableError on 503 response', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(503, {}));

    await expect(
      verifyCredentials('jane@example.com', 'password123'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('throws ServiceUnavailableError on network/fetch error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      verifyCredentials('jane@example.com', 'password123'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
