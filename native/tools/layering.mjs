/**
 * `lib/` does not reach upwards, and nothing imports itself in a circle.
 *
 * ── the bug this was written for ──
 *
 * Three files formed a runtime import cycle:
 *
 *     hooks/use-mascot.tsx → lib/koa-stage.ts → hooks/use-mascot-emotion.tsx
 *                          → hooks/use-mascot.tsx
 *
 * Every edge was a **value** import, so this was a real cycle rather than a
 * type-level artefact that erases at build time. Under Metro, one module in a
 * cycle gets a partially-initialised `exports` object, and which one depends on
 * who is required first.
 *
 * It worked. That is the whole problem with this class of bug: every use sat
 * inside a function body, so by the time anything called, all three modules had
 * finished loading. It would have kept working right up until somebody added a
 * single call at module scope in any of the three — a constant derived from a
 * helper, a store initialised eagerly — at which point the app throws at
 * startup, on the slowest device first, with a stack naming none of the three
 * files and a message about an undefined binding.
 *
 * ── and the direction, which is the cause rather than the symptom ──
 *
 * The cycle existed because `lib/koa-stage.ts` imported one function from a
 * *hook*. Cycles are the visible failure; a layer reaching upwards is what
 * produces them. `lib/` is the bottom of this app — pure logic, no React — so
 * an edge from `lib/` to `hooks/` or `components/` is both a cycle waiting to
 * close and a piece of React pulled into something that wanted arithmetic.
 * `hooks/use-extras.ts` had the same shape one layer up, importing
 * `fireCelebration` from a component to reach a one-line pass-through to
 * `lib/celebration-queue.ts`.
 *
 * ── type-only imports are exempt, and that is not a loophole ──
 *
 * `import type` is erased entirely before the bundle exists, so it cannot form
 * a runtime cycle and cannot pull React anywhere. `lib/mascot-emotion.ts`
 * legitimately names `MascotMood` from a hook this way.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
  { cwd: NATIVE, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'));

/** `src/lib/koa-stage.ts` → `lib/koa-stage` */
const idOf = (f) => f.replace(/^src\//, '').replace(/\.tsx?$/, '');
const known = new Set(files.map(idOf));

/** Value imports only, keyed by module id. */
const edges = new Map();

for (const f of files) {
  let src;
  try {
    src = readFileSync(path.join(NATIVE, f), 'utf8');
  } catch {
    continue;
  }
  const out = new Set();
  /*
    `import ... from '@/x'` — but not `import type ...`, and not a specifier
    list that is entirely `type` members. Both are erased before runtime.
  */
  /*
    `[^;']` and not `[\s\S]` — the lazy version spanned whole statements. Given

        import { useSyncExternalStore } from 'react';
        import type { CelebrationAward } from '@/components/…';

    it started at the *first* `import`, skipped past `from 'react'` (no `@/`),
    and captured everything up to the second specifier as one clause. That
    clause does not begin with `type`, so a genuinely type-only import was
    reported as a value import — and the rule confidently named a runtime cycle
    that does not exist. Barring `;` and `'` keeps a match inside one statement.
  */
  for (const m of src.matchAll(/import\s+([^;']*?)\s+from\s+'@\/([^']+)'/g)) {
    const clause = m[1];
    if (/^type\b/.test(clause.trim())) continue;
    const target = m[2];
    if (!known.has(target)) continue;

    /* A brace list whose every member is `type X` is also fully erased. */
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces && !clause.replace(/\{[\s\S]*\}/, '').trim()) {
      const members = braces[1].split(',').map((x) => x.trim()).filter(Boolean);
      if (members.length > 0 && members.every((x) => /^type\s/.test(x))) continue;
    }
    out.add(target);
  }
  edges.set(idOf(f), out);
}

if (edges.size < 50) {
  problems.push(`chỉ đọc được ${edges.size} module — bộ quét hỏng, đừng tin kết quả`);
}

/* ── 1. nothing in lib/ imports upwards at runtime ── */
for (const [from, tos] of edges) {
  if (!from.startsWith('lib/')) continue;
  for (const to of tos) {
    if (to.startsWith('hooks/') || to.startsWith('components/') || to.startsWith('app/')) {
      problems.push(
        `${from} import GIÁ TRỊ từ ${to} — lib/ là tầng đáy (logic thuần, không React). ` +
          'Một cạnh đi ngược lên vừa là một vòng đang chờ khép lại, vừa kéo React vào thứ chỉ ' +
          'cần số học. Nếu chỉ cần kiểu dữ liệu thì dùng `import type`, nó bị xoá trước khi chạy',
      );
    }
  }
}

/* ── 2. and hooks/ do not reach into components/ to reach a lib ── */
for (const [from, tos] of edges) {
  if (!from.startsWith('hooks/')) continue;
  for (const to of tos) {
    if (to.startsWith('components/')) {
      problems.push(
        `${from} import GIÁ TRỊ từ ${to} — hook với tay vào component thường là để chạm tới ` +
          'một hàm mà component đó chỉ chuyển tiếp; gọi thẳng lib đứng sau nó',
      );
    }
  }
}

/* ── 3. no runtime cycle anywhere ── */
{
  const colour = new Map(); // 0 = visiting, 1 = done
  const stack = [];
  const found = new Set();

  const walk = (node) => {
    colour.set(node, 0);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!edges.has(next)) continue;
      if (colour.get(next) === 0) {
        const at = stack.indexOf(next);
        const loop = [...stack.slice(at), next];
        /* Keyed by its members so the same cycle found from three entry points
           is reported once. */
        const key = [...loop].slice(0, -1).sort().join('|');
        if (!found.has(key)) {
          found.add(key);
          problems.push(
            `vòng import lúc chạy: ${loop.join(' → ')} — ` +
              'hôm nay sống được vì mọi chỗ dùng đều nằm trong thân hàm, nhưng một lời gọi ở ' +
              'module scope bất kỳ đâu trong vòng này sẽ hỏng lúc KHỞI ĐỘNG, trên máy chậm nhất, ' +
              'với stack không nhắc tên file nào trong ba file',
          );
        }
      } else if (colour.get(next) === undefined) {
        walk(next);
      }
    }
    stack.pop();
    colour.set(node, 1);
  };

  for (const node of edges.keys()) {
    if (colour.get(node) === undefined) walk(node);
  }
}

if (problems.length) {
  console.log('tầng và vòng import:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  if (problems.length > 10) console.log(`  … và ${problems.length - 10} lỗi nữa`);
  process.exit(1);
}

console.log(
  `tầng import OK — quét ${edges.size} module: không file nào trong lib/ import GIÁ TRỊ từ ` +
    'hooks/, components/ hay app/ (chỉ `import type`, thứ bị xoá trước khi chạy nên không tạo ' +
    'được vòng); không hook nào với tay vào component để chạm tới một lib; và không có vòng ' +
    'import nào ở tầng chạy — bản đã ship có một vòng ba cạnh giá trị ' +
    '(use-mascot → koa-stage → use-mascot-emotion → use-mascot) sống được chỉ vì mọi chỗ dùng ' +
    'đều nằm trong thân hàm',
);
