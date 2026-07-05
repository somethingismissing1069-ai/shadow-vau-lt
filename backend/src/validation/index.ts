import { z } from 'zod';
import {
  MAX_CUSTOM_EXPIRY_SECONDS,
  MIN_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  USERNAME_CONSTRAINTS,
} from '../config/constants';

// ─── Auth Validation Schemas ─────────────────────────────────────────────────

/**
 * Validation schema for user registration.
 * Requirements: 1.3, 1.4, 1.5, 11.1, 11.2
 */
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(MAX_EMAIL_LENGTH, `Email must not exceed ${MAX_EMAIL_LENGTH} characters`),
  username: z
    .string()
    .min(USERNAME_CONSTRAINTS.minLength, `Username must be at least ${USERNAME_CONSTRAINTS.minLength} characters`)
    .max(USERNAME_CONSTRAINTS.maxLength, `Username must not exceed ${USERNAME_CONSTRAINTS.maxLength} characters`)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must contain only alphanumeric characters and underscores'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export type RegisterSchemaInput = z.infer<typeof registerSchema>;

/**
 * Validation schema for user login.
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginSchemaInput = z.infer<typeof loginSchema>;

// ─── File Upload Validation Schema ───────────────────────────────────────────

/**
 * Validation schema for file upload request body fields.
 * Validates the metadata fields sent alongside the multipart file.
 */
export const uploadSchema = z.object({
  expiresInSeconds: z.coerce
    .number()
    .int()
    .min(60, 'Expiry must be at least 60 seconds')
    .max(MAX_CUSTOM_EXPIRY_SECONDS, 'Expiry must not exceed 30 days'),
  downloadOnce: z
    .union([z.boolean(), z.string().transform((val) => val === 'true')])
    .default(false),
  burnAfterReading: z
    .union([z.boolean(), z.string().transform((val) => val === 'true')])
    .default(false),
  password: z.string().optional(),
  maxDownloads: z.coerce.number().int().min(-1).optional(),
});

export type UploadSchemaInput = z.infer<typeof uploadSchema>;
