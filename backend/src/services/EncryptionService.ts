import crypto from 'crypto';
import {
  IEncryptionService,
  EncryptedPayload,
  EncryptFileResult,
} from './interfaces/IEncryptionService';
import { CryptoIntegrityError, KeyUnwrapError } from '../errors';

/**
 * EncryptionService implements AES-256-GCM file encryption/decryption
 * with RSA-4096 key wrapping, RSA key pair generation, and password-based
 * private key protection.
 */
export class EncryptionService implements IEncryptionService {
  /**
   * Encrypt a plaintext buffer using AES-256-GCM.
   * Generates a fresh random AES key and IV per invocation.
   * Wraps the AES key using RSA-OAEP-4096 with the recipient's public key.
   */
  async encryptFile(
    plaintext: Buffer,
    recipientPublicKey: string
  ): Promise<EncryptFileResult> {
    // Generate fresh AES-256 key (32 bytes) and IV (12 bytes) using CSPRNG
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes

    // Wrap AES key with RSA-OAEP using recipient's public key
    const wrappedAesKey = crypto.publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );

    // Compute public key fingerprint
    const publicKeyFingerprint = this.getPublicKeyFingerprint(recipientPublicKey);

    return {
      payload: {
        ciphertext,
        iv,
        authTag,
      },
      keyBundle: {
        wrappedAesKey: wrappedAesKey.toString('base64'),
        publicKeyFingerprint,
      },
    };
  }

  /**
   * Decrypt an AES-256-GCM ciphertext.
   * Unwraps the AES key using RSA-OAEP with the recipient's private key,
   * then decrypts and verifies the authentication tag.
   */
  async decryptFile(
    payload: EncryptedPayload,
    wrappedAesKey: string,
    recipientPrivateKey: string
  ): Promise<Buffer> {
    // Unwrap AES key using RSA-OAEP with recipient's private key
    let aesKey: Buffer;
    try {
      aesKey = crypto.privateDecrypt(
        {
          key: recipientPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(wrappedAesKey, 'base64')
      );
    } catch (err) {
      throw new KeyUnwrapError('Failed to unwrap AES key with the provided private key');
    }

    // Decrypt with AES-256-GCM and verify auth tag
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, payload.iv);
      decipher.setAuthTag(payload.authTag);
      const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
      return plaintext;
    } catch (err) {
      throw new CryptoIntegrityError('Ciphertext integrity check failed: authentication tag mismatch');
    }
  }

  /**
   * Generate an RSA-4096 key pair for a new user.
   * Returns PEM-encoded keys: SPKI format for public, PKCS#8 for private.
   */
  async generateRsaKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: 4096,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
        },
        (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
          } else {
            resolve({ publicKey, privateKey });
          }
        }
      );
    });
  }

  /**
   * Encrypt the user's RSA private key using a key derived from their password.
   * Uses scrypt to derive a 256-bit wrapping key, then encrypts with AES-256-GCM.
   * Returns a JSON string containing { encrypted, iv, authTag, salt } all base64-encoded.
   */
  async encryptPrivateKeyWithPassword(
    privateKey: string,
    password: string
  ): Promise<string> {
    // Generate a random salt for key derivation
    const salt = crypto.randomBytes(32);

    // Derive 32-byte wrapping key from password using scrypt
    const derivedKey = crypto.scryptSync(password, salt, 32, {
      N: 16384,
      r: 8,
      p: 1,
    });

    // Generate random IV for AES-256-GCM
    const iv = crypto.randomBytes(12);

    // Encrypt the private key with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(privateKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Return as JSON string with all components base64-encoded
    return JSON.stringify({
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    });
  }

  /**
   * Decrypt the user's stored (password-wrapped) RSA private key.
   * Throws CryptoIntegrityError if the password is incorrect (auth tag mismatch).
   */
  async decryptPrivateKeyWithPassword(
    encryptedPrivateKey: string,
    password: string
  ): Promise<string> {
    // Parse the stored JSON envelope
    const { encrypted, iv, authTag, salt } = JSON.parse(encryptedPrivateKey);

    // Derive the same wrapping key from the password and stored salt
    const derivedKey = crypto.scryptSync(
      password,
      Buffer.from(salt, 'base64'),
      32,
      {
        N: 16384,
        r: 8,
        p: 1,
      }
    );

    // Decrypt with AES-256-GCM
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        derivedKey,
        Buffer.from(iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (err) {
      throw new CryptoIntegrityError(
        'Failed to decrypt private key: incorrect password or corrupted data'
      );
    }
  }

  /**
   * Compute SHA-256 fingerprint of a PEM public key.
   * Converts the PEM to DER format, then returns the SHA-256 hash as a hex string.
   */
  getPublicKeyFingerprint(publicKeyPem: string): string {
    // Create a KeyObject from PEM and export as DER
    const keyObject = crypto.createPublicKey(publicKeyPem);
    const derBuffer = keyObject.export({ type: 'spki', format: 'der' });

    // Compute SHA-256 hash of DER-encoded public key
    const hash = crypto.createHash('sha256').update(derBuffer).digest('hex');
    return hash;
  }
}
