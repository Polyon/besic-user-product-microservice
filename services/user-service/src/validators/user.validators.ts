import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer').trim(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const updateSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer').trim().optional(),
    email: z.string().email('Invalid email address').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateInput = z.infer<typeof updateSchema>;

