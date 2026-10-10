#!/usr/bin/env node
/**
 * Hợp đồng của `XcstringsTests` chạy trước Swift (#527, A).
 *
 * ── vì sao có bước này ──
 *
 * `XcstringsTests` (C, #249) đòi mỗi khoá × mỗi ngôn ngữ của
 * `Localizable.xcstrings` có một `stringUnit` dịch xong. Một khoá viết bằng
 * `variations.plural` (dạng Xcode đề nghị cho số đếm) KHÔNG có `stringUnit` ở
 * cấp ngôn ngữ, nên đỏ — nhưng chỉ đỏ ở core-linux / app-macos, sau khi build
 * xong cả gói test. Đã lặp hai lần: A (`52711d8f`, `diary.*`) và E
 * (`321550ac`, 21 lỗi `community.* %lld`). `native-xcstrings-plural.mjs` (B)
 * XANH với cả hai, vì nó canh một lỗi khác của Xcode (plural không nhắc số).
 *
 * ── luật — đúng ba test của `XcstringsTests.swift`, không rộng hơn ──
 *
 * 1. `everyKeyHasEnViEs`: mọi khoá có localization `en`, `vi`, `es`.
 * 2. `noEmptyOrUntranslated`: MỖI localization có mặt (kể cả ngôn ngữ khác ba
 *    thứ trên) có `stringUnit`; `value` bỏ khoảng trắng không rỗng; `state`
 *    là `translated`.
 * 3. `keysFollowAreaNameFormat`: khoá tách theo `.` có ≥ 2 phần, không phần nào
 *    rỗng.
 *
 * Đọc đúng một tệp mà test đọc: `apps/ios/ASCND/Resources/Localizable.xcstrings`.
 * Cách sửa lỗi 2 với số đếm: khoá thường + khoá riêng cho số 1 (vd. `….one`),
 * chọn khoá trong Swift (`55c5ddb4`, `e0d18a3c`).
 *
 *   node apps/ios/tools/native-xcstrings-contract.mjs
 *   node apps/ios/tools/native-xcstrings-contract.mjs --self-test
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const CATALOG = 'apps/ios/ASCND/Resources/Localizable.xcstrings';
const FIXTURES = join(ROOT, 'apps/ios/tools/fixtures/xcstrings-contract');
const REQUIRED = ['en', 'vi', 'es'];

/** Mọi vi phạm của một catalog, theo đúng thứ tự và câu chữ của test. */
function check(text) {
  let strings;
  try {
    strings = JSON.parse(text).strings;
  } catch (e) {
    return [`không đọc được JSON: ${e.message}`];
  }
  if (!strings || typeof strings !== 'object' || Object.keys(strings).length === 0) {
    return ['không đọc được khoá nào'];
  }
  const out = [];
  for (const key of Object.keys(strings).sort()) {
    const locs = strings[key]?.localizations ?? {};
    for (const l of REQUIRED) if (!(l in locs)) out.push(`khoá '${key}' thiếu bản dịch '${l}'`);
    for (const l of Object.keys(locs).sort()) {
      const unit = locs[l]?.stringUnit;
      if (!unit) {
        const how = locs[l]?.variations ? ' (dùng `variations` — tách khoá `.one` / thường)' : '';
        out.push(`khoá '${key}' [${l}]: không có stringUnit${how}`);
        continue;
      }
      if (typeof unit.value !== 'string' || typeof unit.state !== 'string') {
        out.push(`khoá '${key}' [${l}]: stringUnit thiếu value / state (test không giải mã được)`);
        continue;
      }
      if (unit.value.trim() === '') out.push(`khoá '${key}' [${l}]: bản dịch rỗng`);
      if (unit.state !== 'translated') out.push(`khoá '${key}' [${l}]: state '${unit.state}' ≠ translated`);
    }
    const parts = key.split('.');
    if (!(parts.length >= 2 && parts.every((p) => p !== ''))) out.push(`khoá '${key}' không theo dạng area.name`);
  }
  return out;
}

if (process.argv.includes('--self-test')) {
  let bad = 0;
  for (const name of readdirSync(FIXTURES).sort()) {
    const found = check(readFileSync(join(FIXTURES, name), 'utf8'));
    const wantRed = name.startsWith('bad-');
    const ok = wantRed ? found.length > 0 : found.length === 0;
    console.log(`${ok ? 'ok  ' : 'SAI '} ${name}: ${found.length ? found.slice(0, 2).join('; ') + (found.length > 2 ? ` (+${found.length - 2})` : '') : 'xanh'}`);
    if (!ok) bad++;
  }
  if (bad) {
    console.log(`native-xcstrings-contract --self-test: ĐỎ (${bad} fixture sai kỳ vọng)`);
    process.exit(1);
  }
  console.log('native-xcstrings-contract --self-test: XANH');
} else {
  const text = readFileSync(join(ROOT, CATALOG), 'utf8');
  const found = check(text);
  if (found.length) {
    console.log(`native-xcstrings-contract: ĐỎ — ${found.length} vi phạm hợp đồng XcstringsTests trong ${CATALOG}:`);
    for (const f of found.slice(0, 40)) console.log('  ' + f);
    if (found.length > 40) console.log(`  … và ${found.length - 40} vi phạm nữa`);
    process.exit(1);
  }
  console.log(`native-xcstrings-contract: XANH (${Object.keys(JSON.parse(text).strings).length} khoá × ${REQUIRED.join('/')}, đúng 3 luật của XcstringsTests)`);
}
