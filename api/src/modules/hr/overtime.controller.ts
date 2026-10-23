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

  /**
   * OT1 (the premium multiplier) is not decided yet, so `multiplier` is allowed
   * to be 0 — and is the default. Hours are still authorised and recorded; they
   * simply carry no premium until the client sets the number. When it lands,
   * only this default changes.
   */
  @Post('overtime') async requestOt(@Body() b: OvertimeRequestDto) {
    if (!b.employeeId || !b.date || !b.expectedMinutes || !b.reason)
      throw new BadRequestException('Complete OT request required');
    const multiplier = Number(b.multiplier ?? 0);
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 3)
      throw new BadRequestException('OT multiplier must be between 0 and 3');
    return this.prisma.overtimeAuthorisation.create({
      data: {
        employeeId: b.employeeId,
        date: new Date(b.date),
        expectedMinutes: Number(b.expectedMinutes),
        reason: b.reason,
        multiplier,
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
