import {
  CHANNEL_POLICY,
  businessMsBetween,
  channelPlan,
  isBusinessHours,
  istParts,
  missingVariables,
  normalisePhone,
  renderTemplate,
  retryDelay,
  shouldEscalate,
} from '../src/modules/comms/comms.rules';

describe('communication rules', () => {
  describe('channel plan', () => {
    it('falls back from push to WhatsApp to email', () => {
      expect(
        channelPlan('ABSENCE_ALERT', { hasPush: true, hasWhatsApp: true, hasEmail: true }),
      ).toEqual(['PUSH', 'WHATSAPP', 'EMAIL']);
    });

    it('skips channels the parent cannot receive', () => {
      expect(
        channelPlan('FEE_REMINDER', { hasPush: false, hasWhatsApp: true, hasEmail: false }),
      ).toEqual(['WHATSAPP']);
      expect(
        channelPlan('FEE_REMINDER', { hasPush: false, hasWhatsApp: false, hasEmail: true }),
      ).toEqual(['EMAIL']);
      expect(
        channelPlan('FEE_REMINDER', { hasPush: false, hasWhatsApp: false, hasEmail: false }),
      ).toEqual([]);
    });

    it('honours the per-type policy (internal escalations never push)', () => {
      expect(CHANNEL_POLICY.ESCALATION_3DAY).toEqual(['WHATSAPP', 'EMAIL']);
      expect(
        channelPlan('ESCALATION_3DAY', { hasPush: true, hasWhatsApp: true, hasEmail: false }),
      ).toEqual(['WHATSAPP']);
    });

    it('respects a missing provider', () => {
      expect(
        channelPlan(
          'ABSENCE_ALERT',
          { hasPush: false, hasWhatsApp: true, hasEmail: true },
          { whatsapp: false, email: true },
        ),
      ).toEqual(['EMAIL']);
    });

    it('uses the default policy for an unknown type', () => {
      expect(
        channelPlan('SOMETHING_NEW', { hasPush: true, hasWhatsApp: true, hasEmail: true }),
      ).toEqual(['PUSH', 'WHATSAPP', 'EMAIL']);
    });
  });

  describe('retry back-off', () => {
    it('waits 1 min, 5 min, then 30 min', () => {
      expect(retryDelay(0)).toBe(0);
      expect(retryDelay(1)).toBe(60_000);
      expect(retryDelay(2)).toBe(300_000);
      expect(retryDelay(3)).toBe(1_800_000);
      expect(retryDelay(99)).toBe(1_800_000);
    });
  });

  describe('templates', () => {
    it('substitutes variables', () => {
      expect(renderTemplate('Hi {{child}}, {{amount}} due', { child: 'Aarav', amount: 500 })).toBe(
        'Hi Aarav, 500 due',
      );
    });

    it('leaves unknown variables visible so the bug is obvious', () => {
      expect(renderTemplate('Hi {{child}} from {{unit}}', { child: 'Aarav' })).toBe(
        'Hi Aarav from {{unit}}',
      );
    });

    it('lists what is still missing', () => {
      expect(missingVariables('{{a}} {{b}} {{a}}', { a: 1 })).toEqual(['b']);
      expect(missingVariables('nothing here')).toEqual([]);
    });
  });

  describe('phone numbers', () => {
    it('normalises Indian numbers for the BSP', () => {
      expect(normalisePhone('9876543210')).toBe('919876543210');
      expect(normalisePhone('+91 98765 43210')).toBe('919876543210');
      expect(normalisePhone('09876543210')).toBe('919876543210');
      expect(normalisePhone('')).toBeNull();
      expect(normalisePhone('12345')).toBeNull();
    });
  });

  describe('parent reply SLA', () => {
    // 2026-10-22 is a Thursday.
    const at = (iso: string) => new Date(iso);

    it('knows IST business hours', () => {
      expect(isBusinessHours(at('2026-10-22T05:00:00Z'))).toBe(true); // 10:30 IST
      expect(isBusinessHours(at('2026-10-22T02:00:00Z'))).toBe(false); // 07:30 IST
      expect(isBusinessHours(at('2026-10-22T13:00:00Z'))).toBe(false); // 18:30 IST
      expect(isBusinessHours(at('2026-10-25T06:00:00Z'))).toBe(false); // Sunday
      expect(istParts(at('2026-10-21T20:00:00Z')).dateISO).toBe('2026-10-22'); // 01:30 IST
    });

    it('does not escalate outside working hours', () => {
      expect(
        shouldEscalate({ createdAt: '2026-10-22T02:00:00Z', now: at('2026-10-22T03:00:00Z') }),
      ).toBe(false);
    });

    it('escalates after four business hours', () => {
      // 10:00 IST → 15:00 IST is five business hours.
      expect(
        shouldEscalate({ createdAt: '2026-10-22T04:30:00Z', now: at('2026-10-22T09:30:00Z') }),
      ).toBe(true);
      // 10:00 → 13:00 is only three.
      expect(
        shouldEscalate({ createdAt: '2026-10-22T04:30:00Z', now: at('2026-10-22T07:30:00Z') }),
      ).toBe(false);
    });

    it('stops the clock overnight', () => {
      // Sent 17:00 IST Thursday, checked 10:00 IST Friday = 1h + 1h = 2 business hours.
      expect(
        shouldEscalate({ createdAt: '2026-10-22T11:30:00Z', now: at('2026-10-23T04:30:00Z') }),
      ).toBe(false);
      // By 15:00 IST Friday it has run 1 + 6 = 7 business hours.
      expect(
        shouldEscalate({ createdAt: '2026-10-22T11:30:00Z', now: at('2026-10-23T09:30:00Z') }),
      ).toBe(true);
    });

    it('never re-escalates or escalates a replied thread', () => {
      const args = { createdAt: '2026-10-22T04:30:00Z', now: at('2026-10-22T09:30:00Z') };
      expect(shouldEscalate({ ...args, alreadyEscalated: true })).toBe(false);
      expect(shouldEscalate({ ...args, replied: true })).toBe(false);
    });

    it('counts business milliseconds only', () => {
      expect(businessMsBetween(at('2026-10-22T04:30:00Z'), at('2026-10-22T09:30:00Z'))).toBe(
        5 * 3_600_000,
      );
      expect(businessMsBetween(at('2026-10-22T13:00:00Z'), at('2026-10-22T14:00:00Z'))).toBe(0);
      expect(businessMsBetween(at('2026-10-22T09:30:00Z'), at('2026-10-22T04:30:00Z'))).toBe(0);
    });
  });
});
