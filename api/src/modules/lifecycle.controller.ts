import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, Req, UseGuards, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthGuard, HO_ROLES, Roles, unitScope } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';

export const LIFECYCLE_TABS = [
  ['STUDENT_INFORMATION','Student Information','STAFF_PARENT'], ['FAMILY_HISTORY','Family History','STAFF_PARENT'],
  ['SIBLINGS','Siblings Details','STAFF_PARENT'], ['PARENT_FEEDBACK','Parent Feedback & Queries','STAFF_PARENT'],
  ['INFIRMARY','Infirmary','STAFF_ONLY'], ['VACCINATION','Vaccination','STAFF_PARENT'],
  ['GROWTH','Height & Weight','STAFF_PARENT'], ['HEALTH_MEDICAL','Health & Medical','STAFF_ONLY'],
  ['DOCUMENTS','Documents Vault','STAFF_PARENT'], ['FEES','Fees Details','STAFF_PARENT'],
  ['TC_INFORMATION','TC Information','STAFF_ONLY'], ['ATTENDANCE','Attendance','STAFF_PARENT'],
  ['PARENT_COMMUNICATION','Parent Communication','STAFF_PARENT'], ['LEAVE_APPLICATION','Leave Application','STAFF_PARENT'],
  ['CHILD_SUPPORT','Child Support Log','INTERNAL'], ['IEP','IEP','INTERNAL'],
  ['HOME_PLAN','Home Plan','STAFF_PARENT'], ['WORKSHEETS_PORTFOLIO','Worksheets / BuzzPortfolio','STAFF_PARENT'],
] as const;
const INTERNAL = new Set(['CHILD_SUPPORT','IEP']);
const STAFF_ONLY = new Set(['INFIRMARY','HEALTH_MEDICAL','TC_INFORMATION']);

@Controller('lifecycle') @UseGuards(AuthGuard)
export class LifecycleController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  @Get('tabs') tabs() { return LIFECYCLE_TABS.map(([id,label,visibility]) => ({ id,label,visibility })); }
  @Get('students') students(@Req() req:any, @Query('unitId') unitId?:string) {
    return this.prisma.student.findMany({ where: unitScope(req.user, unitId), select:{id:true,firstName:true,lastName:true,admissionNo:true,unitId:true,programme:{select:{name:true}}}, orderBy:{firstName:'asc'} });
  }
  private async student(req:any,id:string) {
    const s=await this.prisma.student.findUnique({where:{id}}); if(!s) throw new NotFoundException();
    if(!HO_ROLES.includes(req.user.role)&&s.unitId!==req.user.unitId) throw new ForbiddenException('Student is outside your unit'); return s;
  }
  @Get('student/:id') async records(@Req() req:any,@Param('id') id:string,@Query('tab') tab?:string) {
    await this.student(req,id); return this.prisma.studentLifecycleRecord.findMany({where:{studentId:id,...(tab?{tab}:{})},orderBy:[{eventDate:'desc'},{createdAt:'desc'}]});
  }
  @Post('student/:id') async create(@Req() req:any,@Param('id') id:string,@Body() b:any) {
    const s=await this.student(req,id); const def=LIFECYCLE_TABS.find(x=>x[0]===b.tab); if(!def) throw new BadRequestException('Invalid lifecycle tab');
    if((INTERNAL.has(b.tab)||STAFF_ONLY.has(b.tab))&&req.user.role==='RECEPTIONIST') throw new ForbiddenException('Restricted student record');
    if(!b.title?.trim()) throw new BadRequestException('Title is required');
    const row=await this.prisma.studentLifecycleRecord.create({data:{studentId:id,unitId:s.unitId,tab:b.tab,title:b.title.trim(),payload:b.payload||{},visibility:def[2],status:b.status||null,eventDate:b.eventDate?new Date(b.eventDate):null,createdById:req.user.sub}});
    await this.audit.log(req,'student_lifecycle_records',row.id,'INSERT',null,row); return row;
  }
  @Patch(':recordId') async update(@Req() req:any,@Param('recordId') recordId:string,@Body() b:any) {
    const old=await this.prisma.studentLifecycleRecord.findUnique({where:{id:recordId}}); if(!old) throw new NotFoundException(); await this.student(req,old.studentId);
    const row=await this.prisma.studentLifecycleRecord.update({where:{id:recordId},data:{title:b.title?.trim()||old.title,payload:b.payload??old.payload,status:b.status===undefined?old.status:b.status,eventDate:b.eventDate?new Date(b.eventDate):old.eventDate}}); await this.audit.log(req,'student_lifecycle_records',recordId,'UPDATE',old,row); return row;
  }
  @Delete(':recordId') @Roles('FOUNDER','ACADEMIC_DIR','CENTRE_HEAD') async remove(@Req() req:any,@Param('recordId') recordId:string) { const old=await this.prisma.studentLifecycleRecord.findUnique({where:{id:recordId}}); if(!old) throw new NotFoundException(); await this.student(req,old.studentId); await this.prisma.studentLifecycleRecord.delete({where:{id:recordId}}); await this.audit.log(req,'student_lifecycle_records',recordId,'DELETE',old,null); return {ok:true}; }
}
@Module({controllers:[LifecycleController],providers:[PrismaService,AuditService]}) export class LifecycleModule {}
