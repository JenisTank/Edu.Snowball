import { certificateNo, nextSerial } from '../src/modules/certificates/certificates.rules';

describe('certificate serials', () => {
  it('starts at 0001 and increments per unit', () => {
    expect(nextSerial('BB-U1-CERT-2627-', undefined)).toBe(1);
    expect(nextSerial('BB-U1-CERT-2627-', 'BB-U1-CERT-2627-0009')).toBe(10);
    expect(certificateNo('U1', 10)).toBe('BB-U1-CERT-2627-0010');
  });

  it('keeps units independent', () => {
    expect(nextSerial('BB-U3-CERT-2627-', 'BB-U1-CERT-2627-0025')).toBe(1);
  });

  it('recovers from a malformed serial instead of producing NaN', () => {
    expect(nextSerial('BB-U1-CERT-2627-', 'BB-U1-CERT-2627-ABCD')).toBe(1);
  });
});
