import { z } from 'zod';

/**
 * Zod schema for validating all environment variables at startup.
 * Parses process.env and provides typed, validated configuration.
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  BASE_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800),

  // Encryption
  RSA_PRIVATE_KEY_PATH: z.string().min(1, 'RSA_PRIVATE_KEY_PATH is required'),
  UPLOAD_DIR: z.string().min(1, 'UPLOAD_DIR is required'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104857600),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Cleanup
  EXPIRY_CRON_SCHEDULE: z.string().default('*/5 * * * *'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parsed and validated application configuration.
 * Throws a descriptive error at startup if any required env vars are missing
 * or fail validation.
 */
function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment variable validation failed:\n${formatted}\n\nCheck your .env file or environment configuration.`
    );
  }

  return result.data;
}

/**
 * Application configuration singleton.
 * Access this from anywhere in the backend to get validated env values.
 */
export const config = loadConfig();

/**
 * Parsed CORS origins as an array.
 */
export const corsOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
