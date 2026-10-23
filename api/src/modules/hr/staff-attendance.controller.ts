import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';
import { AttendanceCorrectionDto } from './hr.dto';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];

/** Staff attendance import, exceptions and corrections. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class StaffAttendanceController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Post('attendance/import') @UseInterceptors(FileInterceptor('file')) async importAttendance(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('CSV or Excel file required');
    let rows: any[] = [];
    try {
      const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } catch {
      throw new BadRequestException('Unable to parse attendance file');
    }
    const batch = await this.prisma.attendanceImport.create({
      data: {
        fileName: file.originalname,
        source: /csv/i.test(file.originalname) ? 'CSV' : 'BIOMETRIC_EXCEL',
        totalRows: rows.length,
        importedById: req.user.sub,
      },
    });
    let errors = 0;
    for (const x of rows) {
      const employeeNo = String(x.employeeNo || x['Employee No'] || x.code || '').trim();
      const employee = await this.prisma.employee.findUnique({ where: { employeeNo } });
      if (!employee) {
        errors++;
        continue;
      }
      const date = new Date(x.date || x.Date);
      const first = x.firstIn || x['First In'];
      const last = x.lastOut || x['Last Out'];
      const round = (d: any) => {
        const v = new Date(`${date.toISOString().slice(0, 10)}T${d}`);
        v.setMinutes(Math.round(v.getMinutes() / 5) * 5, 0, 0);
        return v;
      };
      const firstIn = first ? round(first) : null,
        lastOut = last ? round(last) : null;
      const exception =
        !firstIn || !lastOut ? 'MISSING_PUNCH' : lastOut <= firstIn ? 'INVALID_PUNCH_ORDER' : null;
      const worked =
        firstIn && lastOut && !exception
          ? Math.max(0, Math.round((+lastOut - +firstIn) / 60000))
          : 0;
      await this.prisma.staffAttendance.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          employeeId: employee.id,
          date,
          firstIn,
          lastOut,
          workedMinutes: worked,
          status: exception ? 'EXCEPTION' : 'PRESENT',
          exception,
          importId: batch.id,
        },
        update: {
          firstIn,
          lastOut,
          workedMinutes: worked,
          status: exception ? 'EXCEPTION' : 'PRESENT',
          exception,
          exceptionResolved: false,
          importId: batch.id,
        },
      });
    }
    await this.prisma.attendanceImport.update({
      where: { id: batch.id },
      data: { errorRows: errors },
    });
    return { ...batch, errorRows: errors };
  }

  @Get('attendance') attendance(@Query('month') month?: string) {
    const m = month || new Date().toISOString().slice(0, 7),
      from = new Date(`${m}-01`),
      to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    return this.prisma.staffAttendance.findMany({
      where: { date: { gte: from, lt: to } },
      include: { employee: { select: { employeeNo: true, fullName: true } } },
      orderBy: [{ date: 'desc' }],
    });
  }

  @Patch('attendance/:id/resolve') async resolveAttendance(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: AttendanceCorrectionDto,
  ) {
    if (!b.reason?.trim()) throw new BadRequestException('Correction reason required');
    const old = await this.prisma.staffAttendance.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    const firstIn = b.firstIn ? new Date(b.firstIn) : old.firstIn,
      lastOut = b.lastOut ? new Date(b.lastOut) : old.lastOut;
    const worked = firstIn && lastOut ? Math.max(0, Math.round((+lastOut - +firstIn) / 60000)) : 0;
    const r = await this.prisma.staffAttendance.update({
      where: { id },
      data: {
        firstIn,
        lastOut,
        workedMinutes: worked,
        exception: null,
        exceptionResolved: true,
        status: 'PRESENT',
        correctionReason: b.reason,
      },
    });
    await this.audit.log(req, 'staff_attendance', id, 'UPDATE', old, r);
    return r;
  }
}
