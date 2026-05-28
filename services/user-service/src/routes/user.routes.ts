import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ZodError } from 'zod';
import { publicRateLimiter } from '../middleware/rateLimiter';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();

router.post('/', publicRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await UserService.register(
      req.body as { name: string; email: string; password: string },
    );
    res.status(201).json(user);
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      return next(new AppError(409, 'Email already in use'));
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((e) => e.message);
      return next(new AppError(400, 'Validation error', details));
    }
    next(err);
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    if (!Types.ObjectId.isValid(id)) {
      return next(new AppError(400, 'Invalid user ID'));
    }
    const requestingUserId = (res.locals['user'] as { userId: string }).userId;
    const user = await UserService.getById(id, requestingUserId);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    if (!Types.ObjectId.isValid(id)) {
      return next(new AppError(400, 'Invalid user ID'));
    }
    const requestingUserId = (res.locals['user'] as { userId: string }).userId;
    const user = await UserService.update(id, requestingUserId, req.body as Record<string, unknown>);
    res.status(200).json(user);
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      return next(new AppError(409, 'Email already in use'));
    }
    if (err instanceof ZodError) {
      const refineError = err.issues.find((i) => i.message === 'At least one field must be provided');
      if (refineError) {
        return next(new AppError(400, 'At least one field must be provided'));
      }
      const details = err.issues.map((e) => e.message);
      return next(new AppError(400, 'Validation error', details));
    }
    next(err);
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    if (!Types.ObjectId.isValid(id)) {
      return next(new AppError(400, 'Invalid user ID'));
    }
    const requestingUserId = (res.locals['user'] as { userId: string }).userId;
    await UserService.delete(id, requestingUserId);
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export { router as userRouter };

