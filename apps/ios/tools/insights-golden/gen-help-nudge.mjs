#!/usr/bin/env node
/**
 * Golden cho lời nhắc "?" (#527, chỉ thị 6103829484) — CHÍNH `lib/help-nudge.ts`
 * + `lib/user-scoped-reset.ts` @ fac9ac2 biên dịch (`build.sh`; AsyncStorage
 * giả trong bộ nhớ). Mỗi ca là một chuỗi thao tác:
 *
 *   mount   = effect của `useHelpTopic` (`help-button.tsx:33-42`): shouldNudge,
 *             đúng thì noteNudged — ghi lại có hiện hay không;
 *   open    = `openHelp` → noteHelpOpened;
 *   launch  = mở lại app: tập `shownThisRun` (module scope) mới, kho giữ nguyên;
 *   corrupt = chuỗi lưu hỏng;
 *   signout = `clearUserScopedStorage`: xoá khoá + `runUserScopedResets()`
 *             (native: sang một người khác).
 *
 * Sau mỗi bước: `{count, opened}` đang lưu của từng chủ đề.
 *
 *   node gen-help-nudge.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/help-nudge-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nudge = require('./out/help-nudge.js');
const { runUserScopedResets } = require('./out/user-scoped-reset.js');
const { __raw } = require('./out/async-storage.js');

const KEY = 'ascnd-help-nudge';
const TOPICS = ['readiness', 'training'];

let seed = 3141;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};

const stored = () => {
  let all = {};
  try {
    all = JSON.parse(__raw.get(KEY) ?? '{}') ?? {};
  } catch {
    all = null;
  }
  return all === null ? null : Object.fromEntries(TOPICS.map((t) => [t, all[t] ?? null]));
};

const OPS = ['mount', 'mount', 'mount', 'mount', 'launch', 'launch', 'open', 'corrupt', 'signout'];
const cases = [];
for (let i = 0; i < 160; i++) {
  __raw.clear();
  nudge.resetRun();
  const steps = [];
  for (let k = 0, n = 3 + rnd(14); k < n; k++) {
    const op = OPS[rnd(i < 20 ? 6 : OPS.length)];
    const topic = TOPICS[rnd(4) === 0 ? 1 : 0];
    let shown = null;
    if (op === 'mount') {
      shown = await nudge.shouldNudge(topic);
      if (shown) await nudge.noteNudged(topic);
    } else if (op === 'open') {
      await nudge.noteHelpOpened(topic);
    } else if (op === 'launch') {
      nudge.resetRun();
    } else if (op === 'corrupt') {
      __raw.set(KEY, '{"readiness":');
    } else if (op === 'signout') {
      __raw.delete(KEY);
      runUserScopedResets();
    }
    steps.push({ op, topic, shown, stored: stored() });
  }
  cases.push({ steps });
}

process.stdout.write(JSON.stringify({ limit: nudge.NUDGE_LIMIT, cases }, null, 1) + '\n');
