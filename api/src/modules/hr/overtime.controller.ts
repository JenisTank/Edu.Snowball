import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ApproveOvertimeDto, OvertimeRequestDto } from './hr.dto';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];

/** Overtime authorisation — no OT is paid without pre-approval. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class OvertimeController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get('overtime') overtime() {
    return this.prisma.overtimeAuthorisation.findMany({
      include: { employee: { select: { employeeNo: true, fullName: true } } },
      orderBy: { date: 'desc' },
    });
  }

  @Post('overtime') async requestOt(@Body() b: OvertimeRequestDto) {
    if (!b.employeeId || !b.date || !b.expectedMinutes || !b.reason || Number(b.multiplier) <= 0)
      throw new BadRequestException('Complete OT request required');
    return this.prisma.overtimeAuthorisation.create({
      data: {
        employeeId: b.employeeId,
        date: new Date(b.date),
        expectedMinutes: Number(b.expectedMinutes),
        reason: b.reason,
        multiplier: Number(b.multiplier),
      },
    });
  }

  @Patch('overtime/:id/approve') async approveOt(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: ApproveOvertimeDto,
  ) {
    const old = await this.prisma.overtimeAuthorisation.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    const att = await this.prisma.staffAttendance.findUnique({
      where: { employeeId_date: { employeeId: old.employeeId, date: old.date } },
    });
    const actual = att
      ? Math.max(
          0,
          att.workedMinutes -
            ((
              await this.prisma.employeeShift.findFirst({
                where: {
                  employeeId: old.employeeId,
                  effectiveFrom: { lte: old.date },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: old.date } }],
                },
                include: { shift: true },
                orderBy: { effectiveFrom: 'desc' },
              })
            )?.shift.workingMinutes || 0),
        )
      : 0;
    const r = await this.prisma.overtimeAuthorisation.update({
      where: { id },
      data: {
        status: b.approved ? 'APPROVED' : 'REJECTED',
        approvedById: req.user.sub,
        approvedAt: new Date(),
        actualMinutes: actual,
        eligibleMinutes: b.approved ? Math.min(actual, old.expectedMinutes) : 0,
      },
    });
    await this.audit.log(req, 'overtime_authorisations', id, 'UPDATE', old, r);
    return r;
  }
}
