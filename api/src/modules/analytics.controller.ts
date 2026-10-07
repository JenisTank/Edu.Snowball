import { Controller, Get, Module, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, HO_ROLES, Roles } from '../auth/auth';
import { PrismaService } from '../prisma.service';

const ANALYTICS_ROLES=['FOUNDER','ACADEMIC_DIR','CENTRE_HEAD','HR_MANAGER'];
const n=(v:any)=>Number(v||0);
@Controller('analytics') @UseGuards(AuthGuard) @Roles(...ANALYTICS_ROLES)
export class AnalyticsController {
 constructor(private prisma:PrismaService){}
 @Get()
 async dashboard(@Req()req:any,@Query('unitId')requested?:string,@Query('months')monthsRaw?:string){
  const unitId=HO_ROLES.includes(req.user.role)||req.user.role==='HR_MANAGER'?requested:req.user.unitId;
  const scope=unitId?{unitId}:{};const months=Math.min(12,Math.max(3,Number(monthsRaw)||6));const now=new Date();const from=new Date(now.getFullYear(),now.getMonth()-months+1,1);
  const [students,leads,attendance,payments,structures,inventory,plans,ptms,evening,payroll]=await Promise.all([
   this.prisma.student.findMany({where:{...scope,status:'ACTIVE'},select:{unitId:true,programmeId:true,siblingGroup:true}}),
   this.prisma.lead.findMany({where:{...(unitId?{assignedUnitId:unitId}:{})},select:{stage:true,createdAt:true}}),
   this.prisma.attendanceRecord.groupBy({by:['status'],where:{...scope,date:{gte:from}},_count:true}),
   this.prisma.feeTransaction.findMany({where:{...scope,isCancelled:false,paymentDate:{gte:from}},select:{amount:true,paymentDate:true,ledgerType:true}}),
   this.prisma.feeStructure.findMany({where:{...scope,academicYear:'2026-27'},select:{unitId:true,programmeId:true,totalFee:true,siblingDiscountPct:true}}),
   this.prisma.inventoryItem.findMany({where:unitId?{OR:[{unitId},{unitId:null}]}:{},select:{quantity:true,reorderLevel:true,unitCost:true}}),
   this.prisma.academicPlan.groupBy({by:['status'],where:unitId?{OR:[{unitId},{unitId:null}]}:{},_count:true}),
   this.prisma.ptmSession.findMany({where:scope,include:{records:{select:{attended:true}}}}),
   this.prisma.eveningActivity.findMany({where:scope,include:{enrollments:{include:{payments:true}}}}),
   this.prisma.payrollRun.findMany({where:{...(unitId?{unitId}:{ }),month:{gte:from.toISOString().slice(0,7)},status:{not:'REVERSED'}},include:{lines:true}}),
  ]);
  const attendanceMap=Object.fromEntries(attendance.map((x:any)=>[x.status,x._count]));const attTotal=Object.values(attendanceMap).reduce((a:any,b:any)=>a+b,0) as number;
  const funnel=Object.entries(leads.reduce((a:any,l:any)=>(a[l.stage]=(a[l.stage]||0)+1,a),{})).map(([stage,count])=>({stage,count}));
  const paid=payments.filter((x:any)=>x.ledgerType==='PRESCHOOL').reduce((a:number,x:any)=>a+n(x.amount),0);const feeTarget=students.reduce((sum:number,student:any)=>{const fee=structures.find((x:any)=>x.unitId===student.unitId&&x.programmeId===student.programmeId);if(!fee)return sum;const discount=student.siblingGroup?n(fee.siblingDiscountPct):0;return sum+n(fee.totalFee)*(1-discount/100)},0);
  const trend=[];for(let i=months-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=d.toISOString().slice(0,7);trend.push({month:key,fees:payments.filter((x:any)=>x.paymentDate.toISOString().slice(0,7)===key).reduce((a:number,x:any)=>a+n(x.amount),0),leads:leads.filter((x:any)=>x.createdAt.toISOString().slice(0,7)===key).length,payroll:payroll.filter((x:any)=>x.month===key).flatMap((x:any)=>x.lines).reduce((a:number,x:any)=>a+n(x.net),0)})}
  const ptmRecords=ptms.flatMap((x:any)=>x.records),eveningEnrollments=evening.flatMap((x:any)=>x.enrollments),eveningPaid=eveningEnrollments.flatMap((x:any)=>x.payments).reduce((a:number,x:any)=>a+n(x.amount),0),eveningDue=eveningEnrollments.reduce((a:number,x:any)=>a+n(x.amountDue),0);
  return {generatedAt:new Date(),filters:{unitId:unitId||null,months},kpis:{students:students.length,leads:leads.length,enrolled:leads.filter((x:any)=>x.stage==='ENROLLED').length,conversion:leads.length?Math.round(leads.filter((x:any)=>x.stage==='ENROLLED').length/leads.length*1000)/10:0,attendanceRate:attTotal?Math.round(n(attendanceMap.PRESENT)/attTotal*1000)/10:0,feesCollected:paid,feeTarget,feeCollectionRate:feeTarget?Math.round(paid/feeTarget*1000)/10:0,lowStock:inventory.filter((x:any)=>x.quantity<=x.reorderLevel).length,inventoryValue:inventory.reduce((a:number,x:any)=>a+x.quantity*n(x.unitCost),0, ),ptmAttendance:ptmRecords.length?Math.round(ptmRecords.filter((x:any)=>x.attended).length/ptmRecords.length*1000)/10:0,eveningStudents:eveningEnrollments.length,eveningCollected:eveningPaid,eveningOutstanding:eveningDue-eveningPaid,payrollCost:payroll.flatMap((x:any)=>x.lines).reduce((a:number,x:any)=>a+n(x.net)+n(x.employerContributions),0)},funnel,attendance:attendanceMap,academic:Object.fromEntries(plans.map((x:any)=>[x.status,x._count])),trend};
 }
}
@Module({controllers:[AnalyticsController],providers:[PrismaService]}) export class AnalyticsModule{}
