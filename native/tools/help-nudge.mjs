/**
 * That the help hint stops.
 *
 * ── the thing being prevented ──
 *
 * A hint that points at a `?` on a card somebody opens every single morning.
 * Asked for, and useful — right up until it is not counted, at which point it
 * is the app tapping you on the shoulder daily to ask whether you have
 * understood the thing you understood in March.
 *
 * So the interesting assertions here are all about *silence*: after three
 * showings, after the help is opened, and within one run of the app. A test
 * that only proves the hint appears would pass for the version that never
 * shuts up.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/*
  Compiled *inside* the project, not in /tmp.

  This is the one tool here whose module under test has a runtime import —
  `@react-native-async-storage/async-storage`. Node resolves that from the
  requiring file's directory, so a build in /tmp cannot find `node_modules` and
  dies with MODULE_NOT_FOUND before a single case runs. Removed in `finally`.
*/
const out = mkdtempSync(path.join(NATIVE, '.check-nudge-'));

/*
  A fake AsyncStorage, injected through the module cache before the compiled
  module is required. The real one is a native module; the logic under test is
  the counting, and the counting does not care what the bytes land in.
*/
const require_ = createRequire(import.meta.url);
function installFakeStorage() {
  let store = {};
  const fake = {
    getItem: async (k) => (k in store ? store[k] : null),
    setItem: async (k, v) => {
      store[k] = v;
    },
  };
  const id = require_.resolve('@react-native-async-storage/async-storage');
  require_.cache[id] = { id, filename: id, loaded: true, exports: { default: fake, ...fake } };
  return {
    storage: fake,
    clear: () => {
      store = {};
    },
  };
}

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/help-nudge.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--esModuleInterop'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { storage, clear } = installFakeStorage();
  const mod = require_(path.join(out, 'help-nudge.js'));
  const { shouldNudge, noteNudged, noteHelpOpened, resetRun, NUDGE_LIMIT } = mod;

  const problems = [];
  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };
  /** one app run: ask, and count it if it said yes */
  const run = async (topic) => {
    resetRun();
    const show = await shouldNudge(topic);
    if (show) await noteNudged(topic);
    return show;
  };

  const main = async () => {
    /* ── it does appear, for the first few runs ── */
    eq('lần chạy đầu thì hiện', await run('readiness'), true);
    eq('lần chạy thứ hai vẫn hiện', await run('readiness'), true);
    eq('lần thứ ba vẫn hiện', await run('readiness'), true);
    /*
      And then stops, forever. Somebody who has ignored it three times has
      decided; a fourth is the app refusing to take the answer.
    */
    eq(`quá ${NUDGE_LIMIT} lần thì thôi hẳn`, await run('readiness'), false);
    eq('và vẫn thôi ở lần sau nữa', await run('readiness'), false);

    /* ── opening the help ends it immediately ── */
    clear();
    resetRun();
    eq('trước khi mở thì có hiện', await run('help-once'), true);
    await noteHelpOpened('help-once');
    eq('mở rồi thì không nhắc nữa', await run('help-once'), false);
    /*
      Even from a fresh run, and even though only one of the three showings has
      been spent. The hint exists to get the button pressed; pressed, it has no
      remaining purpose.
    */
    resetRun();
    eq('mở rồi thì lần chạy sau cũng không nhắc', await run('help-once'), false);

    /* ── at most once per app run ── */
    clear();
    resetRun();
    eq('trong một lần chạy, hỏi lần đầu thì có', await shouldNudge('once-per-run'), true);
    eq('… hỏi lại ngay thì không', await shouldNudge('once-per-run'), false);
    eq('… và lần thứ ba cũng không', await shouldNudge('once-per-run'), false);
    resetRun();
    eq('sang lần chạy mới thì lại được', await shouldNudge('once-per-run'), true);

    /* ── two cards do not share a budget ── */
    clear();
    resetRun();
    await shouldNudge('a');
    eq('chủ đề khác vẫn được hiện trong cùng lần chạy', await shouldNudge('b'), true);

    /*
      Self-test: the version with no per-run guard, rebuilt.

      "Read the stored count, compare it to the limit, answer" is the shape
      somebody reaches for first, and it passes every case above except the
      once-per-run ones. It is also the version that ruins the feature: Today
      is a tab that stays mounted but this card remounts whenever the daily log
      refetches, so the hint would reappear several times a session while still
      claiming a budget of three — because a showing that was never dismissed
      was never counted.

      So the rebuild has to disagree with the real one *inside a single run*.
      If it does not, the once-per-run cases above are not testing the guard.
    */
    clear();
    resetRun();
    const noGuard = async (topic) => {
      const all = JSON.parse((await storage.getItem('ascnd-help-nudge')) ?? '{}');
      const st = all[topic] ?? { count: 0, opened: false };
      return !st.opened && st.count < NUDGE_LIMIT;
    };
    await shouldNudge('selftest');
    await noteNudged('selftest');
    if ((await noGuard('selftest')) !== true || (await shouldNudge('selftest')) !== false) {
      console.error(
        'phép tự kiểm hỏng — bản không có chốt "mỗi lần chạy một lần" đáng lẽ phải hiện lại ngay trong cùng lần chạy, đừng tin kết quả',
      );
      process.exit(1);
    }

    if (problems.length) {
      console.error('nhắc nhở trợ giúp sai:\n');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }

    console.log(
      `nhắc nhở trợ giúp OK — 14 ca; tối đa ${NUDGE_LIMIT} lần rồi thôi hẳn, mở trợ giúp một lần là dừng vĩnh viễn, mỗi lần chạy app chỉ nhắc một lần, hai chủ đề không dùng chung hạn mức`,
    );
  };

  await main();
} finally {
  rmSync(out, { recursive: true, force: true });
}
