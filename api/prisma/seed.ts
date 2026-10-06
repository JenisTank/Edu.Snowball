// BumbleB Kidz ERP — Seed data (realistic demo)
// 3 units · 5 programmes · batches · 8 users (all roles) · 42 students · 16 leads
import { PrismaClient, UserRole, LeadStage, InquiryChannel, InstalmentPlan, PaymentMode, AttendanceStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const AY = '2026-27';

async function main() {
  console.log('🐝 Seeding BumbleB Kidz ERP…');

  // ── wipe (dev only) ──
  await prisma.auditLog.deleteMany();
  await prisma.consentLog.deleteMany();
  await prisma.feeTransaction.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.discoveryFlight.deleteMany();
  await prisma.student.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.areaMaster.deleteMany();
  await prisma.user.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.programme.deleteMany();
  await prisma.unitSettings.deleteMany();
  await prisma.unit.deleteMany();

  // ── Units ──
  const u1 = await prisma.unit.create({ data: { code: 'U1', name: 'Unit 1 – Saraswati', address: 'Saraswati Campus, Rajkot', phone: '+91 98000 00001', email: 'u1@bumblebkidz.com', status: 'ACTIVE' } });
  const u2 = await prisma.unit.create({ data: { code: 'U2', name: 'Unit 2 – Rajkot Flagship', address: '1 Tirupati Nagar, Nirmala Road, Rajkot', phone: '+91 98000 00002', email: 'bumblebkidz@gmail.com', website: 'bumblebwebsite.com', status: 'ACTIVE' } });
  const u3 = await prisma.unit.create({ data: { code: 'U3', name: 'Unit 3 – Jivraj Park', address: 'Rajkot Public School Building, Jivraj Park Main Road', phone: '+91 98000 00003', email: 'u3@bumblebkidz.com', status: 'DEVELOPMENT' } });

  for (const u of [u1, u2, u3]) {
    await prisma.unitSettings.create({ data: { unitId: u.id, pettyCashFloat: 5000, calendlyLink: u.code === 'U2' ? 'calendly.com/bumblebkidz/new-meeting' : null } });
  }

  // ── Programmes (fixed — never modify) ──
  const progData = [
    { code: 'TODD_CARE', name: 'Todd Care', tierName: 'Baby Bees', ageMin: 1.5, ageMax: 2.5, levelColour: '#F5D547', sortOrder: 1 },
    { code: 'PLAYHOUSE', name: 'PlayHouse', tierName: 'Beginner Bees', ageMin: 2.5, ageMax: 3.5, levelColour: '#F8C8DC', sortOrder: 2 },
    { code: 'PREK', name: 'PreK', tierName: 'Busy Bees', ageMin: 3.5, ageMax: 4.5, levelColour: '#AEDFF7', sortOrder: 3 },
    { code: 'K1', name: 'K1', tierName: 'Blooming Bees', ageMin: 4.5, ageMax: 5.5, levelColour: '#D6C5F0', sortOrder: 4 },
    { code: 'K2', name: 'K2', tierName: 'Brilliant Bees', ageMin: 5.5, ageMax: 6.5, levelColour: '#BBE5B3', sortOrder: 5 },
  ];
  const progs: Record<string, any> = {};
  for (const p of progData) progs[p.code] = await prisma.programme.create({ data: p });

  // ── Batches ──
  const batchDefs = [
    { unit: u1, prog: 'PLAYHOUSE', name: 'PlayHouse Morning (Guj)', medium: 'gujarati', shift: 'morning', startTime: '08:00', endTime: '11:30', capacity: 20 },
    { unit: u1, prog: 'PREK', name: 'PreK Morning (Guj)', medium: 'gujarati', shift: 'morning', startTime: '08:00', endTime: '12:00', capacity: 25 },
    { unit: u1, prog: 'K1', name: 'K1 Morning (Eng)', medium: 'english', shift: 'morning', startTime: '08:00', endTime: '12:30', capacity: 25 },
    { unit: u1, prog: 'K2', name: 'K2 Morning (Eng)', medium: 'english', shift: 'morning', startTime: '08:00', endTime: '12:30', capacity: 25 },
    { unit: u2, prog: 'TODD_CARE', name: 'Todd Care Morning', medium: 'english', shift: 'morning', startTime: '10:00', endTime: '11:30', capacity: 15 },
    { unit: u2, prog: 'PLAYHOUSE', name: 'PlayHouse Morning', medium: 'english', shift: 'morning', startTime: '09:00', endTime: '12:00', capacity: 20 },
    { unit: u2, prog: 'PREK', name: 'PreK Morning', medium: 'english', shift: 'morning', startTime: '09:00', endTime: '12:30', capacity: 20 },
    { unit: u3, prog: 'PLAYHOUSE', name: 'PlayHouse Morning', medium: 'english', shift: 'morning', startTime: '09:00', endTime: '12:00', capacity: 20 },
  ];
  const batches: any[] = [];
  for (const b of batchDefs) {
    batches.push(await prisma.batch.create({ data: { unitId: b.unit.id, programmeId: progs[b.prog].id, name: b.name, medium: b.medium, shift: b.shift, startTime: b.startTime, endTime: b.endTime, capacity: b.capacity, academicYear: AY } }));
  }

  // ── Users (one per role — every person has own login, DPDP) ──
  const pw = await bcrypt.hash('bumbleb123', 10);
  const usersDef: { email: string; name: string; role: UserRole; unitId: string | null }[] = [
    { email: 'founder@bumblebkidz.com', name: 'Helly (Founder)', role: 'FOUNDER', unitId: null },
    { email: 'ad@bumblebkidz.com', name: 'Academic Director', role: 'ACADEMIC_DIR', unitId: null },
    { email: 'falguni@bumblebkidz.com', name: 'Falguni (Curriculum Lead)', role: 'CURRICULUM_LEAD', unitId: null },
    { email: 'ch.u1@bumblebkidz.com', name: 'Centre Head — Unit 1', role: 'CENTRE_HEAD', unitId: u1.id },
    { email: 'ch.u2@bumblebkidz.com', name: 'Centre Head — Unit 2', role: 'CENTRE_HEAD', unitId: u2.id },
    { email: 'coord.u1@bumblebkidz.com', name: 'Coordinator — Unit 1', role: 'COORDINATOR', unitId: u1.id },
    { email: 'teacher.u1@bumblebkidz.com', name: 'Teacher — K1 Unit 1', role: 'TEACHER', unitId: u1.id },
    { email: 'reception@bumblebkidz.com', name: 'Central Hub Receptionist', role: 'RECEPTIONIST', unitId: null },
  ];
  for (const u of usersDef) {
    await prisma.user.create({ data: { email: u.email, passwordHash: pw, fullName: u.name, role: u.role, unitId: u.unitId } });
  }

  // ── Area Master (locality → suggested unit) ──
  const areas = [
    { locality: 'Saraswati Nagar', pincode: '360001', suggestedUnitId: u1.id },
    { locality: 'Kalawad Road', pincode: '360005', suggestedUnitId: u1.id },
    { locality: 'Tirupati Nagar', pincode: '360007', suggestedUnitId: u2.id },
    { locality: 'Nirmala Road', pincode: '360007', suggestedUnitId: u2.id },
    { locality: 'Jivraj Park', pincode: '360004', suggestedUnitId: u3.id },
    { locality: 'University Road', pincode: '360005', suggestedUnitId: u2.id },
  ];
  for (const a of areas) await prisma.areaMaster.create({ data: a });

  // ── Fee structures (HO-locked) ──
  const feeDefs = [
    { prog: 'TODD_CARE', total: 36000 }, { prog: 'PLAYHOUSE', total: 42000 },
    { prog: 'PREK', total: 48000 }, { prog: 'K1', total: 52000 }, { prog: 'K2', total: 55000 },
  ];
  for (const u of [u1, u2, u3]) {
    for (const f of feeDefs) {
      await prisma.feeStructure.create({ data: { unitId: u.id, programmeId: progs[f.prog].id, academicYear: AY, totalFee: f.total, instalment1: Math.round(f.total * 0.4), instalment2: Math.round(f.total * 0.3), instalment3: Math.round(f.total * 0.3), siblingDiscountPct: 10, locked: true } });
    }
  }

  // ── Students (42, realistic Gujarati names) ──
  const firstNames = ['Aarav', 'Vihaan', 'Reyansh', 'Krish', 'Dhruv', 'Kavya', 'Anaya', 'Diya', 'Myra', 'Saanvi', 'Aadhya', 'Kiara', 'Ishaan', 'Arjun', 'Shiv', 'Riya', 'Pari', 'Veer', 'Hetvi', 'Jiya', 'Dev', 'Mahi', 'Nisha', 'Om', 'Prisha', 'Rudra', 'Tara', 'Yash', 'Zara', 'Kian', 'Avni', 'Darsh', 'Esha', 'Freya', 'Hridaan', 'Ira', 'Jay', 'Keya', 'Laksh', 'Meera', 'Nirav', 'Pia'];
  const lastNames = ['Patel', 'Shah', 'Mehta', 'Joshi', 'Trivedi', 'Dave', 'Vyas', 'Bhatt', 'Raval', 'Thakkar', 'Gandhi', 'Desai', 'Kotak', 'Pandya'];
  const areasList = ['Saraswati Nagar', 'Kalawad Road', 'Tirupati Nagar', 'Nirmala Road', 'Jivraj Park', 'University Road'];

  let serial = 0;
  const students: any[] = [];
  for (let i = 0; i < 42; i++) {
    const batch = batches[i % batches.length];
    const prog = progData.find(p => progs[p.code].id === batch.programmeId)!;
    const unitCode = batch.unitId === u1.id ? 'U1' : batch.unitId === u2.id ? 'U2' : 'U3';
    serial++;
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const ageYears = Number(prog.ageMin) + Math.random() * (Number(prog.ageMax) - Number(prog.ageMin));
    const dob = new Date(Date.now() - ageYears * 365.25 * 24 * 3600 * 1000);
    const s = await prisma.student.create({
      data: {
        unitId: batch.unitId, admissionNo: `BB-${unitCode}-2627-${String(serial).padStart(4, '0')}`,
        firstName: fn, lastName: ln, dob, gender: i % 2 === 0 ? 'Male' : 'Female',
        fatherName: `${['Rajesh', 'Amit', 'Sanjay', 'Hitesh', 'Paresh', 'Mehul'][i % 6]} ${ln}`,
        fatherPhone: `+91 9${String(100000000 + i * 1234567).slice(0, 9)}`,
        motherName: `${['Nita', 'Payal', 'Hetal', 'Bhavna', 'Komal', 'Rupal'][i % 6]} ${ln}`,
        addressArea: areasList[i % areasList.length],
        programmeId: batch.programmeId, batchId: batch.id,
        admissionDate: new Date(2026, 5, 1 + (i % 25)),
        instalmentPlan: ([InstalmentPlan.PLAN_A, InstalmentPlan.PLAN_B, InstalmentPlan.PLAN_C] as const)[i % 3],
        academicYear: AY,
        siblingGroup: i % 10 === 9 ? `FAM-${Math.floor(i / 10)}` : null,
      },
    });
    students.push(s);
  }

  // ── Fee transactions (first instalments collected for ~70%) ──
  let receiptSerial = 0;
  for (const s of students) {
    if (Math.random() < 0.7) {
      receiptSerial++;
      const fee = feeDefs.find(f => progs[f.prog].id === s.programmeId)!;
      const unitCode = s.unitId === u1.id ? 'U1' : s.unitId === u2.id ? 'U2' : 'U3';
      await prisma.feeTransaction.create({
        data: {
          studentId: s.id, unitId: s.unitId, amount: Math.round(fee.total * 0.4),
          paymentMode: ([PaymentMode.CASH, PaymentMode.UPI, PaymentMode.RAZORPAY, PaymentMode.CHEQUE] as const)[receiptSerial % 4],
          paymentDate: new Date(2026, 5, 1 + (receiptSerial % 28)), instalmentNo: 1,
          receiptNo: `BB-${unitCode}-RCPT-${String(receiptSerial).padStart(5, '0')}`,
        },
      });
    }
  }

  // ── Attendance for today (default-absent model; ~85% marked present) ──
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const s of students) {
    if (!s.batchId) continue;
    const present = Math.random() < 0.85;
    await prisma.attendanceRecord.create({
      data: {
        studentId: s.id, batchId: s.batchId, unitId: s.unitId, date: today,
        status: present ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
        markedAt: present ? new Date() : null,
      },
    });
  }

  // ── Leads (16, across pipeline stages) ──
  const stages: LeadStage[] = ['NEW_INQUIRY', 'FIRST_BUZZ', 'ROUTING', 'EXPERIENCE_SESSION', 'DISCOVERY_FLIGHT', 'OFFER', 'CONFIRMATION', 'ENROLLED'];
  const channels: InquiryChannel[] = ['CALL', 'WHATSAPP', 'WEBSITE', 'SOCIAL', 'REFERRAL', 'WALK_IN'];
  for (let i = 0; i < 16; i++) {
    const unit = [u1, u2, u3][i % 3];
    await prisma.lead.create({
      data: {
        inquiryNo: `BB-${unit.code}-INQ-2627-${String(i + 1).padStart(4, '0')}`,
        stage: stages[i % stages.length],
        parentName: `${['Kiran', 'Bhavesh', 'Dipti', 'Jignesh', 'Falak', 'Chirag', 'Hina', 'Nilesh'][i % 8]} ${lastNames[i % lastNames.length]}`,
        parentPhone: `+91 97${String(10000000 + i * 654321).slice(0, 8)}`,
        childName: `${firstNames[(i + 20) % firstNames.length]}`,
        programmeInterestId: progs[progData[i % 5].code].id,
        areaLocality: areasList[i % areasList.length],
        preferredUnit: ['U1', 'U2', 'U3', 'NO_PREFERENCE'][i % 4],
        suggestedUnitId: unit.id,
        assignedUnitId: i % 4 === 0 ? null : unit.id,
        inquiryChannel: channels[i % channels.length],
        experienceInterest: i % 3 === 0,
        leadScore: 20 + (i * 7) % 75,
        createdAt: new Date(Date.now() - i * 86400000 * 2),
      },
    });
  }

  console.log('✅ Seed complete: 3 units, 5 programmes, 8 batches, 8 users, 42 students, 16 leads');
  console.log('🔑 All demo logins use password: bumbleb123');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
