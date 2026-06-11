import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class OAuthService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  /**
   * Step 1: Generate an authorization code for a logged-in user.
   * Called after user completes login on the web.
   */
  async generateAuthCode(userId: string, workId: string): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

    await this.prisma.authCode.create({
      data: {
        code,
        userId,
        workId,
        expiresAt,
        consumed: false,
      },
    });

    return code;
  }

  /**
   * Step 2: Validate and consume an auth code.
   * Returns user info or null if invalid/expired/already consumed.
   */
  async consumeAuthCode(code: string): Promise<{ userId: string; workId: string } | null> {
    // Find the code in database
    const record = await this.prisma.authCode.findUnique({
      where: { code },
    });

    // Check existence
    if (!record) return null;

    // Check if already consumed (one-time use)
    if (record.consumed) {
      // Delete to prevent reuse
      await this.prisma.authCode.delete({ where: { id: record.id } }).catch(() => {});
      return null;
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      // Delete expired code
      await this.prisma.authCode.delete({ where: { id: record.id } }).catch(() => {});
      return null;
    }

    // Mark as consumed (atomic update)
    await this.prisma.authCode.update({
      where: { id: record.id },
      data: { consumed: true },
    });

    return { userId: record.userId, workId: record.workId };
  }

  /**
   * Step 3: Generate an API key for the user identified by the auth code.
   */
  async exchangeCodeForApiKey(code: string, keyName: string): Promise<{ key: string; workId: string } | null> {
    const user = await this.consumeAuthCode(code);
    if (!user) return null;

    // Generate API key
    const randomPart = randomBytes(32).toString('hex');
    const key = `ocean_sk_${randomPart}`;
    const keyHash = createHash('sha256').update(key).digest('hex');

    await this.prisma.apiKey.create({
      data: {
        userId: user.userId,
        key: keyHash,
        name: keyName || 'CLI Login',
        permissions: ['read', 'write', 'execute'],
      },
    });

    return { key, workId: user.workId };
  }
}
