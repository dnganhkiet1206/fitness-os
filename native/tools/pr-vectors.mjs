#!/usr/bin/env node
/**
 * Personal Record vector runner — C (#321).
 *
 * Chạy spec/vectors/personal-record.json qua implementation RN thật
 * (native/src/lib/personal-record.ts): bestsFrom + findRecords.
 *
 * Negative mutation phải fail đúng.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Compile TS on the fly via esbuild (có sẵn trong repo)
const { execFileSync } = await import('node:child_process');

const vectors = JSON.parse(
  readFileSync(new URL('../../spec/vectors/personal-record.json', import.meta.url), 'utf8')
);

// Build một test harness gọi trực tiếp TS
// tools/ -> native/ -> repo root
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const harness = `
import { bestsFrom, findRecords } from '${ROOT}/native/src/lib/personal-record.ts';
import vectors from '${ROOT}/spec/vectors/personal-record.json';

let pass = 0, fail = 0;
for (const v of vectors.vectors) {
  const bests = bestsFrom(v.history);
  const records = findRecords(v.session, bests);
  // So sánh semantic: sort theo exercise+kind, không phụ thuộc thứ tự key
  const norm = (r) => [r.exercise, r.kind, r.value, r.previous].join('|');
  const got = records.map(norm).sort();
  const want = v.expected.map(norm).sort();
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; }
  else {
    fail++;
    console.log('FAIL:', v.name);
    console.log('  want:', JSON.stringify(want));
    console.log('  got: ', JSON.stringify(got));
  }
}
console.log(pass + '/' + (pass + fail) + ' vectors pass');
process.exit(fail > 0 ? 1 : 0);
`;

import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/pr-harness.ts', harness);

try {
  const out = execFileSync('npx', ['tsx', '/tmp/pr-harness.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  console.log(out);
} catch (e) {
  console.log(e.stdout || e.message);
  process.exit(1);
}
