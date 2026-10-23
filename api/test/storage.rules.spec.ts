import {
  canDeleteDocuments,
  humanSize,
  MAX_DOCUMENT_BYTES,
  safeFileName,
  storageKey,
  validateUpload,
} from '../src/modules/storage/storage.rules';

describe('document uploads', () => {
  it('accepts the document types a preschool actually receives', () => {
    for (const mimeType of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
    ])
      expect(validateUpload({ fileName: 'a.pdf', mimeType, sizeBytes: 1024 })).toEqual({
        ok: true,
      });
  });

  it('refuses executables, unknown types and empty files', () => {
    expect(
      validateUpload({ fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }),
    ).toEqual({ ok: false, error: 'Unsupported file type: application/x-msdownload' });
    expect(validateUpload({ fileName: '', mimeType: 'application/pdf', sizeBytes: 10 }).ok).toBe(
      false,
    );
    expect(
      validateUpload({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 0 }).ok,
    ).toBe(false);
  });

  it('caps a file at 10 MB', () => {
    expect(
      validateUpload({
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: MAX_DOCUMENT_BYTES,
      }).ok,
    ).toBe(true);
    const tooBig = validateUpload({
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: MAX_DOCUMENT_BYTES + 1,
    });
    expect(tooBig).toEqual({ ok: false, error: 'Files larger than 10 MB are not accepted' });
  });

  it('builds a storage key that cannot escape its folder', () => {
    const key = storageKey(
      'u1',
      's1',
      'BIRTH_CERT',
      '../../etc/passwd',
      new Date('2026-10-23T10:00:00Z'),
    );
    expect(key).toBe('u1/s1/BIRTH_CERT/20261023100000-passwd');
    expect(key).not.toContain('..');
  });

  it('keeps a readable file name without spaces', () => {
    expect(safeFileName('Birth Certificate (2024).pdf')).toBe('Birth-Certificate-2024.pdf');
    expect(safeFileName(' Gujarati નામ.pdf')).toBe('-Gujarati-.pdf');
    expect(safeFileName('')).toBe('file');
  });

  it('lets only Head Office and the Centre Head delete a file', () => {
    expect(canDeleteDocuments('FOUNDER')).toBe(true);
    expect(canDeleteDocuments('ACADEMIC_DIR')).toBe(true);
    expect(canDeleteDocuments('CENTRE_HEAD')).toBe(true);
    expect(canDeleteDocuments('RECEPTIONIST')).toBe(false);
    expect(canDeleteDocuments('TEACHER')).toBe(false);
    expect(canDeleteDocuments('PARENT')).toBe(false);
  });

  it('formats sizes for the list', () => {
    expect(humanSize(900)).toBe('900 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
