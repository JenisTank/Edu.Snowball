import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// ─────────────────────────── AUDIT SERVICE (Rule 3: every mutation logged) ───────────────────────────
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    req: any,
    tableName: string,
    recordId: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    oldData: any,
    newData: any,
  ) {
    const scrub = (o: any) => {
      if (!o) return o;
      const c = { ...o };
      delete c.passwordHash; // never persist hashes in audit trail
      return c;
    };
    await this.prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action,
        oldData: scrub(oldData) ?? undefined,
        newData: scrub(newData) ?? undefined,
        changedById: req.user?.sub ?? null,
        ipAddress:
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      },
    });
  }
}
