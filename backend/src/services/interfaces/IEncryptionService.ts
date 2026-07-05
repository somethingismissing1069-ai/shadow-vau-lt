// ─── Crypto Types (mirrored from shared/types) ──────────────────────────────

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;          // 12 bytes, AES-GCM
  authTag: Buffer;     // 16 bytes, GCM authentication tag
}

export interface WrappedKeyBundle {
  wrappedAesKey: string;          // Base64 RSA-OAEP encrypted AES key
  publicKeyFingerprint: string;
}

export interface EncryptFileResult {
  payload: EncryptedPayload;
  keyBundle: WrappedKeyBundle;
}

/**
 * Interface for the Encryption Service.
 * Handles AES-256-GCM encryption/decryption and RSA-4096 key wrapping/unwrapping.
 */
export interface IEncryptionService {
  /**
   * Encrypt a plaintext buffer using AES-256-GCM.
   * Generates a fresh random AES key and IV per invocation.
   * Wraps the AES key using RSA-OAEP-4096 with the recipient's public key.
   *
   * Preconditions:
   *   - plaintext.length > 0
   *   - recipientPublicKey is a valid PEM RSA-4096 public key
   * Postconditions:
   *   - result.payload.iv.length === 12
   *   - result.payload.authTag.length === 16
   *   - result.payload.ciphertext.length === plaintext.length
   *   - result.keyBundle.wrappedAesKey is non-empty Base64 string
   */
  encryptFile(
    plaintext: Buffer,
    recipientPublicKey: string
  ): Promise<EncryptFileResult>;

  /**
   * Decrypt an AES-256-GCM ciphertext.
   * Unwraps the AES key using RSA-OAEP with the recipient's private key,
   * then decrypts and verifies the authentication tag.
   *
   * Preconditions:
   *   - payload.iv.length === 12
   *   - payload.authTag.length === 16
   *   - recipientPrivateKey is valid PEM RSA-4096 private key
   * Postconditions:
   *   - Returns original plaintext if authTag verification passes
   *   - Throws CryptoIntegrityError if authTag verification fails
   *   - Throws KeyUnwrapError if RSA decrypt fails
   */
  decryptFile(
    payload: EncryptedPayload,
    wrappedAesKey: string,
    recipientPrivateKey: string
  ): Promise<Buffer>;

  /**
   * Generate an RSA-4096 key pair for a new user.
   * Postconditions:
   *   - publicKey is PEM SPKI format
   *   - privateKey is PEM PKCS#8 format
   */
  generateRsaKeyPair(): Promise<{ publicKey: string; privateKey: string }>;

  /**
   * Encrypt the user's RSA private key using a key derived from their password.
   * Uses scrypt to derive a 256-bit wrapping key, then encrypts with AES-256-GCM.
   */
  encryptPrivateKeyWithPassword(
    privateKey: string,
    password: string
  ): Promise<string>;

  /**
   * Decrypt the user's stored (password-wrapped) RSA private key.
   * Throws if the password is incorrect (authentication tag mismatch).
   */
  decryptPrivateKeyWithPassword(
    encryptedPrivateKey: string,
    password: string
  ): Promise<string>;

  /**
   * Compute SHA-256 fingerprint of a PEM public key (for audit records).
   */
  getPublicKeyFingerprint(publicKeyPem: string): string;
}
