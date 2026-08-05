/**
 * The edge-function failure classifier, run against real inputs.
 *
 * ── why this is worth a tool ──
 *
 * This function decides what a person is told the day a new Supabase project
 * is connected: "not deployed" sends you to deploy a function, "provider error"
 * sends you to the model API key, "signed out" sends you to auth. Get the
 * mapping wrong and every one of those says the wrong thing, and the person
 * debugging it is chasing the wrong problem — which is the exact failure the
 * classifier was written to end.
 *
 * It could not be tested before. It lived next to the Supabase client, which
 * pulls in React Native and will not load in Node, so it was verified by
 * reading. `src/lib/edge-failure.ts` imports nothing, so this compiles it and
 * calls it.
 *
 * ── on the shapes ──
 *
 * `FunctionsHttpError` carries the response under `context`; some paths expose
 * `status` directly; `FunctionsFetchError` carries neither because there was no
 * response. None of that is guaranteed by a type, which is why the classifier
 * reads defensively — and why the cases below include the shapes it must not
 * choke on as well as the ones it must recognise.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'edgefail-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/edge-failure.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const { classify, AI_FAILURE_KEY } = await import(
    pathToFileURL(path.join(out, 'edge-failure.js')).href
  );

  const CASES = [
    // what the client actually hands back, and what it has to mean
    [{ context: { status: 404 } }, 'not-deployed', 'function chưa deploy'],
    [{ status: 404 }, 'not-deployed', '404 phẳng'],
    [{ context: { status: 401 } }, 'unauthorised', 'hết phiên'],
    [{ context: { status: 403 } }, 'unauthorised', 'bị từ chối'],
    /*
      429 fell through to `unknown` before, so someone who had used up the
      day's AI was told "something went wrong" — and the one thing they could
      act on, waiting, was the thing the message hid. Two senders, one meaning:
      `_shared/guard.ts` when the caller's own quota is spent, and the relayed
      provider 429 when the model is the one refusing.
    */
    [{ context: { status: 429 } }, 'rate-limited', 'hết lượt AI trong ngày'],
    [{ status: 429 }, 'rate-limited', '429 phẳng'],
    [{ context: { status: 500 } }, 'provider-error', 'function chạy rồi hỏng'],
    [{ context: { status: 503 } }, 'provider-error', 'nhà cung cấp quá tải'],
    [{ message: 'Failed to send a request to the Edge Function' }, 'offline', 'không tới nơi'],
    [{ message: 'TypeError: fetch failed' }, 'offline', 'fetch hỏng'],
    [{ message: 'something odd' }, 'unknown', 'không hiểu'],
    // shapes it must survive rather than throw on
    [null, 'unknown', 'null'],
    [undefined, 'unknown', 'undefined'],
    [{}, 'unknown', 'object rỗng'],
    ['a string', 'unknown', 'chuỗi'],
  ];

  const problems = [];
  for (const [input, want, label] of CASES) {
    let got;
    try {
      got = classify(input);
    } catch (e) {
      problems.push(`${label}: ném lỗi (${e.message})`);
      continue;
    }
    if (got !== want) problems.push(`${label}: trả "${got}", đáng lẽ "${want}"`);
  }

  // every failure must have something to say; a missing key renders `undefined`
  for (const failure of new Set(CASES.map((c) => c[1]))) {
    if (!AI_FAILURE_KEY[failure]) problems.push(`"${failure}" không có chuỗi hiển thị`);
  }

  if (problems.length) {
    console.error('phân loại lỗi edge sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(`phân loại lỗi edge OK — ${CASES.length} ca, mọi lỗi đều có chuỗi hiển thị`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
