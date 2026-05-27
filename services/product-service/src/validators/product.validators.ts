import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  price: z.number().positive(),
  category: z.string().trim().min(1).max(100),
  stock: z.number().int().min(0),
});

export const UpdateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    price: z.number().positive().optional(),
    category: z.string().trim().min(1).max(100).optional(),
    stock: z.number().int().min(0).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const IdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product ID'),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ListQueryInput = z.infer<typeof ListQuerySchema>;
export type IdParamInput = z.infer<typeof IdParamSchema>;
