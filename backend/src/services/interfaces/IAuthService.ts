/**
 * JWT Payload structure returned by token verification.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Auth tokens returned by register, login, and refresh operations.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Interface for the Authentication Service.
 * Handles user registration, login, logout, JWT issuance, and session management.
 */
export interface IAuthService {
  /**
   * Register a new user: validate uniqueness, hash password (Argon2id),
   * generate RSA-4096 key pair, encrypt private key, store user.
   *
   * Postconditions:
   *   - User record persisted with no plaintext password or private key
   *   - Returns JWT access token and refresh token
   */
  register(
    email: string,
    username: string,
    password: string
  ): Promise<AuthTokens>;

  /**
   * Verify credentials, check password hash, issue JWT with JTI claim.
   * Records login audit event.
   *
   * Postconditions:
   *   - Session row inserted for JTI
   *   - Returns signed JWT (15-min access) + refresh token (7-day)
   */
  login(
    email: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<AuthTokens>;

  /**
   * Revoke session by marking JTI as revoked in sessions table.
   */
  logout(jti: string, userId: string): Promise<void>;

  /**
   * Verify JWT signature, expiry, and JTI revocation status.
   * Returns decoded payload if valid, throws AuthError otherwise.
   */
  verifyAccessToken(token: string): Promise<JwtPayload>;

  /**
   * Issue new access + refresh tokens from a valid, non-revoked refresh token.
   */
  refreshTokens(refreshToken: string): Promise<AuthTokens>;
}
