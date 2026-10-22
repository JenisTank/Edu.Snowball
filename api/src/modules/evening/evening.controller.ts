import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Controller('evening')
@UseGuards(AuthGuard)
export class EveningController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get() list(@Req() r: any) {
    return this.prisma.eveningActivity.findMany({
      where: HO_ROLES.includes(r.user.role) ? {} : { unitId: r.user.unitId },
      include: {
        enrollments: {
          include: {
            student: { select: { firstName: true, lastName: true, admissionNo: true } },
            participant: { select: { fullName: true, guardianPhone: true } },
            payments: true,
          },
        },
        _count: { select: { sessions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── External participants (spec: non-student registration) ──
  @Get('participants')
  participantList(@Req() r: any) {
    return this.prisma.eveningParticipant.findMany({
      where: HO_ROLES.includes(r.user.role) ? {} : { unitId: r.user.unitId },
      include: { enrollments: { include: { activity: { select: { name: true } } } } },
      orderBy: { fullName: 'asc' },
    });
  }

  @Post('participants')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST')
  async createParticipant(@Req() r: any, @Body() b: any) {
    const unitId = HO_ROLES.includes(r.user.role) ? (b.unitId ?? r.user.unitId) : r.user.unitId;
    if (!unitId) throw new BadRequestException('unitId is required for a Head Office user');
    if (!b.fullName?.trim()) throw new BadRequestException("The child's name is required");
    if (!b.guardianPhone?.replace(/[^\d]/g, '')?.length)
      throw new BadRequestException('A guardian phone number is required for the evening centre');
    const x = await this.prisma.eveningParticipant.create({
      data: {
        unitId,
        fullName: b.fullName.trim(),
        dob: b.dob ? new Date(`${b.dob}T00:00:00Z`) : null,
        guardianName: b.guardianName?.trim() || null,
        guardianPhone: b.guardianPhone.trim(),
        school: b.school?.trim() || null,
      },
    });
    await this.audit.log(r, 'evening_participants', x.id, 'INSERT', null, x);
    return x;
  }

  /** Enrol an external child (no Student record involved). */
  @Post('activities/:id/enrol-external')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST')
  async enrolExternal(@Req() r: any, @Param('id') id: string, @Body() b: any) {
    const a = await this.prisma.eveningActivity.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!a) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && a.unitId !== r.user.unitId)
      throw new ForbiddenException();
    if (a._count.enrollments >= a.capacity)
      throw new BadRequestException('Activity capacity reached');
    const participant = await this.prisma.eveningParticipant.findUnique({
      where: { id: b.participantId },
    });
    if (!participant || participant.unitId !== a.unitId)
      throw new BadRequestException('Participant belongs to another unit');
    const existing = await this.prisma.eveningEnrollment.findFirst({
      where: { activityId: id, participantId: participant.id },
    });
    if (existing) throw new BadRequestException('This child is already enrolled');
    const x = await this.prisma.eveningEnrollment.create({
      data: {
        activityId: id,
        participantId: participant.id,
        startDate: new Date(b.startDate || new Date()),
        amountDue: Number(b.amountDue ?? a.fee),
      },
    });
    await this.audit.log(r, 'evening_enrollments', x.id, 'INSERT', null, x);
    return x;
  }

  // ── Session-level attendance ──
  @Get('sessions')
  sessions(
    @Req() r: any,
    @Query('activityId') activityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prisma.eveningSession.findMany({
      where: {
        activity: HO_ROLES.includes(r.user.role) ? {} : { unitId: r.user.unitId },
        ...(activityId ? { activityId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        activity: { select: { name: true, unitId: true } },
        attendance: true,
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  @Post('activities/:id/sessions')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'TEACHER')
  async createSession(@Req() r: any, @Param('id') id: string, @Body() b: any) {
    const a = await this.prisma.eveningActivity.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && a.unitId !== r.user.unitId)
      throw new ForbiddenException();
    if (!b.date) throw new BadRequestException('A date is required');
    const date = new Date(`${b.date}T00:00:00Z`);
    const existing = await this.prisma.eveningSession.findUnique({
      where: { activityId_date: { activityId: id, date } },
    });
    if (existing) throw new BadRequestException('A session already exists for that date');
    const x = await this.prisma.eveningSession.create({
      data: {
        activityId: id,
        date,
        startTime: b.startTime || null,
        endTime: b.endTime || null,
        topic: b.topic?.trim() || null,
      },
    });
    await this.audit.log(r, 'evening_sessions', x.id, 'INSERT', null, x);
    return x;
  }

  /**
   * Mark an evening session. Every enrolled child is listed; anyone not marked
   * defaults to ABSENT for the same child-safety reason as the main register.
   */
  @Get('sessions/:id/roster')
  async roster(@Req() r: any, @Param('id') id: string) {
    const session = await this.prisma.eveningSession.findUnique({
      where: { id },
      include: {
        activity: {
          include: {
            enrollments: {
              where: { status: 'ACTIVE' },
              include: {
                student: {
                  select: { id: true, firstName: true, lastName: true, admissionNo: true },
                },
                participant: { select: { id: true, fullName: true, guardianPhone: true } },
              },
            },
          },
        },
        attendance: true,
      },
    });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.activity.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const marked = new Map<string, any>(
      session.attendance.map((a: any) => [a.studentId ?? a.participantId, a]),
    );
    return {
      session: {
        id: session.id,
        date: session.date,
        topic: session.topic,
        activity: session.activity.name,
        status: session.status,
      },
      roster: session.activity.enrollments.map((e: any) => ({
        studentId: e.studentId,
        participantId: e.participantId,
        name: e.student
          ? `${e.student.firstName} ${e.student.lastName}`
          : (e.participant?.fullName ?? 'Participant'),
        admissionNo: e.student?.admissionNo ?? null,
        external: !e.student,
        status: marked.get(e.studentId ?? e.participantId)?.status ?? 'ABSENT',
        marked: !!marked.get(e.studentId ?? e.participantId)?.markedAt,
      })),
    };
  }

  @Post('sessions/:id/attendance')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'TEACHER')
  async mark(@Req() r: any, @Param('id') id: string, @Body() b: any) {
    const session = await this.prisma.eveningSession.findUnique({
      where: { id },
      include: { activity: { select: { unitId: true } } },
    });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.activity.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const entries: any[] = Array.isArray(b?.entries) ? b.entries : [];
    if (!entries.length) throw new BadRequestException('At least one entry is required');

    for (const e of entries) {
      if (!['PRESENT', 'ABSENT'].includes(e.status))
        throw new BadRequestException('Status must be PRESENT or ABSENT');
      if (!e.studentId && !e.participantId)
        throw new BadRequestException('Each entry needs a studentId or participantId');
      const key = e.studentId
        ? { sessionId_studentId: { sessionId: id, studentId: e.studentId } }
        : { sessionId_participantId: { sessionId: id, participantId: e.participantId } };
      await this.prisma.eveningAttendance.upsert({
        where: key as any,
        update: { status: e.status, markedById: r.user.sub, markedAt: new Date() },
        create: {
          sessionId: id,
          studentId: e.studentId ?? null,
          participantId: e.participantId ?? null,
          status: e.status,
          markedById: r.user.sub,
          markedAt: new Date(),
        },
      });
    }
    await this.prisma.eveningSession.update({ where: { id }, data: { status: 'HELD' } });
    await this.audit.log(r, 'evening_attendance', id, 'UPDATE', null, { marked: entries.length });
    return { ok: true, marked: entries.length };
  }

  @Delete('sessions/:id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async cancelSession(@Req() r: any, @Param('id') id: string) {
    const session = await this.prisma.eveningSession.findUnique({
      where: { id },
      include: { activity: { select: { unitId: true } } },
    });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.activity.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const x = await this.prisma.eveningSession.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log(
      r,
      'evening_sessions',
      id,
      'UPDATE',
      { status: session.status },
      {
        status: 'CANCELLED',
      },
    );
    return x;
  }
  @Post('activities') @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD') async activity(
    @Req() r: any,
    @Body() b: any,
  ) {
    const unitId = HO_ROLES.includes(r.user.role) ? b.unitId : r.user.unitId;
    if (!unitId || !b.name || Number(b.fee) < 0)
      throw new BadRequestException('Unit, name and fee required');
    const x = await this.prisma.eveningActivity.create({
      data: {
        unitId,
        name: b.name,
        schedule: b.schedule || null,
        fee: Number(b.fee),
        capacity: Number(b.capacity || 20),
      },
    });
    await this.audit.log(r, 'evening_activities', x.id, 'INSERT', null, x);
    return x;
  }
  @Post('activities/:id/enrol') async enrol(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    const a = await this.prisma.eveningActivity.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!a) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && a.unitId !== r.user.unitId)
      throw new ForbiddenException();
    if (a._count.enrollments >= a.capacity)
      throw new BadRequestException('Activity capacity reached');
    if (!b.studentId)
      throw new BadRequestException('studentId is required (use enrol-external for guests)');
    const student = await this.prisma.student.findUnique({ where: { id: b.studentId } });
    if (!student || student.unitId !== a.unitId)
      throw new BadRequestException('Student belongs to another unit');
    return this.prisma.eveningEnrollment.create({
      data: {
        activityId: id,
        studentId: b.studentId,
        startDate: new Date(b.startDate || new Date()),
        amountDue: Number(b.amountDue ?? a.fee),
      },
    });
  }
  @Post('enrolments/:id/pay')
  @Roles('FOUNDER', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST')
  async pay(@Req() r: any, @Param('id') id: string, @Body() b: any) {
    const e = await this.prisma.eveningEnrollment.findUnique({
      where: { id },
      include: { activity: true, payments: true },
    });
    if (!e) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && e.activity.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const paid = e.payments.reduce((n: number, p: any) => n + Number(p.amount), 0),
      amount = Number(b.amount);
    if (amount <= 0 || paid + amount > Number(e.amountDue))
      throw new BadRequestException('Invalid payment amount');
    const count = await this.prisma.eveningPayment.count();
    const receiptNo = `BB-${e.activity.unitId.slice(0, 4).toUpperCase()}-EVE-2627-${String(count + 1).padStart(4, '0')}`;
    const x = await this.prisma.eveningPayment.create({
      data: {
        enrollmentId: id,
        amount,
        mode: b.mode || 'CASH',
        reference: b.reference || null,
        receiptNo,
        collectedById: r.user.sub,
      },
    });
    await this.audit.log(r, 'evening_payments', x.id, 'INSERT', null, x);
    return x;
  }
}
