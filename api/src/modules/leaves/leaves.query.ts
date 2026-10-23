import { istDateKey, suppressingLeave } from './leaves.rules';

/**
 * Approved-leave lookups shared by the attendance roster, the absence-scan job
 * and the parent portal. Kept free of Nest decorators so the BullMQ worker
 * (which is not part of the DI container) can use it too.
 */

export interface ApprovedLeave {
  id: string;
  studentId: string;
  unitId: string;
  fromDate: Date | string;
  toDate: Date | string;
  type: string;
  status: string;
}

const iso = (v: Date | string) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

/** Approved leaves covering `dateISO`, optionally narrowed to one unit. */
export async function approvedLeavesFor(
  prisma: any,
  dateISO: string,
  unitId?: string | null,
): Promise<ApprovedLeave[]> {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return prisma.studentLeave.findMany({
    where: {
      status: 'APPROVED',
      fromDate: { lte: d },
      toDate: { gte: d },
      ...(unitId ? { unitId } : {}),
    },
  });
}

/** studentId → approved leave, for O(1) checks inside a roster loop. */
export async function approvedLeaveMap(
  prisma: any,
  dateISO: string,
  unitId?: string | null,
): Promise<Map<string, ApprovedLeave>> {
  const rows = await approvedLeavesFor(prisma, dateISO, unitId);
  const map = new Map<string, ApprovedLeave>();
  for (const l of rows) {
    const existing = map.get(l.studentId);
    // Prefer the earliest-created covering leave so the result is deterministic.
    if (!existing || l.id < existing.id) map.set(l.studentId, l);
  }
  return map;
}

/** True when this student has an approved leave on the date. */
export async function isOnApprovedLeave(
  prisma: any,
  studentId: string,
  dateISO = istDateKey(),
): Promise<boolean> {
  const rows = await approvedLeavesFor(prisma, dateISO);
  return !!suppressingLeave(
    rows
      .filter((r) => r.studentId === studentId)
      .map((r) => ({
        ...r,
        fromDate: iso(r.fromDate),
        toDate: iso(r.toDate),
      })),
    dateISO,
  );
}
