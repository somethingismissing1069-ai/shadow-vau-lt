// Set environment variables before importing modules that depend on config
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
process.env.RSA_PRIVATE_KEY_PATH = './test/key.pem';
process.env.UPLOAD_DIR = './test/uploads';
process.env.JWT_ACCESS_EXPIRES_IN = '900';
process.env.JWT_REFRESH_EXPIRES_IN = '604800';

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { AuthService } from './AuthService';
import { EncryptionService } from './EncryptionService';
import { ValidationError, AuthError, SessionRevokedError, TokenExpiredError } from '../errors';
import { JwtPayload } from './interfaces/IAuthService';

// Mock PrismaClient
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
} as any;

const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';

describe('AuthService - register', () => {
  let authService: AuthService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService();
    authService = new AuthService(mockPrisma, encryptionService, TEST_JWT_SECRET);
  });

  describe('Input Validation', () => {
    it('should reject registration with empty email', async () => {
      await expect(
        authService.register('', 'validuser', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with invalid email format', async () => {
      await expect(
        authService.register('not-an-email', 'validuser', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with email exceeding max length', async () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      await expect(
        authService.register(longEmail, 'validuser', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with empty username', async () => {
      await expect(
        authService.register('test@example.com', '', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with username shorter than 3 characters', async () => {
      await expect(
        authService.register('test@example.com', 'ab', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with username longer than 30 characters', async () => {
      const longUsername = 'a'.repeat(31);
      await expect(
        authService.register('test@example.com', longUsername, 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with username containing invalid characters', async () => {
      await expect(
        authService.register('test@example.com', 'user@name!', 'validpassword12')
      ).rejects.toThrow(ValidationError);
    });

    it('should allow username with underscores and alphanumeric chars', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        username: 'valid_user_123',
        isAdmin: false,
      });
      mockPrisma.session.create.mockResolvedValue({});

      const result = await authService.register(
        'test@example.com',
        'valid_user_123',
        'validpassword12'
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should reject registration with password shorter than 12 characters', async () => {
      await expect(
        authService.register('test@example.com', 'validuser', 'short')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject registration with password of exactly 11 characters', async () => {
      await expect(
        authService.register('test@example.com', 'validuser', '12345678901')
      ).rejects.toThrow(ValidationError);
    });

    it('should accept password of exactly 12 characters', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        username: 'validuser',
        isAdmin: false,
      });
      mockPrisma.session.create.mockResolvedValue({});

      const result = await authService.register(
        'test@example.com',
        'validuser',
        '123456789012'
      );
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('Uniqueness Checks', () => {
    it('should reject registration when email is already taken', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.email) return Promise.resolve({ id: 'existing-user' });
        return Promise.resolve(null);
      });

      await expect(
        authService.register('taken@example.com', 'newuser', 'validpassword12')
      ).rejects.toThrow(ValidationError);
      await expect(
        authService.register('taken@example.com', 'newuser', 'validpassword12')
      ).rejects.toThrow('Email is already taken');
    });

    it('should reject registration when username is already taken', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.email) return Promise.resolve(null);
        if (where.username) return Promise.resolve({ id: 'existing-user' });
        return Promise.resolve(null);
      });

      await expect(
        authService.register('new@example.com', 'takenuser', 'validpassword12')
      ).rejects.toThrow(ValidationError);
      await expect(
        authService.register('new@example.com', 'takenuser', 'validpassword12')
      ).rejects.toThrow('Username is already taken');
    });
  });

  describe('Successful Registration', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'new-user-id',
          email: data.email,
          username: data.username,
          isAdmin: false,
        })
      );
      mockPrisma.session.create.mockResolvedValue({});
    });

    it('should return accessToken and refreshToken on successful registration', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should issue an access token with correct payload claims', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as JwtPayload;
      expect(decoded.userId).toBe('new-user-id');
      expect(decoded.email).toBe('user@example.com');
      expect(decoded.isAdmin).toBe(false);
      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.jti).toBe('string');
    });

    it('should issue a refresh token with type claim', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const decoded = jwt.verify(result.refreshToken, TEST_JWT_SECRET) as any;
      expect(decoded.type).toBe('refresh');
      expect(decoded.userId).toBe('new-user-id');
      expect(decoded.jti).toBeDefined();
    });

    it('should issue access token with ~15min expiry', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(900); // 15 minutes in seconds
    });

    it('should issue refresh token with ~7day expiry', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const decoded = jwt.verify(result.refreshToken, TEST_JWT_SECRET) as any;
      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBe(604800); // 7 days in seconds
    });

    it('should store hashed password (not plaintext) in DB', async () => {
      await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe('securePassword1');
      // Argon2id hashes start with $argon2id$
      expect(createCall.data.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('should store RSA public key and encrypted private key in DB', async () => {
      await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.rsaPublicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(createCall.data.encryptedRsaPrivateKey).toBeDefined();
      // The encrypted private key should be a JSON string (not raw PEM)
      const parsed = JSON.parse(createCall.data.encryptedRsaPrivateKey);
      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
      expect(parsed).toHaveProperty('salt');
    });

    it('should normalize email to lowercase', async () => {
      await authService.register(
        'User@EXAMPLE.com',
        'testuser',
        'securePassword1'
      );

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('user@example.com');
    });

    it('should create a session with the JTI', async () => {
      await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
      const sessionCall = mockPrisma.session.create.mock.calls[0][0];
      expect(sessionCall.data.userId).toBe('new-user-id');
      expect(sessionCall.data.jwtJti).toBeDefined();
      expect(sessionCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('should use same JTI in both access and refresh tokens', async () => {
      const result = await authService.register(
        'user@example.com',
        'testuser',
        'securePassword1'
      );

      const accessDecoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      const refreshDecoded = jwt.verify(result.refreshToken, TEST_JWT_SECRET) as any;
      expect(accessDecoded.jti).toBe(refreshDecoded.jti);
    });
  });
});



describe('AuthService - login', () => {
  let authService: AuthService;
  let encryptionService: EncryptionService;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await argon2.hash('validpassword12', { type: argon2.argon2id });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService();
    authService = new AuthService(mockPrisma, encryptionService, TEST_JWT_SECRET);
  });

  it('should throw AuthError when email is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.login('notfound@example.com', 'validpassword12', '127.0.0.1', 'TestAgent')
    ).rejects.toThrow(AuthError);
  });

  it('should throw AuthError when password is incorrect', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: false,
    });

    await expect(
      authService.login('user@example.com', 'wrongpassword1', '127.0.0.1', 'TestAgent')
    ).rejects.toThrow(AuthError);
  });

  it('should return tokens on valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: false,
    });
    mockPrisma.session.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});

    const result = await authService.login(
      'user@example.com',
      'validpassword12',
      '127.0.0.1',
      'Mozilla/5.0'
    );

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('should create a session with IP and user agent', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: false,
    });
    mockPrisma.session.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});

    await authService.login('user@example.com', 'validpassword12', '192.168.1.1', 'Chrome/120');

    expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
    const sessionData = mockPrisma.session.create.mock.calls[0][0].data;
    expect(sessionData.userId).toBe('user-id');
    expect(sessionData.ipAddress).toBe('192.168.1.1');
    expect(sessionData.userAgent).toBe('Chrome/120');
    expect(sessionData.jwtJti).toBeDefined();
  });

  it('should update lastLoginAt on successful login', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: false,
    });
    mockPrisma.session.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});

    await authService.login('user@example.com', 'validpassword12', '127.0.0.1', 'TestAgent');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('should issue access token with correct user claims', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: true,
    });
    mockPrisma.session.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});

    const result = await authService.login(
      'user@example.com',
      'validpassword12',
      '127.0.0.1',
      'TestAgent'
    );

    const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
    expect(decoded.userId).toBe('user-id');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.isAdmin).toBe(true);
    expect(decoded.jti).toBeDefined();
  });

  it('should perform case-insensitive email lookup', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashedPassword,
      isAdmin: false,
    });
    mockPrisma.session.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});

    await authService.login('USER@EXAMPLE.COM', 'validpassword12', '127.0.0.1', 'TestAgent');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });
});

