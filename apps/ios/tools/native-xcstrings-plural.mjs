#!/usr/bin/env node
/**
 * Plural trong String Catalog phải nhắc tới con số — B (#527).
 *
 * Lỗi đã gặp (run 37648967552, app-macos, nhánh widget):
 *
 *   Localizable.xcstrings: error: Plural variation requires referencing the
 *   number in the string. To maintain grammatical correctness for strings
 *   that do not reference the number of items, use separate top-level
 *   strings for one and greater than one. (vi: widget.streak.days %lld)
 *
 * Không bước nào trước Xcode bắt được: `native-i18n-forensic` kiểm chuỗi cứng
 * trong Swift, `native-i18n-plural-audit` chỉ đọc Swift và không nằm trong
 * cổng, và cả hai không đọc `.xcstrings`. Lỗi chỉ lộ ở `xcodebuild` trên
 * macOS, sau ~10 phút.
 *
 * Luật (đúng phạm vi lỗi Xcode đã báo, không rộng hơn): mọi `variations.plural`
 * ở cấp localization của mọi `.xcstrings` trong apps/ios phải có dạng `other`,
 * và giá trị của `other` phải chứa một format specifier (%lld, %d, %@, %1$lld…).
 * Một từ không kèm số ("ngày", "days") thì là hai khoá riêng, như RN làm.
 *
 *   node apps/ios/tools/native-xcstrings-plural.mjs              # quét catalog thật
 *   node apps/ios/tools/native-xcstrings-plural.mjs --self-test  # bad-* phải đỏ, good-* phải xanh
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const FIXTURES = join(ROOT, 'apps/ios/tools/fixtures/xcstrings-plural');
const SKIP = new Set(['node_modules', 'build', 'DerivedData', '.build', 'fixtures']);

/** Format specifier kiểu printf/Foundation; `%%` không tính. */
const SPECIFIER = /%(?!%)(\d+\$)?[-+ 0#]*\d*(\.\d+)?(hh|h|ll|l|q|z|t|j)?[dDiuUxXoOfFeEgGcCsSpaA@]/;

export function check(catalog, file) {
  const errors = [];
  for (const [key, entry] of Object.entries(catalog.strings ?? {})) {
    for (const [lang, loc] of Object.entries(entry.localizations ?? {})) {
      const plural = loc?.variations?.plural;
      if (!plural) continue;
      const other = plural.other?.stringUnit?.value;
      if (other === undefined) {
        errors.push(`${file}: plural thiếu dạng "other" (${lang}: ${key})`);
      } else if (!SPECIFIER.test(other)) {
        errors.push(
          `${file}: plural không nhắc tới con số — "${other}" (${lang}: ${key}). ` +
            'Xcode từ chối; dùng hai khoá riêng cho một / nhiều.',
        );
      }
    }
  }
  return errors;
}

function catalogs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) catalogs(p, out);
    else if (name.endsWith('.xcstrings')) out.push(p);
  }
  return out;
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

if (process.argv.includes('--self-test')) {
  let bad = 0;
  for (const name of readdirSync(FIXTURES).sort()) {
    const errors = check(read(join(FIXTURES, name)), name);
    const wantRed = name.startsWith('bad-');
    const ok = wantRed ? errors.length > 0 : errors.length === 0;
    console.log(`${ok ? 'ok  ' : 'SAI '} ${name}: ${errors.length ? errors.join('; ') : 'xanh'}`);
    if (!ok) bad++;
  }
  if (bad) {
    console.log(`native-xcstrings-plural --self-test: ĐỎ (${bad} fixture sai kỳ vọng)`);
    process.exit(1);
  }
  console.log('native-xcstrings-plural --self-test: XANH');
} else {
  const files = catalogs(join(ROOT, 'apps/ios'));
  const errors = files.flatMap((p) => check(read(p), relative(ROOT, p)));
  if (errors.length) {
    console.log('FAIL:');
    errors.forEach((e) => console.log(' ', e));
    process.exit(1);
  }
  console.log(`native-xcstrings-plural: XANH (${files.length} catalog)`);
}
