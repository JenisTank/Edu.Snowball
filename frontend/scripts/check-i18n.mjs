#!/usr/bin/env node
/**
 * i18n key check.
 *
 * `t('some.key')` never throws: an unknown key renders as the key itself, which
 * looks like a bug on screen but passes every other check. This script closes
 * that gap — every key used in `src/` must exist in the English dictionary, and
 * every English key must have a Gujarati entry so the staff portal is fully
 * bilingual.
 *
 * Run: node scripts/check-i18n.mjs   (CI: "Frontend — build" job)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const i18nPath = join(root, 'src', 'lib', 'i18n.tsx');

const source = readFileSync(i18nPath, 'utf8');

/** Pull the keys out of one dictionary block (`const en = { … };`). */
function keysOf(name) {
  const start =
    source.indexOf(`const ${name} = {`) >= 0
      ? source.indexOf(`const ${name} = {`)
      : source.indexOf(`const ${name}:`);
  if (start === -1) throw new Error(`dictionary "${name}" not found`);
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end);
  const keys = new Set();
  for (const m of block.matchAll(/^\s*['"]([\w.]+)['"]\s*:/gm)) keys.add(m[1]);
  return keys;
}

const en = keysOf('en');
const gu = keysOf('gu');

/** Label dictionary (English literal → Gujarati), used by `useLabels()`. */
function labelKeys() {
  const start = source.indexOf('const LABELS_GU');
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end);
  const out = new Set();
  for (const m of block.matchAll(/^\s*(?:['"](.+?)['"]|([A-Za-z_$][\w$]*))\s*:/gm))
    out.add(m[1] ?? m[2]);
  return out;
}
const labels = labelKeys();

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(full) ? [full] : [];
  });
}

const used = new Map(); // key -> [files]
for (const file of walk(join(root, 'src'))) {
  if (file.endsWith(join('lib', 'i18n.tsx'))) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) {
    const list = used.get(m[1]) ?? [];
    list.push(file.replace(root + '/', ''));
    used.set(m[1], list);
  }
}

const usedLabels = new Map(); // English literal -> [files]
for (const file of walk(join(root, 'src'))) {
  if (file.endsWith(join('lib', 'i18n.tsx'))) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bL\(\s*['"](.+?)['"]\s*\)/g)) {
    if (/^https?:/.test(m[1])) continue; // URL placeholders stay as-is
    const list = usedLabels.get(m[1]) ?? [];
    list.push(file.replace(root + '/', ''));
    usedLabels.set(m[1], list);
  }
}

const missingLabels = [...usedLabels.keys()].filter((k) => !labels.has(k));
const missingInEn = [...used.keys()].filter((k) => !en.has(k));
const missingInGu = [...en].filter((k) => !gu.has(k));
const unused = [...en].filter((k) => !used.has(k));

const problems = [];
if (missingInEn.length) {
  problems.push(
    `Unknown keys used in code (rendered literally on screen):\n` +
      missingInEn.map((k) => `  ${k}  ← ${used.get(k).join(', ')}`).join('\n'),
  );
}
if (missingLabels.length) {
  problems.push(
    `Labels with no Gujarati translation (falling back to English):\n` +
      missingLabels.map((k) => `  ${k}  ← ${usedLabels.get(k).join(', ')}`).join('\n'),
  );
}
if (missingInGu.length) {
  problems.push(`English keys with no Gujarati translation:\n  ${missingInGu.join('\n  ')}`);
}

if (problems.length) {
  console.error(`✖ i18n check failed\n\n${problems.join('\n\n')}\n`);
  process.exit(1);
}

console.log(
  `✓ i18n: ${en.size} keys · ${used.size} used · ${labels.size} labels (${usedLabels.size} in use) · ${unused.length} unused keys` +
    (unused.length ? ` (${unused.slice(0, 8).join(', ')}${unused.length > 8 ? '…' : ''})` : ''),
);
