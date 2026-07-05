import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { IAuthService, JwtPayload, AuthTokens } from './interfaces/IAuthService';
import { IEncryptionService } from './interfaces/IEncryptionService';
import { AuthError, ValidationError, SessionRevokedError, TokenExpiredError } from '../errors';
import { config } from '../config';
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_CONSTRAINTS,
  MAX_EMAIL_LENGTH,
  JWT_DEFAULTS,
} from '../config/constants';

/**
 * AuthService implements user registration, login, logout, JWT verification,
 * and token refresh operations.
 */
export class AuthService implements IAuthService {
  private readonly prisma: PrismaClient;
  private readonly encryptionService: IEncryptionService;
  private readonly jwtSecret: string;
  private readonly accessExpiresIn: number;
  private readonly refreshExpiresIn: number;

  constructor(
    prisma: PrismaClient,
    encryptionService: IEncryptionService,
    jwtSecret?: string
  ) {
    this.prisma = prisma;
    this.encryptionService = encryptionService;
    this.jwtSecret = jwtSecret || config.JWT_SECRET;
    this.accessExpiresIn = config.JWT_ACCESS_EXPIRES_IN || JWT_DEFAULTS.accessExpiresIn;
    this.refreshExpiresIn = config.JWT_REFRESH_EXPIRES_IN || JWT_DEFAULTS.refreshExpiresIn;
  }

