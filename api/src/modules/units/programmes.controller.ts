import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { PrismaService } from '../../common/database/prisma.service';

// ─────────────────────────── PROGRAMMES ───────────────────────────
@Controller('programmes')
@UseGuards(AuthGuard)
export class ProgrammesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.programme.findMany({ orderBy: { sortOrder: 'asc' } });
  }
}
