import { BadRequestException } from '@nestjs/common';

import { createValidationPipe } from '../src/common/validation/validation';
import { MarkAttendanceDto } from '../src/modules/attendance/dto/mark-attendance.dto';
import { LoginDto } from '../src/modules/auth/dto/login.dto';
import { CreatePaymentDto } from '../src/modules/fees/dto/payment.dto';
import { CreateUserDto } from '../src/modules/users/dto/user.dto';

const pipe = createValidationPipe();
const meta = (type: any) => ({ type: 'body' as const, metatype: type, data: undefined });
const transform = (type: any, value: any) => pipe.transform(value, meta(type));

const UUID = '2f5b7c1e-8a4d-4c3b-9f10-1a2b3c4d5e6f';

describe('request validation', () => {
  it('accepts a well-formed login and strips unknown fields', async () => {
    const out: any = await transform(LoginDto, {
      email: 'founder@bumblebkidz.com',
      password: 'bumbleb123',
      role: 'FOUNDER',
    });
    expect(out.email).toBe('founder@bumblebkidz.com');
    expect(out.role).toBeUndefined(); // mass-assignment closed
  });

  it('rejects an invalid email', async () => {
    await expect(transform(LoginDto, { email: 'nope', password: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payment with a negative or zero amount', async () => {
    for (const amount of [-100, 0]) {
      await expect(
        transform(CreatePaymentDto, { studentId: UUID, amount, paymentMode: 'CASH' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects an unsupported payment mode', async () => {
    await expect(
      transform(CreatePaymentDto, { studentId: UUID, amount: 5000, paymentMode: 'BITCOIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed student id', async () => {
    await expect(
      transform(CreatePaymentDto, { studentId: 'not-a-uuid', amount: 100, paymentMode: 'UPI' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attendance statuses outside PRESENT / ABSENT / LEAVE', async () => {
    await expect(
      transform(MarkAttendanceDto, {
        batchId: UUID,
        entries: [{ studentId: UUID, status: 'HOLIDAY' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid attendance roster and requires at least one entry', async () => {
    const out: any = await transform(MarkAttendanceDto, {
      batchId: UUID,
      entries: [{ studentId: UUID, status: 'PRESENT' }],
    });
    expect(out.entries).toHaveLength(1);
    await expect(
      transform(MarkAttendanceDto, { batchId: UUID, entries: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the 8-character minimum on new staff passwords', async () => {
    await expect(
      transform(CreateUserDto, {
        email: 'teacher@bumblebkidz.com',
        fullName: 'Teacher One',
        role: 'TEACHER',
        password: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown roles', async () => {
    await expect(
      transform(CreateUserDto, {
        email: 'x@bumblebkidz.com',
        fullName: 'X',
        role: 'SUPERADMIN',
        password: 'longenough',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