  /**
   * Register a new user: validate inputs, check uniqueness, hash password,
   * generate RSA-4096 key pair, encrypt private key, store user, issue tokens.
   */
  async register(
    email: string,
    username: string,
    password: string
  ): Promise<AuthTokens> {
    // 1. Validate inputs
    this.validateRegistrationInputs(email, username, password);

    // 2. Check uniqueness (email + username)
    await this.checkUniqueness(email, username);

    // 3. Hash password with Argon2id
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    // 4. Generate RSA-4096 key pair
    const { publicKey, privateKey } = await this.encryptionService.generateRsaKeyPair();

    // 5. Encrypt private key with password-derived key
    const encryptedRsaPrivateKey = await this.encryptionService.encryptPrivateKeyWithPassword(
      privateKey,
      password
    );

    // 6. Create user in DB
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        username: username.trim(),
        passwordHash,
        rsaPublicKey: publicKey,
        encryptedRsaPrivateKey,
      },
    });

    // 7. Generate JTI (uuid v4)
    const jti = uuidv4();

    // 8. Sign JWT access token (15min) and refresh token (7 days) with JTI
    const accessToken = this.signAccessToken(user.id, user.email, user.isAdmin, jti);
    const refreshToken = this.signRefreshToken(user.id, user.email, user.isAdmin, jti);

    // 9. Create session record in DB
    await this.prisma.session.create({
      data: {
        userId: user.id,
        jwtJti: jti,
        expiresAt: new Date(Date.now() + this.refreshExpiresIn * 1000),
      },
    });

    // 10. Return tokens
    return { accessToken, refreshToken };
  }

  /**
   * Verify credentials, check password hash, issue JWT with JTI claim.
   * Creates a session record and updates lastLoginAt.
   */
  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<AuthTokens> {
    // 1. Find user by email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    // 2. Verify password with argon2
    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new AuthError('Invalid email or password');
    }

    // 3. Generate JTI (uuid v4)
    const jti = uuidv4();

    // 4. Sign JWT access token (15min) and refresh token (7 days)
    const accessToken = this.signAccessToken(user.id, user.email, user.isAdmin, jti);
    const refreshToken = this.signRefreshToken(user.id, user.email, user.isAdmin, jti);

    // 5. Create session record with JTI, IP, user agent
    await this.prisma.session.create({
      data: {
        userId: user.id,
        jwtJti: jti,
        ipAddress: ip,
        userAgent: userAgent,
        expiresAt: new Date(Date.now() + this.refreshExpiresIn * 1000),
      },
    });

    // 6. Update user.lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // TODO: Record LOGIN audit event (Task 7.1)

    return { accessToken, refreshToken };
  }

  /**
   * Revoke session by marking JTI as revoked in sessions table.
   */
  async logout(jti: string, userId: string): Promise<void> {
    // Find session by jti and mark as revoked
    await this.prisma.session.updateMany({
      where: {
        jwtJti: jti,
        userId: userId,
      },
      data: {
        isRevoked: true,
      },
    });

    // TODO: Record LOGOUT audit event (Task 7.1)
  }

  /**
   * Verify JWT signature, expiry, and JTI revocation status.
   * Returns decoded payload if valid, throws appropriate error otherwise.
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    let decoded: any;

    // 1. Verify JWT signature and expiry
    try {
      decoded = jwt.verify(token, this.jwtSecret);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new TokenExpiredError('Access token has expired');
      }
      throw new AuthError('Invalid access token');
    }

    // 2. Extract JTI from payload
    const jti = decoded.jti;
    if (!jti) {
      throw new AuthError('Invalid token: missing JTI');
    }

    // 3. Check session table: if not found or isRevoked = true, throw SessionRevokedError
    const session = await this.prisma.session.findUnique({
      where: { jwtJti: jti },
    });

    if (!session || session.isRevoked) {
      throw new SessionRevokedError('Session has been revoked');
    }

    // 4. Return JwtPayload
    return {
      userId: decoded.userId,
      email: decoded.email,
      isAdmin: decoded.isAdmin,
      jti: decoded.jti,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  }

  /**
   * Issue new access + refresh tokens from a valid, non-revoked refresh token.
   * Revokes old session and creates a new one.
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let decoded: any;

    // 1. Verify refresh token signature and expiry
    try {
      decoded = jwt.verify(refreshToken, this.jwtSecret);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new TokenExpiredError('Refresh token has expired');
      }
      throw new AuthError('Invalid refresh token');
    }

    // 2. Check payload has type='refresh'
    if (decoded.type !== 'refresh') {
      throw new AuthError('Invalid token type: expected refresh token');
    }

    // 3. Extract JTI and check session is not revoked
    const oldJti = decoded.jti;
    if (!oldJti) {
      throw new AuthError('Invalid refresh token: missing JTI');
    }

    const session = await this.prisma.session.findUnique({
      where: { jwtJti: oldJti },
    });

    if (!session || session.isRevoked) {
      throw new SessionRevokedError('Session has been revoked');
    }

    // 4. Revoke old session (mark isRevoked = true)
    await this.prisma.session.update({
      where: { jwtJti: oldJti },
      data: { isRevoked: true },
    });

    // 5. Generate new JTI
    const newJti = uuidv4();

    // 6. Sign new access + refresh tokens
    const accessToken = this.signAccessToken(
      decoded.userId,
      decoded.email,
      decoded.isAdmin,
      newJti
    );
    const newRefreshToken = this.signRefreshToken(
      decoded.userId,
      decoded.email,
      decoded.isAdmin,
      newJti
    );

    // 7. Create new session record
    await this.prisma.session.create({
      data: {
        userId: decoded.userId,
        jwtJti: newJti,
        expiresAt: new Date(Date.now() + this.refreshExpiresIn * 1000),
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ─── Private Helper Methods ───────────────────────────────────────────────

  /**
   * Validate registration inputs: email format, username format, password length.
   */
  private validateRegistrationInputs(
    email: string,
    username: string,
    password: string
  ): void {
    // Validate email format
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }

    const trimmedEmail = email.toLowerCase().trim();

    if (trimmedEmail.length > MAX_EMAIL_LENGTH) {
      throw new ValidationError(`Email must not exceed ${MAX_EMAIL_LENGTH} characters`);
    }

    // Basic RFC 5322 email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new ValidationError('Invalid email format');
    }

    // Validate username format: 3-30 chars, alphanumeric + underscore
    if (!username || typeof username !== 'string') {
      throw new ValidationError('Username is required');
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < USERNAME_CONSTRAINTS.minLength) {
      throw new ValidationError(
        `Username must be at least ${USERNAME_CONSTRAINTS.minLength} characters`
      );
    }

    if (trimmedUsername.length > USERNAME_CONSTRAINTS.maxLength) {
      throw new ValidationError(
        `Username must not exceed ${USERNAME_CONSTRAINTS.maxLength} characters`
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      throw new ValidationError(
        'Username must contain only alphanumeric characters and underscores'
      );
    }

    // Validate password length
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
    }
  }

  /**
   * Check that email and username are not already taken.
   */
  private async checkUniqueness(email: string, username: string): Promise<void> {
    const trimmedEmail = email.toLowerCase().trim();
    const trimmedUsername = username.trim();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existingByEmail) {
      throw new ValidationError('Email is already taken');
    }

    const existingByUsername = await this.prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (existingByUsername) {
      throw new ValidationError('Username is already taken');
    }
  }

  /**
   * Sign a JWT access token with standard claims.
   */
  private signAccessToken(
    userId: string,
    email: string,
    isAdmin: boolean,
    jti: string
  ): string {
    return jwt.sign(
      {
        userId,
        email,
        isAdmin,
        jti,
      },
      this.jwtSecret,
      {
        expiresIn: this.accessExpiresIn,
        subject: userId,
      }
    );
  }

  /**
   * Sign a JWT refresh token with standard claims.
   */
  private signRefreshToken(
    userId: string,
    email: string,
    isAdmin: boolean,
    jti: string
  ): string {
    return jwt.sign(
      {
        userId,
        email,
        isAdmin,
        jti,
        type: 'refresh',
      },
      this.jwtSecret,
      {
        expiresIn: this.refreshExpiresIn,
        subject: userId,
      }
    );
  }
}
