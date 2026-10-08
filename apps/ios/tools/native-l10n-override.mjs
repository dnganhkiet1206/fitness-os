#!/usr/bin/env node
/**
 * Mọi lần tra chữ của app phải đi qua overload đổi ngôn ngữ trong app (#533).
 *
 * `String(localized:)` của Foundation KHÔNG nghe lựa chọn ngôn ngữ trong app
 * (đo trên Foundation thật, `LanguageOverrideTests.foundationAloneIgnoresTheInAppChoice`).
 * ASCNDCore che `String(localized: "key")` và `String(localized: "key", bundle:)`.
 * Một chỗ gọi có thêm `table:` / `locale:` / `comment:` / `defaultValue:` rơi
 * về Foundation, và chữ ấy đứng yên ở ngôn ngữ máy khi người dùng đổi ngôn ngữ
 * — không test nào đỏ, chỉ một dòng tiếng Anh giữa màn tiếng Việt.
 * `NSLocalizedString` và `LocalizedStringResource` dựng tay cũng vậy.
 *
 * Quét: apps/ios/ASCND + ASCNDDesignSystem. Ngoại lệ duy nhất: chính tệp
 * overload (LanguageOverride.swift).
 *
 *   node apps/ios/tools/native-l10n-override.mjs
 *   node apps/ios/tools/native-l10n-override.mjs --self-test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const DIRS = ['apps/ios/ASCND', 'apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem'];
const FIXTURES = join(ROOT, 'apps/ios/tools/fixtures/l10n-override');
const ALLOWED = new Set(['LanguageOverride.swift']);

/** Bỏ chú thích (dòng và khối) để không báo oan câu giải thích. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Các đối số của một lời gọi bắt đầu ngay sau `(`, đếm ngoặc và bỏ qua chuỗi. */
function callArgs(src, open) {
  let depth = 0, inStr = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

/** Nhãn đối số ở cấp ngoài cùng (không tính trong chuỗi / ngoặc con). */
function topLevelLabels(args) {
  const labels = [];
  let depth = 0, inStr = false, start = 0;
  const parts = [];
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(args.slice(start));
  for (const p of parts) {
    const m = /^\s*([A-Za-z_]\w*)\s*:/.exec(p);
    labels.push(m ? m[1] : null);
  }
  return labels;
}

export function check(src, file) {
  const out = [];
  const s = strip(src);
  const line = (i) => s.slice(0, i).split('\n').length;
  for (const m of s.matchAll(/String\s*\(\s*localized\s*:/g)) {
    const open = s.indexOf('(', m.index);
    const labels = topLevelLabels(callArgs(s, open));
    const extra = labels.slice(1).filter((l) => l !== 'bundle');
    if (labels[0] !== 'localized' || extra.length) {
      out.push(`${file}:${line(m.index)}: String(localized:) có ${extra.join(', ') || 'dạng lạ'} — rơi về Foundation, không đổi theo ngôn ngữ trong app`);
    }
  }
  for (const m of s.matchAll(/\b(NSLocalizedString|LocalizedStringResource)\s*\(/g)) {
    out.push(`${file}:${line(m.index)}: ${m[1]}( — không đi qua overload đổi ngôn ngữ trong app`);
  }
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.swift') && !ALLOWED.has(name)) out.push(p);
  }
  return out;
}

if (process.argv.includes('--self-test')) {
  let bad = 0;
  for (const name of readdirSync(FIXTURES).sort()) {
    const found = check(readFileSync(join(FIXTURES, name), 'utf8'), name);
    const wantRed = name.startsWith('bad-');
    const ok = wantRed ? found.length > 0 : found.length === 0;
    console.log(`${ok ? 'ok  ' : 'SAI '} ${name}: ${found.length ? found.join('; ') : 'xanh'}`);
    if (!ok) bad++;
  }
  if (bad) {
    console.log(`native-l10n-override --self-test: ĐỎ (${bad} fixture sai kỳ vọng)`);
    process.exit(1);
  }
  console.log('native-l10n-override --self-test: XANH');
} else {
  const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
  const found = files.flatMap((p) => check(readFileSync(p, 'utf8'), relative(ROOT, p)));
  if (found.length) {
    console.log('FAIL:');
    found.forEach((f) => console.log(' ', f));
    process.exit(1);
  }
  console.log(`native-l10n-override: XANH (${files.length} tệp Swift — mọi lần tra chữ đi qua overload)`);
}
