import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import {
  BookPtmSlotDto,
  CreatePtmSessionDto,
  GeneratePtmSlotsDto,
  UpdatePtmRecordDto,
} from './ptm.dto';

@Controller('ptm')
@UseGuards(AuthGuard)
export class PtmController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get() list(@Req() r: any) {
    return this.prisma.ptmSession.findMany({
      where: HO_ROLES.includes(r.user.role) ? {} : { unitId: r.user.unitId },
      include: {
        records: {
          include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }
  @Post() @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR') async create(
    @Req() r: any,
    @Body() b: any,
  ) {
    const unitId = HO_ROLES.includes(r.user.role) ? b.unitId : r.user.unitId;
    if (!unitId || !b.title || !b.scheduledAt)
      throw new BadRequestException('Unit, title and date required');
    const students = await this.prisma.student.findMany({
      where: { unitId, ...(b.batchId ? { batchId: b.batchId } : {}) },
      select: { id: true },
    });
    const x = await this.prisma.ptmSession.create({
      data: {
        unitId,
        batchId: b.batchId || null,
        title: b.title,
        scheduledAt: new Date(b.scheduledAt),
        records: { create: students.map((s: any) => ({ studentId: s.id })) },
      },
      include: { records: true },
    });
    await this.audit.log(r, 'ptm_sessions', x.id, 'INSERT', null, x);
    return x;
  }
  // ── Session roll-up: the class-wise view the Centre Head actually uses ──
  @Get('session/:id/summary')
  async summary(@Req() r: any, @Param('id') id: string) {
    const session = await this.prisma.ptmSession.findUnique({
      where: { id },
      include: {
        records: {
          include: {
            student: {
              select: {
                firstName: true,
                lastName: true,
                admissionNo: true,
                batch: { select: { id: true, name: true } },
              },
            },
          },
        },
        slots: { orderBy: { startTime: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.unitId !== r.user.unitId)
      throw new ForbiddenException();

    type BatchRollup = {
      batch: string;
      invited: number;
      attended: number;
      students: {
        recordId: string;
        studentId: string;
        name: string;
        admissionNo: string;
        attended: boolean;
        notes: string | null;
      }[];
    };
    const batches = new Map<string, BatchRollup>();
    for (const rec of session.records) {
      const key = rec.student.batch?.id ?? 'unassigned';
      const row: BatchRollup = batches.get(key) ?? {
        batch: rec.student.batch?.name ?? 'Unassigned',
        invited: 0,
        attended: 0,
        students: [],
      };
      row.invited += 1;
      if (rec.attended) row.attended += 1;
      row.students.push({
        recordId: rec.id,
        studentId: rec.studentId,
        name: `${rec.student.firstName} ${rec.student.lastName}`,
        admissionNo: rec.student.admissionNo,
        attended: rec.attended,
        notes: rec.teacherNotes,
      });
      batches.set(key, row);
    }

    const invited = session.records.length;
    const attended = session.records.filter((x: any) => x.attended).length;
    return {
      session: {
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduledAt,
        status: session.status,
      },
      invited,
      attended,
      attendancePct: invited ? Math.round((attended / invited) * 1000) / 10 : 0,
      slots: session.slots,
      bookedSlots: session.slots.filter((x: any) => x.studentId).length,
      batches: [...batches.values()].sort((a, b) => a.batch.localeCompare(b.batch)),
    };
  }

  /**
   * Student-wise view: every meeting this child was invited to, whether the
   * family attended, and the slot they hold. Staff see their own unit only; a
   * parent may read their own children (the portal uses `/parents/child/:id/ptm`
   * for the richer card, but this keeps the guarantee in one place).
   */
  @Get('student/:studentId')
  async student(@Req() r: any, @Param('studentId') studentId: string) {
    const isParent = r.user.role === 'PARENT';
    if (isParent && !(r.user.studentIds ?? []).includes(studentId))
      throw new ForbiddenException('Not your child');
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true, unitId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!isParent && !HO_ROLES.includes(r.user.role) && student.unitId !== r.user.unitId)
      throw new ForbiddenException();

    const [records, slots] = await Promise.all([
      this.prisma.ptmRecord.findMany({
        where: { studentId },
        include: {
          session: { select: { id: true, title: true, scheduledAt: true, unitId: true } },
        },
        orderBy: { session: { scheduledAt: 'desc' } },
        take: 50,
      }),
      this.prisma.ptmSlot.findMany({
        where: { studentId },
        include: { session: { select: { id: true } } },
        orderBy: { startTime: 'asc' },
        take: 50,
      }),
    ]);

    const now = Date.now();
    const meetings = records.map((rec: any) => {
      const slot = slots.find((x: any) => x.session.id === rec.session.id) ?? null;
      return {
        id: rec.id,
        sessionId: rec.session.id,
        title: rec.session.title,
        scheduledAt: rec.session.scheduledAt,
        attended: rec.attended,
        parentNames: rec.parentNames,
        teacherNotes: rec.teacherNotes,
        signedFormUrl: rec.signedFormUrl,
        slot: slot ? { id: slot.id, startTime: slot.startTime, endTime: slot.endTime } : null,
      };
    });

    const upcoming = slots.find((x: any) => new Date(x.startTime).getTime() >= now) ?? null;
    return {
      student,
      meetings,
      upcomingSlot: upcoming
        ? { id: upcoming.id, startTime: upcoming.startTime, endTime: upcoming.endTime }
        : null,
      stats: {
        invited: meetings.length,
        attended: meetings.filter((m: any) => m.attended).length,
      },
    };
  }

  // ── Per-parent slot booking ──
  @Post(':id/slots')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async generateSlots(@Req() r: any, @Param('id') id: string, @Body() b: GeneratePtmSlotsDto) {
    const session = await this.prisma.ptmSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const count = Math.min(60, Math.max(1, Number(b.count) || 12));
    const minutes = Math.min(60, Math.max(5, Number(b.minutes) || 15));
    const start = b.startTime ? new Date(b.startTime) : new Date(session.scheduledAt);

    const created: any[] = [];
    for (let i = 0; i < count; i++) {
      const from = new Date(start.getTime() + i * minutes * 60_000);
      const to = new Date(from.getTime() + minutes * 60_000);
      const slot = await this.prisma.ptmSlot
        .upsert({
          where: { sessionId_startTime: { sessionId: id, startTime: from } },
          update: { endTime: to },
          create: { sessionId: id, startTime: from, endTime: to },
        })
        .catch(() => null);
      if (slot) created.push(slot);
    }
    await this.audit.log(r, 'ptm_slots', id, 'INSERT', null, { slots: created.length, minutes });
    return { ok: true, created: created.length, slots: created };
  }

  @Get(':id/slots')
  async slots(@Req() r: any, @Param('id') id: string) {
    const session = await this.prisma.ptmSession.findUnique({
      where: { id },
      include: { slots: { orderBy: { startTime: 'asc' } } },
    });
    if (!session) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && session.unitId !== r.user.unitId)
      throw new ForbiddenException();
    return session.slots;
  }

  /**
   * Book a slot. A parent can only book for their own child and may hold one
   * slot per session; staff can book on a family's behalf over the phone.
   */
  @Post('slots/:slotId/book')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'PARENT')
  async book(@Req() r: any, @Param('slotId') slotId: string, @Body() b: BookPtmSlotDto) {
    const slot = await this.prisma.ptmSlot.findUnique({
      where: { id: slotId },
      include: { session: { select: { id: true, unitId: true } } },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.studentId) throw new BadRequestException('That slot is already taken');
    const isParent = r.user.role === 'PARENT';
    const studentId = b.studentId;
    if (isParent && !r.user.studentIds?.includes(studentId))
      throw new ForbiddenException('Not your child');
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (!isParent && student.unitId !== slot.session.unitId)
      throw new BadRequestException('Student belongs to another unit');
    if (isParent && student.unitId !== slot.session.unitId)
      throw new ForbiddenException('This session is not at your centre');

    const clash = await this.prisma.ptmSlot.findFirst({
      where: { sessionId: slot.session.id, studentId },
    });
    if (clash) throw new BadRequestException('You already have a slot for this session');

    const updated = await this.prisma.ptmSlot.update({
      where: { id: slotId },
      data: {
        studentId,
        bookedAt: new Date(),
        bookedById: r.user.sub,
        notes: b.notes?.trim() || null,
      },
    });
    await this.audit.log(r, 'ptm_slots', slotId, 'UPDATE', { studentId: null }, { studentId });
    return updated;
  }

  @Post('slots/:slotId/release')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'PARENT')
  async release(@Req() r: any, @Param('slotId') slotId: string) {
    const slot = await this.prisma.ptmSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (r.user.role === 'PARENT' && !r.user.studentIds?.includes(slot.studentId))
      throw new ForbiddenException('Not your child');
    const updated = await this.prisma.ptmSlot.update({
      where: { id: slotId },
      data: { studentId: null, bookedAt: null, bookedById: null, notes: null },
    });
    await this.audit.log(
      r,
      'ptm_slots',
      slotId,
      'UPDATE',
      { studentId: slot.studentId },
      { studentId: null },
    );
    return updated;
  }

  @Patch('record/:id') async record(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: UpdatePtmRecordDto,
  ) {
    const old = await this.prisma.ptmRecord.findUnique({
      where: { id },
      include: { session: true },
    });
    if (!old) throw new NotFoundException();
    if (!HO_ROLES.includes(r.user.role) && old.session.unitId !== r.user.unitId)
      throw new ForbiddenException();
    const x = await this.prisma.ptmRecord.update({
      where: { id },
      data: {
        // Partial update: a bare "mark attended" toggle must not erase notes.
        ...(b.attended === undefined ? {} : { attended: b.attended }),
        ...(b.parentNames === undefined ? {} : { parentNames: b.parentNames || null }),
        ...(b.teacherNotes === undefined ? {} : { teacherNotes: b.teacherNotes || null }),
        ...(b.signedFormUrl === undefined ? {} : { signedFormUrl: b.signedFormUrl || null }),
        recordedById: r.user.sub,
        recordedAt: new Date(),
      },
    });
    await this.audit.log(r, 'ptm_records', id, 'UPDATE', old, x);
    return x;
  }
}
