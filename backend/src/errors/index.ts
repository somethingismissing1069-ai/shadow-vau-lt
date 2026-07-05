// ─── Base Application Error ──────────────────────────────────────────────────

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Authentication Errors ───────────────────────────────────────────────────

export class AuthError extends AppError {
  readonly statusCode = 401;
  readonly errorCode = 'AUTH_FAILED';

  constructor(message: string = 'Authentication failed') {
    super(message);
  }
}

export class TokenExpiredError extends AppError {
  readonly statusCode = 401;
  readonly errorCode = 'TOKEN_EXPIRED';

  constructor(message: string = 'Token has expired') {
    super(message);
  }
}

export class SessionRevokedError extends AppError {
  readonly statusCode = 401;
  readonly errorCode = 'SESSION_REVOKED';

  constructor(message: string = 'Session has been revoked') {
    super(message);
  }
}

// ─── Authorization Errors ────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'FORBIDDEN';

  constructor(message: string = 'Access forbidden') {
    super(message);
  }
}

export class DownloadLimitReachedError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'DOWNLOAD_LIMIT_REACHED';

  constructor(message: string = 'Download limit has been reached') {
    super(message);
  }
}

export class InvalidPasswordError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'INVALID_SHARE_PASSWORD';

  constructor(message: string = 'Invalid share link password') {
    super(message);
  }
}

// ─── Resource Errors ─────────────────────────────────────────────────────────

export class TokenNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly errorCode = 'TOKEN_NOT_FOUND';

  constructor(message: string = 'Share token not found') {
    super(message);
  }
}

export class FileNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly errorCode = 'FILE_NOT_FOUND';

  constructor(message: string = 'File not found') {
    super(message);
  }
}

export class TokenRevokedError extends AppError {
  readonly statusCode = 410;
  readonly errorCode = 'TOKEN_REVOKED';

  constructor(message: string = 'Share token has been revoked') {
    super(message);
  }
}

export class LinkExpiredError extends AppError {
  readonly statusCode = 410;
  readonly errorCode = 'LINK_EXPIRED';

  constructor(message: string = 'Share link has expired') {
    super(message);
  }
}

export class FileBurnedError extends AppError {
  readonly statusCode = 410;
  readonly errorCode = 'FILE_BURNED';

  constructor(message: string = 'File has been burned after reading') {
    super(message);
  }
}

// ─── Crypto Errors ───────────────────────────────────────────────────────────

export class CryptoIntegrityError extends AppError {
  readonly statusCode = 500;
  readonly errorCode = 'INTEGRITY_CHECK_FAILED';

  constructor(message: string = 'Ciphertext integrity check failed') {
    super(message);
  }
}

export class KeyUnwrapError extends AppError {
  readonly statusCode = 500;
  readonly errorCode = 'KEY_UNWRAP_FAILED';

  constructor(message: string = 'Failed to unwrap encryption key') {
    super(message);
  }
}

// ─── Validation Errors ───────────────────────────────────────────────────────

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'VALIDATION_FAILED';

  constructor(message: string = 'Validation failed') {
    super(message);
  }
}

export class FileTooLargeError extends AppError {
  readonly statusCode = 413;
  readonly errorCode = 'FILE_TOO_LARGE';

  constructor(message: string = 'File exceeds maximum upload size') {
    super(message);
  }
}

export class InvalidMimeTypeError extends AppError {
  readonly statusCode = 415;
  readonly errorCode = 'INVALID_MIME_TYPE';

  constructor(message: string = 'File MIME type is not allowed') {
    super(message);
  }
}

// ─── Rate Limiting Errors ────────────────────────────────────────────────────

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly errorCode = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
  }
}
