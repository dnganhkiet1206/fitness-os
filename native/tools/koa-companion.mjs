/**
 * Koa is Today-only (2026-10-03, Kiệt's decision).
 *
 * ── what changed ──
 *
 * The floating KoaCompanion used to mount at the root (_layout.tsx) and follow
 * the user across every screen. That is now disabled. Koa appears only on the
 * Today screen (via <Mascot> in (tabs)/index.tsx), which remains the entry
 * point to /mascot-room.
 *
 * ── what this gate checks ──
 *
 * 1. <KoaCompanion /> is NOT mounted in src/app/_layout.tsx
 * 2. The component file still exists (for reference) but is not imported
 *    by _layout.tsx
 *
 * The old checks (no query subscriptions, no layout animations, etc.) are
 * obsolete — the component is not mounted anywhere, so it cannot cause those
 * problems.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const LAYOUT = 'src/app/_layout.tsx';
const layoutCode = strip(read(LAYOUT));

/* ── 1. KoaCompanion must not be mounted in _layout.tsx ── */
if (/<KoaCompanion\s*\/>/.test(layoutCode)) {
  problems.push(
    `${LAYOUT} vẫn mount <KoaCompanion /> — theo quyết định Today-only (2026-10-03), ` +
      'Koa chỉ còn trên màn Today, không còn floating companion',
  );
}

/* ── 2. KoaCompanion must not be imported in _layout.tsx ── */
if (/import.*KoaCompanion.*from/.test(layoutCode)) {
  problems.push(
    `${LAYOUT} vẫn import KoaCompanion — component không còn được dùng, xóa import`,
  );
}

if (problems.length) {
  console.log('bạn đồng hành Koa CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'bạn đồng hành Koa OK — <KoaCompanion /> không còn mount ở _layout.tsx (Today-only, 2026-10-03); ' +
    'Koa chỉ còn trên màn Today qua <Mascot>, là đường vào /mascot-room',
);
