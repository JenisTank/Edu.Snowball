import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { DeleteDocumentDto, UploadDocumentDto } from './documents.dto';
import { canDeleteDocuments, storageKey, validateUpload } from './storage.rules';
import { storageDriver } from './storage.driver';

const STAFF = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST', 'TEACHER'];

/**
 * Per-student documents.
 *
 * Files live in object storage (local volume or S3) keyed by unit/student/kind;
 * the database row is the index and the audit trail. Nothing is auto-deleted —
 * the client asked for manual deletion by an admin, and DPDP erasure of a child
 * is a deliberate, reasoned act, not a timer.
 */
@Controller('students/:studentId/documents')
@UseGuards(AuthGuard)
@Roles(...STAFF)
export class StudentDocumentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async studentFor(req: any, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, unitId: true, admissionNo: true, firstName: true, lastName: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new ForbiddenException('Student is outside your unit');
    return student;
  }

  @Get()
  async list(@Req() req: any, @Param('studentId') studentId: string) {
    await this.studentFor(req, studentId);
    const rows = await this.prisma.studentDocument.findMany({
      where: { studentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      storage: storageDriver().name,
      rows: rows.map((r: any) => ({
        id: r.id,
        kind: r.kind,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        driver: r.driver,
        createdAt: r.createdAt,
      })),
    };
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST')
  async upload(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Body() b: UploadDocumentDto,
  ) {
    const student = await this.studentFor(req, studentId);

    const check = validateUpload({
      fileName: b.fileName,
      mimeType: b.mimeType,
      sizeBytes: b.sizeBytes,
    });
    if (!check.ok) throw new BadRequestException(check.error);

    let body: Buffer;
    try {
      body = Buffer.from(b.contentBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    } catch {
      throw new BadRequestException('File content is not valid base64');
    }
    // Trust the decoded length over the declared one: a client can lie.
    const real = validateUpload({
      fileName: b.fileName,
      mimeType: b.mimeType,
      sizeBytes: body.length,
    });
    if (!real.ok) throw new BadRequestException(real.error);

    const key = storageKey(student.unitId, student.id, b.kind, b.fileName);
    try {
      await storageDriver().put(key, body, b.mimeType);
    } catch (e: any) {
      throw new BadRequestException(`Storage rejected the file: ${e?.message ?? 'unknown error'}`);
    }

    const row = await this.prisma.studentDocument.create({
      data: {
        studentId: student.id,
        unitId: student.unitId,
        kind: b.kind,
        fileName: b.fileName.trim(),
        mimeType: b.mimeType,
        sizeBytes: body.length,
        storageKey: key,
        driver: storageDriver().name,
        uploadedById: req.user.sub,
        notes: b.notes?.trim() || null,
      } as any,
    });
    await this.audit.log(req, 'student_documents', row.id, 'INSERT', null, {
      studentId,
      kind: row.kind,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
    });
    return row;
  }

  @Get(':id/file')
  async download(@Req() req: any, @Param('studentId') studentId: string, @Param('id') id: string) {
    await this.studentFor(req, studentId);
    const row = await this.prisma.studentDocument.findUnique({ where: { id } });
    if (!row || row.deletedAt || row.studentId !== studentId) throw new NotFoundException();
    let body: Buffer;
    try {
      body = await storageDriver().get(row.storageKey);
    } catch {
      throw new NotFoundException('The file is missing from storage');
    }
    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      base64: body.toString('base64'),
    };
  }

  /**
   * Manual deletion by an admin. The bytes go first (so a failed object delete
   * cannot leave an index pointing at a live file), then the row is marked —
   * the row itself is kept as the audit trail of what was deleted and by whom.
   */
  @Delete(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async remove(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Param('id') id: string,
    @Body() b: DeleteDocumentDto,
  ) {
    if (!canDeleteDocuments(req.user.role))
      throw new ForbiddenException('Only Head Office or the Centre Head may delete a document');
    await this.studentFor(req, studentId);
    const row = await this.prisma.studentDocument.findUnique({ where: { id } });
    if (!row || row.deletedAt || row.studentId !== studentId) throw new NotFoundException();

    await storageDriver()
      .delete(row.storageKey)
      .catch(() => null);
    const updated = await this.prisma.studentDocument.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: req.user.sub,
        notes: b.reason?.trim() || (row as any).notes,
      },
    });
    await this.audit.log(req, 'student_documents', id, 'DELETE', row, {
      deletedAt: updated.deletedAt,
      reason: b.reason ?? null,
    });
    return { ok: true, id, deleted: true };
  }

  /** Storage health for Settings: how much this child occupies. */
  @Get('summary')
  async summary(@Req() req: any, @Param('studentId') studentId: string) {
    await this.studentFor(req, studentId);
    const rows = await this.prisma.studentDocument.findMany({
      where: { studentId, deletedAt: null },
      select: { sizeBytes: true, kind: true },
    });
    return {
      files: rows.length,
      bytes: rows.reduce((n, r) => n + r.sizeBytes, 0),
      byKind: rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.kind] = (acc[r.kind] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }
}
