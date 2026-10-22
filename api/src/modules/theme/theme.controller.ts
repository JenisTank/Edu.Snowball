import { Body, Controller, Get, Put, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Controller('theme')
@UseGuards(AuthGuard)
export class ThemeController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get('default') async getDefault() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'organisation-theme' } });
    return { value: row?.value ?? null, updatedAt: row?.updatedAt ?? null };
  }
  @Put('default') @Roles('FOUNDER') async setDefault(@Req() req: any, @Body() body: any) {
    const t = body?.theme;
    if (!t?.id || !t?.bg || !t?.accent || !t?.txt) throw new BadRequestException('Invalid theme');
    const row = await this.prisma.appSetting.upsert({
      where: { key: 'organisation-theme' },
      create: { key: 'organisation-theme', value: t, updatedById: req.user.sub },
      update: { value: t, updatedById: req.user.sub },
    });
    await this.audit.log(req, 'app_settings', 'organisation-theme', 'UPDATE', null, {
      themeId: t.id,
    });
    return { value: row.value, updatedAt: row.updatedAt };
  }
}
