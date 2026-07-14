import { z } from 'zod';

// ─── Registration Schema ─────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .max(254, 'Email must not exceed 254 characters'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only letters, numbers, and underscores'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must not exceed 128 characters'),
});

// ─── Login Schema ────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .max(254, 'Email must not exceed 254 characters'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

// ─── Upload Schema ───────────────────────────────────────────────────────────
export const uploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size <= 104_857_600, 'File must not exceed 100 MB'),
  expiresInSeconds: z
    .number()
    .int()
    .min(60, 'Expiry must be at least 60 seconds')
    .max(2_592_000, 'Expiry must not exceed 30 days'),
  downloadOnce: z.boolean().default(false),
  burnAfterReading: z.boolean().default(false),
  password: z
    .string()
    .max(128, 'Password must not exceed 128 characters')
    .optional()
    .or(z.literal('')),
  maxDownloads: z
    .number()
    .int()
    .min(-1, 'Max downloads must be at least 1 or unlimited (-1)')
    .refine((v) => v === -1 || v >= 1, 'Max downloads must be 1 or greater, or unlimited')
    .optional(),
});

// ─── Share Password Schema ───────────────────────────────────────────────────
export const sharePasswordSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required'),
});
