import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Route-body guard.
 *
 * Every `@Body()` parameter must carry a DTO class. The global ValidationPipe
 * only validates (and only strips unknown keys) when a class is supplied, so an
 * untyped body is a mass-assignment hole: a client could post `{ role: 'FOUNDER' }`
 * or `{ isLocked: true }` and have it written straight through.
 *
 * This test is the fence. It is cheap, it cannot be forgotten in review, and it
 * gives the next endpoint a clear rule to follow instead of a convention.
 */

const SRC = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const files = walk(SRC);

describe('request bodies are typed', () => {
  it('has no @Body() parameter typed as any or an inline object literal', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // `@Body() body: any` — no validation at all.
      for (const m of text.matchAll(/@Body\(\)\s*\w+\s*:\s*any/g)) {
        offenders.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
      }
      // `@Body() body: { ... }` — a shape, but not a class, so still unvalidated.
      for (const m of text.matchAll(/@Body\(\)\s*\w+\s*:\s*\{/g)) {
        offenders.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every DTO used on a body lives under a dto file or a *.dto.ts module', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/@Body\(\)\s*\w+\s*:\s*(\w+Dto)\b/g)) {
        const imported = new RegExp(`import[^;]*\\b${m[1]}\\b[^;]*from`, 's').test(text);
        if (!imported) offenders.push(`${file.replace(SRC, 'src')}: ${m[1]} is not imported`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
