import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { internalApiKey } from '../middleware/internalApiKey';
import { UserService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

const internalRouter = Router();

const VerifyCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/internal/verify-credentials
 * Protected by X-Internal-Api-Key header.
 * Returns { id, email } on success; 401 on invalid credentials; 400 on bad input.
 */
internalRouter.post(
  '/verify-credentials',
  internalApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = VerifyCredentialsSchema.parse(req.body);
      const result = await UserService.verifyCredentials(email, password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { internalRouter };
