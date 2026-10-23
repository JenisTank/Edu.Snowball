import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';

// ─────────────────────────── AUDIT LOG (read — Founder/AD only) ───────────────────────────
@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  list(@Query('limit') limit?: string) {
    return this.prisma.auditLog.findMany({
      take: Math.min(Number(limit) || 200, 500),
      orderBy: { changedAt: 'desc' },
      include: { changedBy: { select: { fullName: true, email: true, role: true } } },
    });
  }
}
