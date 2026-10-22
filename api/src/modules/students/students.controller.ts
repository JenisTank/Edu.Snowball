import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { unitScope } from '../../common/auth/unit-scope';
import { PrismaService } from '../../common/database/prisma.service';

// ─────────────────────────── STUDENTS ───────────────────────────
@Controller('students')
@UseGuards(AuthGuard)
export class StudentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.student.findMany({
      where: unitScope(req.user, unitId),
      include: {
        programme: { select: { name: true, tierName: true, levelColour: true } },
        batch: { select: { name: true, shift: true } },
        unit: { select: { code: true, name: true } },
      },
      orderBy: { admissionNo: 'asc' },
    });
  }

  @Get(':id')
  one(@Req() req: any, @Param('id') id: string) {
    return this.prisma.student.findFirst({
      where: { id, ...unitScope(req.user) },
      include: {
        programme: true,
        batch: true,
        unit: true,
        feeTransactions: { orderBy: { paymentDate: 'desc' } },
      },
    });
  }
}
