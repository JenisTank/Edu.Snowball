import {
  AUTO_LWP_STATUS,
  isOverduePendingLeave,
  leaveCutoffOutcome,
  overdueLeaves,
} from '../src/modules/hr/leave.rules';

describe('auto-LWP cut-off', () => {
  const today = '2026-10-22';
  const leave = (id: string, status: string, toDate: string, employeeId = 'e1') => ({
    id,
    status,
    toDate,
    employeeId,
  });

  it('closes a pending leave whose last day has passed', () => {
    expect(isOverduePendingLeave(leave('l1', 'PENDING_MANAGER', '2026-10-20'), today)).toBe(true);
    expect(isOverduePendingLeave(leave('l2', 'PENDING_HR', '2026-10-20'), today)).toBe(true);
  });

  it('leaves a pending leave that still includes today for approval', () => {
    // Approving on the last day must stay possible until the day is over.
    expect(isOverduePendingLeave(leave('l3', 'PENDING_MANAGER', '2026-10-22'), today)).toBe(false);
  });

  it('never touches decided leaves', () => {
    for (const status of ['APPROVED', 'REJECTED', AUTO_LWP_STATUS, 'CANCELLED']) {
      expect(isOverduePendingLeave(leave('l4', status, '2026-09-01'), today)).toBe(false);
    }
  });

  it('accepts Date values as well as ISO strings', () => {
    expect(
      isOverduePendingLeave(
        { status: 'PENDING_MANAGER', toDate: new Date('2026-10-21T00:00:00Z') },
        today,
      ),
    ).toBe(true);
  });

  it('orders the run and reports distinct staff and leave ids', () => {
    const rows = [
      leave('l1', 'PENDING_MANAGER', '2026-10-21', 'e1'),
      leave('l2', 'PENDING_HR', '2026-10-19', 'e2'),
      leave('l3', 'APPROVED', '2026-10-01', 'e1'),
    ];
    expect(overdueLeaves(rows, today).map((r) => r.id)).toEqual(['l2', 'l1']);
    expect(leaveCutoffOutcome(rows, today)).toEqual({
      autoLwp: 2,
      employees: 2,
      leaveIds: ['l2', 'l1'],
      employeeIds: ['e2', 'e1'],
    });
  });

  it('is a no-op when nothing is overdue', () => {
    expect(leaveCutoffOutcome([], today)).toEqual({
      autoLwp: 0,
      employees: 0,
      leaveIds: [],
      employeeIds: [],
    });
  });
});