describe('AuthService - logout', () => {
  let authService: AuthService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService();
    authService = new AuthService(mockPrisma, encryptionService, TEST_JWT_SECRET);
  });

  it('should mark session as revoked', async () => {
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    await authService.logout('test-jti', 'user-id');

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        jwtJti: 'test-jti',
        userId: 'user-id',
      },
      data: {
        isRevoked: true,
      },
    });
  });

  it('should not throw even if session does not exist', async () => {
    mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      authService.logout('nonexistent-jti', 'user-id')
    ).resolves.toBeUndefined();
  });
});

describe('AuthService - verifyAccessToken', () => {
  let authService: AuthService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService();
    authService = new AuthService(mockPrisma, encryptionService, TEST_JWT_SECRET);
  });

  it('should return JwtPayload for a valid, non-revoked token', async () => {
    const jti = 'valid-jti-123';
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: jti,
      isRevoked: false,
      userId: 'user-id',
    });

    const result = await authService.verifyAccessToken(token);

    expect(result.userId).toBe('user-id');
    expect(result.email).toBe('user@example.com');
    expect(result.isAdmin).toBe(false);
    expect(result.jti).toBe(jti);
    expect(result.iat).toBeDefined();
    expect(result.exp).toBeDefined();
  });

  it('should throw TokenExpiredError for expired token', async () => {
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti' },
      TEST_JWT_SECRET,
      { expiresIn: -10 } // already expired
    );

    await expect(authService.verifyAccessToken(token)).rejects.toThrow(TokenExpiredError);
  });

  it('should throw AuthError for invalid signature', async () => {
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti' },
      'wrong-secret-that-is-also-long-enough-here!!'
    );

    await expect(authService.verifyAccessToken(token)).rejects.toThrow(AuthError);
  });

  it('should throw SessionRevokedError when session is revoked', async () => {
    const jti = 'revoked-jti';
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: jti,
      isRevoked: true,
      userId: 'user-id',
    });

    await expect(authService.verifyAccessToken(token)).rejects.toThrow(SessionRevokedError);
  });

  it('should throw SessionRevokedError when session not found', async () => {
    const jti = 'nonexistent-jti';
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    mockPrisma.session.findUnique.mockResolvedValue(null);

    await expect(authService.verifyAccessToken(token)).rejects.toThrow(SessionRevokedError);
  });

  it('should throw AuthError when token is missing JTI', async () => {
    const token = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    await expect(authService.verifyAccessToken(token)).rejects.toThrow(AuthError);
  });
});

