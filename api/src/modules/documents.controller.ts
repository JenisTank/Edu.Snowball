import {
  Body, Controller, Delete, Get, Module, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthGuard, Roles, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';

// ─────────────────────────────────────────────────────────────
// Child document vault (Slice 6)
// Files are written under STORAGE_DIR (a docker volume in production, never
// inside the repo). Each row carries a visibility flag:
//   PARENT → appears in the parent portal vault
//   STAFF  → internal only, never served by /api/parent/*
// ─────────────────────────────────────────────────────────────

export const STORAGE_DIR = process.env.STORAGE_DIR ?? path.resolve(process.cwd(), 'storage');
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const DOC_TYPES = ['BIRTH_CERTIFICATE', 'AADHAAR', 'PHOTO', 'MEDICAL', 'ADMISSION_FORM', 'RECEIPT', 'CERTIFICATE', 'OTHER'];
const MANAGE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];

// Shared by the staff download route and the parent vault route.
export function readDocument(doc: { storageKey: string; fileName: string; mimeType: string }, res: any) {
  const full = path.join(STORAGE_DIR, doc.storageKey);
  if (!full.startsWith(STORAGE_DIR) || !fs.existsSync(full)) throw new NotFoundException('File missing from storage');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return fs.createReadStream(full).pipe(res);
}

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('types')
  types() {
    return DOC_TYPES;
  }

  @Get()
  async list(@Req() req: any, @Query('studentId') studentId?: string, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role) ? (unitId ? { unitId } : {}) : { unitId: req.user.unitId };
    return this.prisma.document.findMany({
      where: { ...scope, ...(studentId ? { studentId } : {}) },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
  }

  @Post('upload')
  @Roles(...MANAGE_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(@Req() req: any, @UploadedFile() file: any, @Body() b: { studentId: string; type?: string; title?: string; visibility?: string }) {
    if (!file) throw new BadRequestException('No file received');
    if (!b?.studentId) throw new BadRequestException('studentId is required');
    if (!ALLOWED.includes(file.mimetype)) throw new BadRequestException('Only PDF, JPG, PNG or WebP files are allowed');

    const s = await this.prisma.student.findUnique({ where: { id: b.studentId }, select: { id: true, unitId: true, admissionNo: true } });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');

    const ext = path.extname(file.originalname || '').slice(0, 10) || '';
    const key = path.join(s.admissionNo.replace(/[^A-Za-z0-9-]/g, ''), `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    const full = path.join(STORAGE_DIR, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.buffer);

    const doc = await this.prisma.document.create({
      data: {
        studentId: s.id, unitId: s.unitId,
        type: (b.type && DOC_TYPES.includes(b.type) ? b.type : 'OTHER'),
        title: b.title?.trim() || file.originalname || 'Document',
        fileName: file.originalname || `document${ext}`,
        mimeType: file.mimetype, sizeBytes: file.size, storageKey: key,
        visibility: (b.visibility === 'PARENT' ? 'PARENT' : 'STAFF'),
        uploadedById: req.user.sub,
      },
    });
    await this.audit.log(req, 'documents', doc.id, 'CREATE', null, { ...doc, storageKey: undefined });
    return doc;
  }

  @Get(':id/file')
  async download(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== doc.unitId) throw new ForbiddenException('Cross-unit access denied');
    return readDocument(doc, res);
  }

  // Flip a document between the parent vault and staff-only.
  @Post(':id/visibility')
  @Roles(...MANAGE_ROLES)
  async visibility(@Req() req: any, @Param('id') id: string, @Body() b: { visibility: string }) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== doc.unitId) throw new ForbiddenException('Cross-unit access denied');
    const updated = await this.prisma.document.update({
      where: { id },
      data: { visibility: b.visibility === 'PARENT' ? 'PARENT' : 'STAFF' },
    });
    await this.audit.log(req, 'documents', id, 'UPDATE', doc, updated);
    return updated;
  }

  @Delete(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async remove(@Req() req: any, @Param('id') id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== doc.unitId) throw new ForbiddenException('Cross-unit access denied');
    const full = path.join(STORAGE_DIR, doc.storageKey);
    if (full.startsWith(STORAGE_DIR)) fs.rmSync(full, { force: true });
    await this.prisma.document.delete({ where: { id } });
    await this.audit.log(req, 'documents', id, 'DELETE', doc, null);
    return { ok: true };
  }
}

@Module({ controllers: [DocumentsController], providers: [PrismaService, AuditService] })
export class DocumentsModule {}
