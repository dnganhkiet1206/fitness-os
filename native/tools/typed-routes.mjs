/**
 * Regenerate `.expo/types/router.d.ts` from the files actually in `src/app`.
 *
 *   node tools/typed-routes.mjs          # rewrite it
 *   node tools/typed-routes.mjs --check  # fail if it is stale, do not write
 *
 * ── why this exists ──
 *
 * `typedRoutes` is on, so `router.push('/templates')` only compiles if
 * `/templates` is in the generated route union. That file is written by the
 * **dev server**, from a Metro watch handler, and it is gitignored. Which means
 * it is only ever as fresh as the last time somebody ran `expo start` on that
 * particular checkout.
 *
 * Add a page and typecheck without starting Metro — a clean clone, CI, another
 * machine, an agent — and you get
 *
 *     error TS2345: Argument of type '"/templates"' is not assignable to
 *     parameter of type '"/" | RelativePathString | ... 157 more ...'
 *
 * pointing at a line that is correct, about a file that exists, listing 157
 * routes that make it look like a real routing mistake. It is not. The page is
 * there; the list is old.
 *
 * That is the same shape as the stale root `tsconfig.json` that `check.mjs`
 * opens by refusing to run into: a check failing for a reason that has nothing
 * to do with what it checks, and whose error message points confidently at the
 * wrong thing. The fix is the same too — make the mistake impossible rather
 * than remember not to make it.
 *
 * ── how ──
 *
 * The generator is the dev server's own, reached directly rather than through
 * Metro: `@expo/router-server`'s `getTypedRoutesDeclarationFile`, given the
 * same `requireContext` over `src/app` that the watch handler builds. Not a
 * reimplementation — a reimplementation would drift, and a route union that
 * drifts is worse than one that is merely old.
 *
 * The published entry point is `regenerateDeclarations`, which is debounced by
 * a second and swallows its own errors. This calls the function underneath it,
 * so a failure is a failure and the write has happened by the time the process
 * exits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(NATIVE, 'src', 'app');
const OUT = path.join(NATIVE, '.expo', 'types', 'router.d.ts');

const req = createRequire(path.join(NATIVE, 'x.js'));

/*
  `@expo/router-server` is a dependency of the CLI, not of the app, so it is
  nested rather than hoisted. Resolved through `expo`'s own tree instead of
  guessed at, and reported plainly if the layout ever changes — an agent that
  cannot find the generator should say so, not quietly skip the step.
*/
const GENERATOR = 'expo/node_modules/@expo/cli/node_modules/@expo/router-server/build/typed-routes/generate.js';
let generate;
try {
  generate = req(GENERATOR);
} catch {
  console.error(
    `không thấy bộ sinh route: ${GENERATOR}\n` +
      'Nó là dependency của @expo/cli chứ không phải của app, nên đường dẫn có thể\n' +
      'đổi khi nâng SDK. Chạy `npx expo start` một lần để sinh lại router.d.ts.',
  );
  process.exit(2);
}

// `requireContext` reads this, not an argument
process.env.EXPO_ROUTER_APP_ROOT = APP;
const { requireContext } = req('expo-router/internal/testing');
const { EXPO_ROUTER_CTX_IGNORE } = req('expo-router/_ctx-shared');

const file = generate.getTypedRoutesDeclarationFile(requireContext(APP, true, EXPO_ROUTER_CTX_IGNORE), {});
if (!file) {
  console.error('bộ sinh không trả về gì — src/app có thể trống hoặc sai đường dẫn');
  process.exit(2);
}

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
const routes = [...file.matchAll(/pathname: `\/([a-z0-9-]+)`/g)].map((m) => m[1]);
const n = new Set(routes).size;

if (process.argv.includes('--check')) {
  if (current !== file) {
    console.error(
      'router.d.ts đã cũ so với src/app.\n' +
        'Chạy `node tools/typed-routes.mjs` (hoặc `npx expo start` một lần) rồi tsc lại.',
    );
    process.exit(1);
  }
  console.log(`router.d.ts khớp src/app — ${n} route`);
} else {
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, file);
  console.log(current === file ? `router.d.ts đã đúng sẵn — ${n} route` : `đã sinh lại router.d.ts — ${n} route`);
}
