/**
 * user-client.service.ts — HTTP client for the User Service internal endpoint.
 *
 * Phase 2: Skeleton with types and function signatures only.
 * Full implementation in Phase 3 (T024).
 */
import { env } from '../config/env';
import { AppError, InvalidCredentialsError, ServiceUnavailableError } from '../errors';

/** Shape returned by POST /api/internal/verify-credentials on the User Service */
export interface VerifiedUser {
  id: string;    // MongoDB ObjectId string
  email: string;
}

// ── Phase 3 (T024) ───────────────────────────────────────────────────────────

/**
 * Call the User Service's internal credential-verification endpoint.
 * Returns the verified user on success.
 * Throws InvalidCredentialsError on 401.
 * Throws ServiceUnavailableError on network error or 5xx.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedUser> {
  try {
    const response = await fetch(`${env.USER_SERVICE_URL}/api/internal/verify-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': env.INTERNAL_API_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidCredentialsError();
    }

    if (!response.ok) {
      throw new ServiceUnavailableError();
    }

    const data = (await response.json()) as VerifiedUser;
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new ServiceUnavailableError();
  }
}
