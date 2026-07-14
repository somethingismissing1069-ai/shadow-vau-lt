/**
 * Application-wide constants for ShadowVault.
 */

/**
 * Expiry options for share links.
 * Maps a human-readable label to seconds, or null for custom durations.
 */
export const EXPIRY_OPTIONS = {
  '5m': 5 * 60,
  '30m': 30 * 60,
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  'custom': null,
} as const;

export type ExpiryOption = keyof typeof EXPIRY_OPTIONS;

/** Maximum custom expiry duration: 30 days in seconds */
export const MAX_CUSTOM_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 2,592,000 seconds

/** Maximum upload file size: 100 MB in bytes */
export const MAX_UPLOAD_BYTES = 104857600;

/** Rate limiting defaults — can be overridden via environment variables */
export const RATE_LIMITS = {
  global: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  auth: { windowMs: 900_000, max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '50', 10) },
  upload: { windowMs: 3_600_000, max: 50 },
  shareDownload: { windowMs: 60_000, max: 30 },
  passwordAttempt: { windowMs: 300_000, max: 20 },
} as const;

/** JWT token expiry defaults (in seconds) */
export const JWT_DEFAULTS = {
  accessExpiresIn: 900, // 15 minutes
  refreshExpiresIn: 604_800, // 7 days
} as const;

/** Share token length in bytes (produces 128 hex characters) */
export const SHARE_TOKEN_BYTES = 64;

/** Minimum password length for user registration */
export const MIN_PASSWORD_LENGTH = 12;

/** Username validation constraints */
export const USERNAME_CONSTRAINTS = {
  minLength: 3,
  maxLength: 30,
} as const;

/** Maximum email length per RFC 5322 */
export const MAX_EMAIL_LENGTH = 254;