describe('AuthService - refreshTokens', () => {
  let authService: AuthService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService = new EncryptionService();
    authService = new AuthService(mockPrisma, encryptionService, TEST_JWT_SECRET);
  });

  it('should return new tokens on valid refresh token', async () => {
    const oldJti = 'old-jti-123';
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: oldJti, type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: 604800 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: oldJti,
      isRevoked: false,
      userId: 'user-id',
    });
    mockPrisma.session.update.mockResolvedValue({});
    mockPrisma.session.create.mockResolvedValue({});

    const result = await authService.refreshTokens(refreshToken);

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');

    // New tokens should have different JTI
    const newAccess = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
    const newRefresh = jwt.verify(result.refreshToken, TEST_JWT_SECRET) as any;
    expect(newAccess.jti).not.toBe(oldJti);
    expect(newRefresh.jti).toBe(newAccess.jti);
  });

  it('should revoke old session when refreshing', async () => {
    const oldJti = 'old-jti-456';
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: oldJti, type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: 604800 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: oldJti,
      isRevoked: false,
      userId: 'user-id',
    });
    mockPrisma.session.update.mockResolvedValue({});
    mockPrisma.session.create.mockResolvedValue({});

    await authService.refreshTokens(refreshToken);

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { jwtJti: oldJti },
      data: { isRevoked: true },
    });
  });

  it('should create new session after refreshing', async () => {
    const oldJti = 'old-jti-789';
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: oldJti, type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: 604800 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: oldJti,
      isRevoked: false,
      userId: 'user-id',
    });
    mockPrisma.session.update.mockResolvedValue({});
    mockPrisma.session.create.mockResolvedValue({});

    await authService.refreshTokens(refreshToken);

    expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
    const newSessionData = mockPrisma.session.create.mock.calls[0][0].data;
    expect(newSessionData.userId).toBe('user-id');
    expect(newSessionData.jwtJti).toBeDefined();
    expect(newSessionData.jwtJti).not.toBe(oldJti);
  });

  it('should throw AuthError when token is not a refresh type', async () => {
    const accessToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti', type: 'access' },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    await expect(authService.refreshTokens(accessToken)).rejects.toThrow(AuthError);
  });

  it('should throw AuthError when using access token without type', async () => {
    const accessToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti' },
      TEST_JWT_SECRET,
      { expiresIn: 900 }
    );

    await expect(authService.refreshTokens(accessToken)).rejects.toThrow(AuthError);
  });

  it('should throw TokenExpiredError for expired refresh token', async () => {
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti', type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: -10 }
    );

    await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(TokenExpiredError);
  });

  it('should throw SessionRevokedError when session is already revoked', async () => {
    const oldJti = 'revoked-jti';
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: oldJti, type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: 604800 }
    );

    mockPrisma.session.findUnique.mockResolvedValue({
      jwtJti: oldJti,
      isRevoked: true,
      userId: 'user-id',
    });

    await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(SessionRevokedError);
  });

  it('should throw SessionRevokedError when session not found', async () => {
    const oldJti = 'missing-jti';
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: oldJti, type: 'refresh' },
      TEST_JWT_SECRET,
      { expiresIn: 604800 }
    );

    mockPrisma.session.findUnique.mockResolvedValue(null);

    await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(SessionRevokedError);
  });

  it('should throw AuthError for invalid refresh token signature', async () => {
    const refreshToken = jwt.sign(
      { userId: 'user-id', email: 'user@example.com', isAdmin: false, jti: 'jti', type: 'refresh' },
      'wrong-secret-that-is-also-long-enough-here!!'
    );

    await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(AuthError);
  });
});
