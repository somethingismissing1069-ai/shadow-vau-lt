import { sanitizeFilename } from './sanitizeFilename';

describe('sanitizeFilename', () => {
  describe('normal filenames pass through unchanged', () => {
    it('should return simple filenames unchanged', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
      expect(sanitizeFilename('report_2024.xlsx')).toBe('report_2024.xlsx');
    });

    it('should preserve filenames with hyphens and underscores', () => {
      expect(sanitizeFilename('my-file_v2.txt')).toBe('my-file_v2.txt');
    });
  });

  describe('path separators are removed', () => {
    it('should remove forward slashes', () => {
      const result = sanitizeFilename('../../etc/passwd');
      expect(result).not.toContain('/');
      expect(result).toBe('etcpasswd');
    });

    it('should remove backslashes', () => {
      const result = sanitizeFilename('..\\..\\Windows\\system32\\config');
      expect(result).not.toContain('\\');
      expect(result).toBe('Windowssystem32config');
    });

    it('should remove mixed path separators', () => {
      const result = sanitizeFilename('path/to\\file.txt');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).toBe('pathtofile.txt');
    });
  });

  describe('null bytes removed', () => {
    it('should remove null bytes from filenames', () => {
      const result = sanitizeFilename('file\0name.txt');
      expect(result).not.toContain('\0');
      expect(result).toBe('filename.txt');
    });

    it('should handle multiple null bytes', () => {
      const result = sanitizeFilename('\0\0test\0.pdf');
      expect(result).not.toContain('\0');
      expect(result).toBe('test.pdf');
    });
  });

  describe('control characters removed', () => {
    it('should remove ASCII control characters (0-31)', () => {
      const result = sanitizeFilename('file\x01\x02\x03name.txt');
      expect(result).toBe('filename.txt');
    });

    it('should remove tab and newline characters', () => {
      const result = sanitizeFilename('file\tna\nme.txt');
      expect(result).toBe('filename.txt');
    });

    it('should remove carriage return', () => {
      const result = sanitizeFilename('test\rfile.doc');
      expect(result).toBe('testfile.doc');
    });
  });

  describe('empty input returns "unnamed_file"', () => {
    it('should return default for empty string', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
    });

    it('should return default for null-like values', () => {
      expect(sanitizeFilename(null as unknown as string)).toBe('unnamed_file');
      expect(sanitizeFilename(undefined as unknown as string)).toBe('unnamed_file');
    });
  });

  describe('all-dangerous-characters input returns "unnamed_file"', () => {
    it('should return default when only path separators', () => {
      expect(sanitizeFilename('//\\\\//')).toBe('unnamed_file');
    });

    it('should return default when only control characters', () => {
      expect(sanitizeFilename('\x00\x01\x02\x03\x04')).toBe('unnamed_file');
    });

    it('should return default when only dots and spaces', () => {
      expect(sanitizeFilename('...')).toBe('unnamed_file');
      expect(sanitizeFilename('   ')).toBe('unnamed_file');
      expect(sanitizeFilename('. . .')).toBe('unnamed_file');
    });

    it('should return default when mix of dangerous characters', () => {
      expect(sanitizeFilename('/\\\x00\x01...')).toBe('unnamed_file');
    });
  });

  describe('extension is preserved', () => {
    it('should preserve common file extensions', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('image.png')).toBe('image.png');
    });

    it('should preserve extension even when name has dangerous chars', () => {
      const result = sanitizeFilename('../secret.txt');
      expect(result).toBe('secret.txt');
    });

    it('should handle multiple dots correctly', () => {
      expect(sanitizeFilename('archive.tar.gz')).toBe('archive.tar.gz');
    });
  });

  describe('leading/trailing dots and spaces stripped', () => {
    it('should strip leading dots', () => {
      expect(sanitizeFilename('...hidden.txt')).toBe('hidden.txt');
    });

    it('should strip trailing dots', () => {
      expect(sanitizeFilename('file.txt...')).toBe('file.txt');
    });

    it('should strip leading spaces', () => {
      expect(sanitizeFilename('   file.txt')).toBe('file.txt');
    });

    it('should strip trailing spaces', () => {
      expect(sanitizeFilename('file.txt   ')).toBe('file.txt');
    });

    it('should strip both leading and trailing dots/spaces', () => {
      expect(sanitizeFilename(' . .document.pdf. . ')).toBe('document.pdf');
    });
  });

  describe('long filenames truncated to 255 chars with extension preserved', () => {
    it('should truncate filenames longer than 255 characters', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });

    it('should preserve extension when truncating', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('should handle truncation without extension', () => {
      const longName = 'a'.repeat(300);
      const result = sanitizeFilename(longName);
      expect(result.length).toBe(255);
    });

    it('should handle very long extension gracefully', () => {
      // Extension > 20 chars won't be preserved (treated as no extension)
      const longName = 'a'.repeat(250) + '.' + 'b'.repeat(25);
      const result = sanitizeFilename(longName);
      expect(result.length).toBe(255);
    });
  });

  describe('unicode filenames preserved', () => {
    it('should preserve unicode characters (non-ASCII)', () => {
      expect(sanitizeFilename('日本語ファイル.txt')).toBe('日本語ファイル.txt');
    });

    it('should preserve emoji in filenames', () => {
      expect(sanitizeFilename('report_📊.pdf')).toBe('report_📊.pdf');
    });

    it('should preserve accented characters', () => {
      expect(sanitizeFilename('café_résumé.doc')).toBe('café_résumé.doc');
    });

    it('should only remove ASCII control characters, not high unicode', () => {
      expect(sanitizeFilename('файл.txt')).toBe('файл.txt');
    });
  });
});
