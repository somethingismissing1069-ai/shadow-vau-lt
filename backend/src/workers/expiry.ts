import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { FileService } from '../services/FileService';
import { EncryptionService } from '../services/EncryptionService';
import { AuditService } from '../services/AuditService';
import { logger } from '../lib/logger';

const EXPIRY_CRON_SCHEDULE = process.env.EXPIRY_CRON_SCHEDULE || '*/5 * * * *';

const encryptionService = new EncryptionService();
const auditService = new AuditService(prisma);
const fileService = new FileService(prisma, encryptionService, auditService);

/**
 * Process all expired files by burning them and recording EXPIRE audit events.
 * Each file cleanup runs in its own transaction via FileService.burnFile to prevent
 * partial failures from affecting other files.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export async function processExpiredFiles(): Promise<void> {
  logger.info('Expiry worker: checking for expired files...');

  const expiredFiles = await prisma.file.findMany({
    where: {
      expiresAt: { lt: new Date() },
      isDeleted: false,
    },
    take: 100, // Process max 100 per run to avoid memory/time issues
  });

  logger.info(`Expiry worker: found ${expiredFiles.length} expired files`);

  for (const file of expiredFiles) {
    try {
      // Each file cleanup in its own transaction via burnFile
      // burnFile handles: delete encrypted_keys, revoke share_links,
      // secure-delete file from disk, mark file as deleted
      await fileService.burnFile(file.id);

      // Record EXPIRE audit event (burnFile records BURN, so we record EXPIRE separately)
      await auditService.recordEvent({
        eventType: 'EXPIRE',
        fileId: file.id,
      });

      logger.info({ fileId: file.id }, 'Expiry worker: cleaned up expired file');
    } catch (error) {
      logger.error({ fileId: file.id, error }, 'Expiry worker: failed to cleanup file');
      // Continue processing other files - don't let one failure stop the rest
    }
  }
}

// Start cron job
const job = cron.schedule(EXPIRY_CRON_SCHEDULE, () => {
  processExpiredFiles().catch((error) => {
    logger.error({ error }, 'Expiry worker: unhandled error in cron job');
  });
});

logger.info(`Expiry worker started with schedule: ${EXPIRY_CRON_SCHEDULE}`);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Expiry worker: received SIGTERM, stopping...');
  job.stop();
  prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Expiry worker: received SIGINT, stopping...');
  job.stop();
  prisma.$disconnect();
  process.exit(0);
});

export { job };
