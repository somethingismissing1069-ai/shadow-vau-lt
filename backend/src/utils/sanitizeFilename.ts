/**
 * Sanitize a filename by removing path separators, null bytes, control characters,
 * leading/trailing dots and spaces. Truncates to 255 chars preserving extension.
 * Returns a safe default if the result is empty.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 11.3
 */
export function sanitizeFilename(input: string): string {
  if (!input || typeof input !== 'string') {
    return 'unnamed_file';
  }

  // Remove path separators (/ and \)
  let sanitized = input.replace(/[/\\]/g, '');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters (ASCII 0-31)
  sanitized = sanitized.replace(/[\x00-\x1F]/g, '');

  // Strip leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');

  // If result is empty, return safe default
  if (sanitized.length === 0) {
    return 'unnamed_file';
  }

  // Truncate to 255 characters, preserving extension if possible
  const MAX_LENGTH = 255;
  if (sanitized.length > MAX_LENGTH) {
    const lastDot = sanitized.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = sanitized.substring(lastDot);
      // Only preserve extension if it's reasonable length (≤20 chars)
      if (ext.length <= 20) {
        const nameLength = MAX_LENGTH - ext.length;
        sanitized = sanitized.substring(0, nameLength) + ext;
      } else {
        sanitized = sanitized.substring(0, MAX_LENGTH);
      }
    } else {
      sanitized = sanitized.substring(0, MAX_LENGTH);
    }
  }

  return sanitized;
}
