import { BadRequestException } from '@nestjs/common';

import { PayrollController } from '../src/modules/hr/payroll.controller';

/**
 * Maker-checker on payroll: the person who created or submitted a run must not
 * be able to approve it, and only the approver may lock it.
 */
function makeController(run: any) {
  const prisma = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...run, ...data })),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { controller: new PayrollController(prisma as any, audit as any), prisma, audit };
}

describe('payroll maker-checker', () => {
  const baseRun = {
    id: 'run-1',
    type: 'MORNING_SALARIED',
    month: '2026-10',
    status: 'SUBMITTED',
    createdById: 'maker-1',
    submittedById: 'maker-1',
    approvedById: null,
  };

  it('refuses approval by the user who created or submitted the run', async () => {
    const { controller } = makeController(baseRun);
    await expect(
      controller.approvePayroll({ user: { sub: 'maker-1' } }, 'run-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a different user (the checker) to approve', async () => {
    const { controller, audit } = makeController(baseRun);
    const result = await controller.approvePayroll({ user: { sub: 'checker-1' } }, 'run-1');
    expect(result.status).toBe('APPROVED');
    expect(result.approvedById).toBe('checker-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.anything(),
      'payroll_runs',
      'run-1',
      'UPDATE',
      baseRun,
      expect.objectContaining({ status: 'APPROVED' }),
    );
  });

  it('refuses to approve a run that was never submitted', async () => {
    const { controller } = makeController({ ...baseRun, status: 'DRAFT' });
    await expect(
      controller.approvePayroll({ user: { sub: 'checker-1' } }, 'run-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only the approving checker may lock the run', async () => {
    const approved = { ...baseRun, status: 'APPROVED', approvedById: 'checker-1' };
    const other = makeController(approved);
    await expect(
      other.controller.lockPayroll({ user: { sub: 'someone-else' } }, 'run-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const owner = makeController(approved);
    const locked = await owner.controller.lockPayroll({ user: { sub: 'checker-1' } }, 'run-1');
    expect(locked.status).toBe('LOCKED');
  });

  it('requires a reason to reverse a locked run', async () => {
    const locked = { ...baseRun, status: 'LOCKED', lines: [] };
    const { controller } = makeController(locked);
    await expect(
      controller.reversePayroll({ user: { sub: 'checker-1' } }, 'run-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
