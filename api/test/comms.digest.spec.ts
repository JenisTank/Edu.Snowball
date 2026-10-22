import {
  DIGEST_CADENCE,
  attendanceRate,
  buildDigest,
  digestDue,
  digestRecipient,
  digestWindowOpen,
  weekKey,
  weekRange,
  type DigestInput,
} from '../src/modules/comms/digest.rules';

const base: DigestInput = {
  student: {
    id: 'stu-1',
    firstName: 'Aarav',
    lastName: 'Patel',
    admissionNo: 'BB-U1-2627-0001',
    guardianEmail: 'guardian@example.com',
  },
  unit: { name: 'Satellite' },
  attendance: { present: 4, absent: 1, leave: 0, marked: 5 },
  weekOf: '2026-10-19',
};

describe('weekly parent digest', () => {
  it('reports attendance over marked days, not calendar days', () => {
    expect(attendanceRate({ present: 4, marked: 5 })).toBe(80);
    expect(attendanceRate({ present: 0, marked: 0 })).toBe(0);
    // A week with one marked day must not read as 20%.
    expect(attendanceRate({ present: 1, marked: 1 })).toBe(100);
  });

  it('leads with attendance and signs off in the brand voice', () => {
    const d = buildDigest(base);
    const first = d.text.split('\n')[0];
    expect(first).toContain('present 4 of 5');
    expect(first).toContain('80%');
    expect(d.text.trim().endsWith('— BumbleB Kidz')).toBe(true);
    expect(d.subject).toContain('Aarav Patel');
  });

  it('says the register was not marked instead of inventing an absence', () => {
    const d = buildDigest({ ...base, attendance: { present: 0, absent: 0, leave: 0, marked: 0 } });
    expect(d.text).toContain('register was not marked');
    expect(d.text).not.toContain('absent');
  });

  it('separates an overdue amount from an upcoming instalment', () => {
    const overdue = buildDigest({
      ...base,
      fees: { dueAmount: 12000, dueDate: '2026-10-10', overdue: true },
    });
    expect(overdue.text).toMatch(/₹12,000 is overdue/);

    const upcoming = buildDigest({
      ...base,
      fees: { dueAmount: 12000, dueDate: '2026-12-10', overdue: false },
    });
    expect(upcoming.text).toMatch(/next instalment of ₹12,000 is due/);
  });

  it('thanks the family when the last thing that happened was a payment', () => {
    const d = buildDigest({
      ...base,
      fees: { dueAmount: 0, lastPaymentAmount: 5000, lastPaymentDate: '2026-10-18' },
    });
    expect(d.text).toMatch(/We received ₹5,000/);
  });

  it('includes the booked PTM slot and at most three academic items', () => {
    const d = buildDigest({
      ...base,
      upcomingPtm: { title: 'Term 1 PTM', scheduledAt: '2026-10-24T05:00:00Z' },
      academic: Array.from({ length: 6 }, (_, i) => ({ title: `Item ${i}` })),
    });
    expect(d.text).toContain('Term 1 PTM');
    expect(d.text).toContain('Item 0');
    expect(d.text).not.toContain('Item 3');
  });

  it('never carries screening, medical or internal-only fields', () => {
    const d = buildDigest({
      ...base,
      // @ts-expect-error — deliberately smuggling internal data in
      resultCode: 'SP',
      // @ts-expect-error
      internalOnly: true,
      // @ts-expect-error
      medicalNotes: 'Peanut allergy',
      // @ts-expect-error
      bloodGroup: 'B+',
    });
    const blob = JSON.stringify(d);
    for (const leak of ['SP', 'Peanut', 'B+', 'internalOnly']) {
      expect(blob).not.toContain(leak);
    }
  });

  it('escapes HTML so a child name can never inject markup', () => {
    const d = buildDigest({
      ...base,
      student: { ...base.student, firstName: '<script>alert(1)</script>' },
    });
    expect(d.html).not.toContain('<script>');
    expect(d.html).toContain('&lt;script&gt;');
  });

  it('marks a completely quiet week as empty so nothing is sent', () => {
    expect(
      buildDigest({ ...base, attendance: { present: 0, absent: 0, leave: 0, marked: 0 } }).empty,
    ).toBe(true);
    expect(buildDigest(base).empty).toBe(false);
  });

  it('only sends once per student per week, and only with an email', () => {
    expect(digestDue({ hasEmail: false, alreadySentThisWeek: false })).toEqual({
      due: false,
      reason: 'No guardian email on file',
    });
    expect(digestDue({ hasEmail: true, alreadySentThisWeek: true }).due).toBe(false);
    expect(digestDue({ hasEmail: true, alreadySentThisWeek: false }).due).toBe(true);
    expect(digestRecipient({ guardianEmail: '  ' })).toBeNull();
    expect(digestRecipient({ guardianEmail: 'not-an-email' })).toBeNull();
    expect(digestRecipient({ guardianEmail: 'a@b.co' })).toBe('a@b.co');
  });

  it('keys weeks in IST so a Sunday-night run stays in the same week', () => {
    // 2026-10-25 22:00 UTC = Monday 03:30 IST → belongs to the next week.
    expect(weekKey(new Date('2026-10-25T12:00:00Z'))).toBe(
      weekKey(new Date('2026-10-22T04:00:00Z')),
    );
    expect(weekKey(new Date('2026-10-18T20:00:00Z'))).toBe(
      weekKey(new Date('2026-10-19T02:00:00Z')),
    );
    expect(weekRange(new Date('2026-10-22T04:00:00Z'))).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    });
  });

  it('opens the window only on the cadence day, after the hour, once a week', () => {
    const mondayAtEight = new Date('2026-10-19T02:30:00Z'); // 08:00 IST Monday
    expect(digestWindowOpen(mondayAtEight, null).open).toBe(true);
    expect(digestWindowOpen(mondayAtEight, weekKey(mondayAtEight)).open).toBe(false);
    expect(digestWindowOpen(new Date('2026-10-19T01:00:00Z'), null).reason).toBe(
      'Before send time',
    );
    expect(digestWindowOpen(new Date('2026-10-21T04:00:00Z'), null).reason).toBe(
      'Not the cadence day',
    );
    expect(DIGEST_CADENCE.weekday).toBe(1);
  });
});
