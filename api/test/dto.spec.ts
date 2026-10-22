import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../src/common/validation/validation';
import {
  CreatePtmSessionDto,
  GeneratePtmSlotsDto,
  UpdatePtmRecordDto,
} from '../src/modules/ptm/ptm.dto';
import {
  CreateEveningParticipantDto,
  EveningPaymentDto,
  MarkEveningAttendanceDto,
} from '../src/modules/evening/evening.dto';

const pipe = createValidationPipe();
const body = { type: 'body' as const };

async function run<T>(metatype: new () => T, value: unknown): Promise<T> {
  return (await pipe.transform(value, { ...body, metatype })) as T;
}

async function expectFail<T>(metatype: new () => T, value: unknown) {
  await expect(run(metatype, value)).rejects.toBeInstanceOf(BadRequestException);
}

const UUID = '4f1b9d6a-4a2f-4a1f-9c6f-1a2b3c4d5e6f';

describe('PTM DTOs', () => {
  it('accepts a valid session and strips unknown keys', async () => {
    const out = await run(CreatePtmSessionDto, {
      title: 'Term 1 PTM',
      scheduledAt: '2026-11-14T09:00:00.000Z',
      unitId: UUID,
      hacker: 'nope',
    });
    expect(out.title).toBe('Term 1 PTM');
    expect((out as any).hacker).toBeUndefined();
  });

  it('rejects a session without a title or with a bad date', async () => {
    await expectFail(CreatePtmSessionDto, { scheduledAt: '2026-11-14T09:00:00.000Z' });
    await expectFail(CreatePtmSessionDto, { title: 'PTM', scheduledAt: 'next tuesday' });
    await expectFail(CreatePtmSessionDto, { title: 'PTM', scheduledAt: '2026-11-14', unitId: 'x' });
  });

  it('coerces slot count from a form string and rejects out-of-range values', async () => {
    const out = await run(GeneratePtmSlotsDto, { count: '8', minutes: '15' });
    expect(out.count).toBe(8);
    expect(out.minutes).toBe(15);
    await expectFail(GeneratePtmSlotsDto, { count: 61 });
    await expectFail(GeneratePtmSlotsDto, { minutes: 4 });
  });

  it('treats the record patch as partial so a toggle keeps typed notes', async () => {
    const empty = await run(UpdatePtmRecordDto, {});
    expect(empty.attended).toBeUndefined();
    const nulled = await run(UpdatePtmRecordDto, { teacherNotes: null });
    expect(nulled.teacherNotes).toBeNull();
    const toggled = await run(UpdatePtmRecordDto, { attended: true });
    expect(toggled.teacherNotes).toBeUndefined();
  });
});

describe('Evening centre DTOs', () => {
  it('requires a guardian phone for an external participant', async () => {
    await expectFail(CreateEveningParticipantDto, { fullName: 'Kavya' });
    await expectFail(CreateEveningParticipantDto, { fullName: 'Kavya', guardianPhone: 'abc' });
    const ok = await run(CreateEveningParticipantDto, {
      fullName: 'Kavya',
      guardianPhone: '+91 98765 43210',
    });
    expect(ok.guardianPhone).toBe('+91 98765 43210');
  });

  it('validates attendance entries', async () => {
    await expectFail(MarkEveningAttendanceDto, { entries: [] });
    await expectFail(MarkEveningAttendanceDto, { entries: [{ studentId: UUID, status: 'LATE' }] });
    const ok = await run(MarkEveningAttendanceDto, {
      entries: [{ participantId: UUID, status: 'PRESENT' }],
    });
    expect(ok.entries).toHaveLength(1);
  });

  it('rejects a zero or negative evening payment', async () => {
    await expectFail(EveningPaymentDto, { amount: 0 });
    await expectFail(EveningPaymentDto, { amount: 100, mode: 'BITCOIN' });
    const ok = await run(EveningPaymentDto, { amount: '250', mode: 'UPI' });
    expect(ok.amount).toBe(250);
  });
});
