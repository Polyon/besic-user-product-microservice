import bcrypt from 'bcrypt';
import { User } from '../models/user.model';
import { registerSchema, RegisterInput, updateSchema, UpdateInput } from '../validators/user.validators';
import { env } from '../config/env';
import { getUser, setUser, invalidateUser } from '../cache/user.cache';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

export class UserService {
  static async register(input: RegisterInput): Promise<Record<string, unknown>> {
    const parsed = registerSchema.parse(input);

    const passwordHash = await bcrypt.hash(parsed.password, env.BCRYPT_COST);

    const user = await User.create({
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      passwordHash,
    });

    return user.toJSON() as unknown as Record<string, unknown>;
  }

  static async getById(
    id: string,
    requestingUserId: string,
  ): Promise<Record<string, unknown>> {
    if (requestingUserId !== id) {
      throw new AppError(403, 'Forbidden');
    }

    const cached = await getUser(id);
    if (cached) return cached;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const result = user.toJSON() as unknown as Record<string, unknown>;
    await setUser(id, result);
    return result;
  }

  static async update(
    id: string,
    requestingUserId: string,
    input: UpdateInput,
  ): Promise<Record<string, unknown>> {
    if (requestingUserId !== id) {
      throw new AppError(403, 'Forbidden');
    }

    const parsed = updateSchema.parse(input);

    const updates: Record<string, unknown> = {};
    if (parsed.name !== undefined) updates['name'] = parsed.name;
    if (parsed.email !== undefined) updates['email'] = parsed.email.toLowerCase();
    if (parsed.password !== undefined) {
      updates['passwordHash'] = await bcrypt.hash(parsed.password, env.BCRYPT_COST);
    }

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    await invalidateUser(id);
    return user.toJSON() as unknown as Record<string, unknown>;
  }

  static async delete(id: string, requestingUserId: string): Promise<void> {
    if (requestingUserId !== id) {
      throw new AppError(403, 'Forbidden');
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    await invalidateUser(id);
  }

  // ── Internal (T042) ──────────────────────────────────────────────────────────

  /**
   * Verify email + password for the internal Auth Service credential endpoint.
   * Uses bcrypt constant-time compare. Always throws the same AppError 401 on
   * failure to prevent user enumeration.
   */
  static async verifyCredentials(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const user = await User.findOne({ email: email.toLowerCase() });
    console.log(user);
    // Always run bcrypt.compare even for unknown email to prevent timing attacks
    const dummyHash = '$2b$10$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';
    const hash = user ? user.passwordHash : dummyHash;
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
      throw new AppError(401, 'Invalid credentials');
    }

    return { id: user._id.toString(), email: user.email };
  }
}
