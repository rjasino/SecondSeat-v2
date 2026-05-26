import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Must be a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFields = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Must be a valid email'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

export type RegisterFields = z.infer<typeof registerSchema>;
