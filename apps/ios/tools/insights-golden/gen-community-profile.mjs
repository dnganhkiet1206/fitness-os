#!/usr/bin/env node
/**
 * Golden cho form hồ sơ cộng đồng (#527, lát 2) — mã RN @ fac9ac2:
 * `app/community-profile.tsx` (`HANDLE`, `h`, `handleBad`, `canSave`; màn không
 * export nên dòng `const HANDLE` được đọc NGUYÊN VĂN từ git) và phần chuẩn hoá
 * hàng ghi của `useSaveCommunityProfile` (`hooks/use-community.ts`).
 *
 *   node gen-community-profile.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-profile-golden.json
 */
import { execSync } from 'node:child_process';

const screen = execSync('git show "fac9ac2:native/src/app/community-profile.tsx"', { encoding: 'utf8' });
const line = screen.split('\n').find((l) => l.startsWith('const HANDLE = '));
if (!line) throw new Error('không thấy `const HANDLE` trong community-profile.tsx');
// eslint-disable-next-line no-eval
const HANDLE = eval(line.replace('const HANDLE = ', '').replace(/;$/, ''));

const HANDLES = [
  '', ' ', 'ab', 'abc', 'ABC', ' abc ', 'a.b_c', 'a-b', 'a b', 'kiet.1206', 'x'.repeat(24), 'x'.repeat(25),
  'İstanbul', 'straße', 'café', 'ab ', ' abc', '﻿abc', 'abc ', 'abc\n', '\tabc',
  'a..b', '___', '...', '123', 'ÀBC', 'abc😀', 'Kiệt', 'ABCdef_09.', ' A B ', 'ab　', '​abc',
];
const NAMES = ['', ' ', 'Kiệt', '  Kiệt  ', ' ', '　', '﻿', 'x'.repeat(40), '​'];
const BIOS = ['', '  hi  ', '\n\nline\n', ' bio '];

const handle = HANDLES.map((raw) => {
  const h = raw.trim().toLowerCase();
  return { raw, h, valid: HANDLE.test(h), bad: h.length > 0 && !HANDLE.test(h) };
});
const save = [];
for (const raw of ['abc', ' AB.c ', 'ab']) {
  for (const name of NAMES) {
    const h = raw.trim().toLowerCase();
    save.push({ handle: raw, name, canSave: HANDLE.test(h) && name.trim().length > 0 });
  }
}
const rows = [];
for (const name of NAMES.slice(0, 4)) {
  for (const bio of BIOS) {
    rows.push({
      handle: ' Kiet.Dev ', name, bio,
      row: { handle: ' Kiet.Dev '.trim().toLowerCase(), display_name: name.trim(), bio: bio.trim() },
    });
  }
}
process.stdout.write(JSON.stringify({ pattern: String(HANDLE), handle, save, rows }, null, 1) + '\n');
