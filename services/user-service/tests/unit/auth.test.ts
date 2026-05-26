import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret-key-at-least-32-characters-long!!';

let authMiddleware: (req: Request, res: Response, next: NextFunction) => void;

beforeAll(async () => {
  const mod = await import('../../src/middleware/auth');
  authMiddleware = mod.authMiddleware;
});

describe('authMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response> & { locals: Record<string, unknown> };
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      locals: {},
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('should call next with 401 AppError when Authorization header is missing', () => {
    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0] as { statusCode: number; message: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorised');
  });

  it('should call next with 401 AppError when Authorization header is not Bearer format', () => {
    mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(401);
  });

  it('should call next with 401 AppError when token is malformed', () => {
    mockReq.headers = { authorization: 'Bearer not.a.valid.jwt' };

    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(401);
  });

  it('should call next with 401 AppError when token is expired', () => {
    const expiredToken = jwt.sign(
      { userId: 'abc123', email: 'user@example.com' },
      JWT_SECRET,
      { expiresIn: -1 } as jwt.SignOptions,
    );
    mockReq.headers = { authorization: `Bearer ${expiredToken}` };

    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(401);
  });

  it('should call next with 401 AppError when token has tampered signature', () => {
    const validToken = jwt.sign({ userId: 'abc123', email: 'user@example.com' }, JWT_SECRET);
    // Tamper: replace the signature segment
    const [header, payload] = validToken.split('.');
    const tamperedToken = `${header}.${payload}.invalidsignature`;
    mockReq.headers = { authorization: `Bearer ${tamperedToken}` };

    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(401);
  });

  it('should call next() with no error and attach userId+email to res.locals.user on valid token', () => {
    const token = jwt.sign({ userId: 'abc123', email: 'user@example.com' }, JWT_SECRET, {
      expiresIn: '1h',
    });
    mockReq.headers = { authorization: `Bearer ${token}` };

    authMiddleware(mockReq as Request, mockRes as unknown as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(); // called with no args = success
    const user = mockRes.locals['user'] as { userId: string; email: string };
    expect(user.userId).toBe('abc123');
    expect(user.email).toBe('user@example.com');
  });
});
