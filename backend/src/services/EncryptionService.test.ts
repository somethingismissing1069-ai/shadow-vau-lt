import { EncryptionService } from './EncryptionService';
import { CryptoIntegrityError } from '../errors';

describe('EncryptionService - RSA Key Pair Generation and Key Management', () => {
  let service: EncryptionService;

  beforeAll(() => {
    service = new EncryptionService();
  });

  describe('generateRsaKeyPair', () => {
    it('should generate a valid RSA-4096 key pair in PEM format', async () => {
      const { publicKey, privateKey } = await service.generateRsaKeyPair();

      // Verify PEM format markers
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(publicKey).toContain('-----END PUBLIC KEY-----');
      expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(privateKey).toContain('-----END PRIVATE KEY-----');
    });

    it('should generate unique key pairs on each invocation', async () => {
      const keyPair1 = await service.generateRsaKeyPair();
      const keyPair2 = await service.generateRsaKeyPair();

      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });

    it('should generate keys that work with encryptFile/decryptFile', async () => {
      const { publicKey, privateKey } = await service.generateRsaKeyPair();
      const plaintext = Buffer.from('Hello, ShadowVault!');

      const encrypted = await service.encryptFile(plaintext, publicKey);
      const decrypted = await service.decryptFile(
        encrypted.payload,
        encrypted.keyBundle.wrappedAesKey,
        privateKey
      );

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('encryptPrivateKeyWithPassword', () => {
    it('should return a valid JSON string with required fields', async () => {
      const { privateKey } = await service.generateRsaKeyPair();
      const password = 'securePassword123!';

      const encrypted = await service.encryptPrivateKeyWithPassword(privateKey, password);
      const parsed = JSON.parse(encrypted);

      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
      expect(parsed).toHaveProperty('salt');

      // All values should be base64-encoded strings
      expect(typeof parsed.encrypted).toBe('string');
      expect(typeof parsed.iv).toBe('string');
      expect(typeof parsed.authTag).toBe('string');
      expect(typeof parsed.salt).toBe('string');

      // Verify base64 values decode to proper lengths
      expect(Buffer.from(parsed.iv, 'base64').length).toBe(12);
      expect(Buffer.from(parsed.authTag, 'base64').length).toBe(16);
      expect(Buffer.from(parsed.salt, 'base64').length).toBe(32);
    });

    it('should produce different ciphertext for same key with different passwords', async () => {
      const { privateKey } = await service.generateRsaKeyPair();

      const enc1 = await service.encryptPrivateKeyWithPassword(privateKey, 'password1!!!');
      const enc2 = await service.encryptPrivateKeyWithPassword(privateKey, 'password2!!!');

      expect(enc1).not.toEqual(enc2);
    });

    it('should produce different ciphertext each time even with same password (different salt)', async () => {
      const { privateKey } = await service.generateRsaKeyPair();
      const password = 'samePassword123!';

      const enc1 = await service.encryptPrivateKeyWithPassword(privateKey, password);
      const enc2 = await service.encryptPrivateKeyWithPassword(privateKey, password);

      // Due to random salt and IV, outputs should differ
      expect(enc1).not.toEqual(enc2);
    });
  });

  describe('decryptPrivateKeyWithPassword', () => {
    it('should correctly decrypt a private key encrypted with the correct password', async () => {
      const { privateKey } = await service.generateRsaKeyPair();
      const password = 'correctPassword1';

      const encrypted = await service.encryptPrivateKeyWithPassword(privateKey, password);
      const decrypted = await service.decryptPrivateKeyWithPassword(encrypted, password);

      expect(decrypted).toEqual(privateKey);
    });

    it('should throw CryptoIntegrityError when using incorrect password', async () => {
      const { privateKey } = await service.generateRsaKeyPair();
      const correctPassword = 'correctPassword1';
      const wrongPassword = 'wrongPassword123';

      const encrypted = await service.encryptPrivateKeyWithPassword(privateKey, correctPassword);

      await expect(
        service.decryptPrivateKeyWithPassword(encrypted, wrongPassword)
      ).rejects.toThrow(CryptoIntegrityError);
    });

    it('should round-trip: encrypt and decrypt preserves the exact private key', async () => {
      const { publicKey, privateKey } = await service.generateRsaKeyPair();
      const password = 'mySecurePassword';

      // Encrypt private key with password
      const encrypted = await service.encryptPrivateKeyWithPassword(privateKey, password);

      // Decrypt it back
      const decryptedPrivateKey = await service.decryptPrivateKeyWithPassword(encrypted, password);

      // Verify the recovered key works for decryption
      const plaintext = Buffer.from('Test data for round-trip verification');
      const encFile = await service.encryptFile(plaintext, publicKey);
      const decrypted = await service.decryptFile(
        encFile.payload,
        encFile.keyBundle.wrappedAesKey,
        decryptedPrivateKey
      );

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('getPublicKeyFingerprint', () => {
    it('should return a SHA-256 hex string (64 characters)', async () => {
      const { publicKey } = await service.generateRsaKeyPair();

      const fingerprint = service.getPublicKeyFingerprint(publicKey);

      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce the same fingerprint for the same public key', async () => {
      const { publicKey } = await service.generateRsaKeyPair();

      const fp1 = service.getPublicKeyFingerprint(publicKey);
      const fp2 = service.getPublicKeyFingerprint(publicKey);

      expect(fp1).toEqual(fp2);
    });

    it('should produce different fingerprints for different public keys', async () => {
      const keyPair1 = await service.generateRsaKeyPair();
      const keyPair2 = await service.generateRsaKeyPair();

      const fp1 = service.getPublicKeyFingerprint(keyPair1.publicKey);
      const fp2 = service.getPublicKeyFingerprint(keyPair2.publicKey);

      expect(fp1).not.toEqual(fp2);
    });
  });
});
