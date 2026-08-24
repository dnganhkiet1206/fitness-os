/**
 * Every way this app can create value, and the boundary each one stands behind.
 *
 * ── what this file is for ──
 *
 * Not to introduce a rule. To **hold** the ones Chain AA measured, so that the
 * next person to add an economic table, a policy, or a reward key has to walk
 * past a red test rather than past a paragraph.
 *
 * The sweep started from the schema rather than from filenames, and the answer
 * was better than expected. Every table that can hold value —
 * `mascot_transactions`, `streak_freezes`, `entitlements`, `shop_prices`,
 * `reward_prices`, `ai_usage` — is **SELECT-only** for a signed-in client, with
 * every write behind a `SECURITY DEFINER` function. `mascot_inventory` allows
 * one UPDATE and a trigger (`mascot_inventory_no_swap`) refuses any change to
 * `item_key` or `user_id`, so the one writable column is `equipped`. An oracle
 * reasoning only from rows and server constants agreed with the real database
 * across 2000 randomized sequences, with no negative balance and nothing over
 * the daily ceiling.
 *
 * ── the two tables a client CAN write, and what they are worth ──
 *
 * `awards` takes client INSERT and DELETE, and `weekly_challenges` takes all
 * three. Chain T recorded the first; this chain asked the question Chain T
 * left open — *does anything treat an arbitrary award as earned?* Every reader
 * was traced: two screens render them, `useCheckAwards` reads them to avoid
 * duplicates, and the only other consumer is the celebration queue, which is an
 * animation. Mascot unlocks come from counting `workout_sessions` and
 * `meal_entries`, not from awards. So a forged medal buys a picture of a medal.
 *
 * That is a **product decision, not an accident**, and rule G below is what
 * keeps it one: it enumerates who reads `awards` and fails when the set grows,
 * because the day something economic starts reading them is the day the
 * decision changes and somebody should have to say so.
 *
 * ── the one thing that is not verified, and is not a bug ──
 *
 * `claim_quest_reward` derives the amount from the ref_key and never checks
 * that the event was earned. Measured on a clean cluster with nothing done:
 *
 *     ch:platinum:2026-08-17:never_did_this  → 120 xu
 *     w:99999                                → 40 xu
 *     set:runner                             → 180 xu
 *     20 thử thách bịa ra                    → 720 xu, trần ngày chặn ở 800
 *
 * This file deliberately does **not** assert that a reward key must have a
 * completion row behind it. Daily quests have no completion table at all —
 * Chain Y proved `done === true` is derived current state — so such a rule
 * could not be satisfied without an architectural change that chain explicitly
 * deferred. And the position is already written down, in 20260815130000:
 * *"The RPC's job is to bound what a forged call can mint."*
 *
 * So what is locked here is the contract that actually exists: the amount is
 * server-derived, the key is idempotent, the ceiling holds, and no account can
 * reach another's. The unverified entitlement is recorded in the ledger as a
 * defence-in-depth gap with checkable preconditions for `ch:`/`w:`/`set:` — and
 * deliberately left alone, because adding it for three key classes and not the
 * fourth would make the economy authoritative in some places and not others,
 * which is worse than being consistently bounded.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const notes = [];
const out = mkdtempSync(path.join(tmpdir(), 'econ-'));
const want = (ok, m) => { if (!ok) problems.push(m); };
const sh = (c) => { try { return { status: 0, stdout: execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { status: e.status ?? 1, stdout: (e.stdout || '') + (e.stderr || '') }; } };
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
/* Derived from the temp directory so two runs cannot collide; the
   `data_directory` assertion below is the belt to that bracer. */
/* Below the ephemeral range (32768-60999 on Linux): a port inside it can be
   taken by any outbound socket, and under a full `check.mjs` run there are
   many. Standalone this file was green and inside the suite it failed with
   "khong khoi dong duoc PostgreSQL" — bisected to the parent commit, where it
   failed identically, so it is the port and not the change. */
const PORT = 25000 + (Math.abs([...path.basename(out)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 11)) % 400);
const DATA = path.join(out, 'pg');
function stopCluster() {
  if (!PGBIN || !existsSync(DATA)) return;
  /* `pg_ctl` refuses to run as root, and a plain call leaves the postmaster
     holding the port for the next run — which then measures the wrong database
     in silence. Chain Z lost four break-tests to exactly that. */
  const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
  const cmd = `${PGBIN}/pg_ctl -D ${DATA} stop -m immediate`;
  sh(asPg ? `su postgres -c ${JSON.stringify(cmd)} 2>/dev/null` : `${cmd} 2>/dev/null`);
}

try {
  /* ══════════════════════════════════════════════════════════════════════════
     STATIC — the shape of the client, where a database cannot see it
     ══════════════════════════════════════════════════════════════════════════ */

  /* J. no economic mutation may join the offline logging queue.
     The queue carries writes where the person already knows what happened and
     the app is only the paper. A reward is not that: replaying a queued
     purchase after a restart, under whoever is signed in then, is how offline
     support turns into an economic bug. Chain AA measured the queue's seven op
     kinds and none is economic; this keeps it that way. */
  {
    const offline = read('src/lib/offline-write.ts');
    const kinds = [...offline.matchAll(/kind:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    want(kinds.length >= 5, `chỉ đọc được ${kinds.length} loại thao tác offline — luật J không kiểm gì cả`);
    const economic = kinds.filter((k) => /claim|reward|coin|buy|purchase|freeze|award|xp|entitle/.test(k));
    want(
      economic.length === 0,
      `hàng đợi offline nhận thao tác KINH TẾ: ${JSON.stringify(economic)} — hàng đợi này dành cho việc GHI CHÉP, ` +
        'nơi người ta đã biết chuyện gì xảy ra và app chỉ là tờ giấy. Phát lại một lần mua sau khi khởi động lại, ' +
        'dưới bất kỳ ai đang đăng nhập lúc đó, là cách hỗ trợ offline biến thành lỗi kinh tế',
    );
    const hooks = ['src/hooks/use-mascot-room.ts', 'src/hooks/use-extras.ts'];
    for (const h of hooks) {
      want(
        !/mutationKey/.test(read(h)),
        `${h} khai báo mutationKey — mutation kinh tế sẽ sống sót qua persistence và được phát lại ở lần khởi động sau. ` +
          'Hiện tại chúng HỎNG AN TOÀN khi tiến trình chết, và đó là lựa chọn, không phải thiếu sót',
      );
    }
  }

  /* G. who is allowed to read `awards`.
     Arbitrary awards are cosmetic *because* nothing economic consumes them.
     That is a fact about the reader set, so the reader set is what is pinned —
     a new consumer has to be added here on purpose, with somebody deciding
     whether a forged medal may now buy something. */
  {
    const ALLOWED = new Set([
      'src/hooks/use-extras.ts',        // the query itself + duplicate check
      'src/app/awards.tsx',             // renders the wall
      'src/app/mascot-room.tsx',        // renders a count
    ]);
    const found = new Set();
    const walk = (dir) => {
      for (const e of readdirSync(path.join(NATIVE, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          /* Comments stripped first. The first draft matched prose: a note in
             `progress.tsx` saying `useAwards` "used to be read here" — the
             opposite of a reader — turned the rule red. A guard that a sentence
             can trip is a guard that will be silenced. */
          const src = readFileSync(path.join(NATIVE, rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
          if (/from\('awards'\)|useAwards\b/.test(src)) found.add(rel);
        }
      }
    };
    walk('src');
    want(found.size >= 3, `chỉ tìm thấy ${found.size} nơi đọc awards — luật G không kiểm gì cả`);
    const extra = [...found].filter((f) => !ALLOWED.has(f));
    want(
      extra.length === 0,
      `có nơi MỚI đọc bảng awards: ${JSON.stringify(extra)} — awards nhận INSERT/DELETE từ client, nên một huy ` +
        'chương bịa ra chỉ vô hại chừng nào KHÔNG GÌ coi nó là bằng chứng đã đạt được. Mở khoá linh vật đếm ' +
        'workout_sessions và meal_entries chứ không đọc awards; xu và XP suy từ sổ cái. Nếu chỗ đọc mới này ' +
        'quy huy chương thành giá trị, đó là một quyết định sản phẩm và phải được nói ra ở đây',
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DATABASE — everything else, on a cluster we prove we built
     ══════════════════════════════════════════════════════════════════════════ */
  if (!PGBIN) {
    notes.push('không có PostgreSQL trên máy này — phần cơ sở dữ liệu KHÔNG được chạy, và nói rõ là không chạy');
  } else {
    mkdirSync(DATA, { recursive: true });
    const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
    if (asPg) sh(`chmod 755 ${out} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    const run = (c) => (asPg ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
    run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
    run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA} -c max_connections=200" -l ${DATA}/log start`);
    sh('sleep 2');
    const psql = (s, db = 'postgres') => { const f = path.join(out, 'q.sql'); writeFileSync(f, s); return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`); };
    if (psql('SELECT 1;').status !== 0) throw new Error('không khởi động được PostgreSQL');
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).stdout.trim();
    if (live !== DATA) {
      throw new Error(
        `cổng ${PORT} đang được giữ bởi một cluster KHÁC (data_directory=${live}, chờ ${DATA}) — ` +
          'một postmaster mồ côi; mọi luật bên dưới sẽ đo nhầm cơ sở dữ liệu',
      );
    }
    psql('CREATE DATABASE econ;');
    psql(`CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;
      CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;`, 'econ');
    for (const m of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d econ -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
    }
    psql('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;', 'econ');
    const tables = Number(sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d econ -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`).stdout.trim());
    want(tables >= 30, `chỉ dựng được ${tables} bảng — bộ dò hỏng, đừng tin phần cơ sở dữ liệu`);

    /* The real `xpForRefKey`, so rule I judges the shipped derivation. */
    let xpForRefKey = null;
    try {
      try {
        execFileSync('npx', ['tsc', 'src/lib/mascot-room.ts', '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
          '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
          { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { /* `@/` unmapped → TS2307; emits anyway */ }
      const js = path.join(out, 'lib/mascot-room.js');
      writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`));
      ({ xpForRefKey } = createRequire(import.meta.url)(js));
    } catch (e) { problems.push(`không nạp được xpForRefKey: ${e.message}`); }

    const driver = writeDriver(out, PORT, NATIVE);
    const r0 = execFileSync('node', [driver], { cwd: out, encoding: 'utf8', timeout: 900000, maxBuffer: 32 * 1024 * 1024 });
    const line = r0.split('\n').find((l) => l.startsWith('RESULT '));
    if (!line) throw new Error('bộ lái không trả kết quả: ' + r0.slice(0, 500));
    const d = JSON.parse(line.slice(7));
    if (d.harnessError) throw new Error(d.harnessError);

    /* baseline — the harness must be able to move money at all */
    want(d.baseline === '10', `một lần nhận thưởng hợp lệ không cho ra 10 xu (${d.baseline}) — hoặc đường thật đã đổi, hoặc bộ dò không còn lái nó`);

    /* A. mascot_transactions — the ledger takes no dictation */
    want(d.tx.insert === 'refused', `INSERT thẳng vào mascot_transactions KHÔNG bị chặn (${d.tx.insert}) — sổ cái phải chỉ nhận ghi từ hàm SECURITY DEFINER`);
    want(d.tx.update === 0, `UPDATE mascot_transactions sửa được ${d.tx.update} dòng — sổ cái là append-only`);
    want(d.tx.delete === 0, `DELETE mascot_transactions xoá được ${d.tx.delete} dòng — lịch sử kinh tế không được xoá từ client`);

    /* B. streak_freezes — RPC-only (Chain Z owns the idempotency detail) */
    want(d.freeze.insert === 'refused', `INSERT thẳng vào streak_freezes KHÔNG bị chặn (${d.freeze.insert})`);
    want(d.freeze.update === 0 && d.freeze.delete === 0, `streak_freezes sửa/xoá được từ client (${d.freeze.update}/${d.freeze.delete}) — un-spend một freeze là tạo ra giá trị`);

    /* C. entitlements — written by a webhook, read by everyone */
    want(d.ent.insert === 'refused', `client TỰ CẤP được entitlement (${d.ent.insert}) — đây là đường duy nhất tới tier trả phí`);
    want(d.ent.update === 0, `client sửa được entitlement của mình (${d.ent.update} dòng)`);
    want(d.ent.activeTier === 'max' && d.ent.expiredTier === 'free',
      `current_tier() không suy ra tier đang hiệu lực: còn hạn=${d.ent.activeTier} (chờ max), hết hạn=${d.ent.expiredTier} (chờ free) — ` +
        'một entitlement đã hết hạn vẫn mở khoá tier trả phí');
    want(d.ent.afterDelete === 0, `xoá tài khoản rồi tạo lại cùng id vẫn còn ${d.ent.afterDelete} entitlement`);

    /* D/E. the two price lists */
    want(d.prices.shop === 0 && d.prices.shopAfter !== '0', `client sửa được shop_prices (${d.prices.shop} dòng, giá còn ${d.prices.shopAfter})`);
    want(d.prices.reward === 0 && d.prices.rewardAfter === '10', `client sửa được reward_prices (${d.prices.reward} dòng, giá meal còn ${d.prices.rewardAfter})`);

    /* F. mascot_inventory — one writable column, and a trigger that says so */
    want(d.inv.owned === 'head_band', `bộ dò không mua được món nào để kiểm (${d.inv.owned})`);
    want(
      d.inv.swap === 'refused' && d.inv.stillOwns === 'head_band',
      `item_key ĐỔI ĐƯỢC bằng một câu UPDATE (${d.inv.swap}, kho còn ${d.inv.stillOwns}) — chính sách UPDATE tồn tại ` +
        'để bật/tắt `equipped`, và nếu chỉ có nó thì một món 80 xu đổi thành món 800 xu bằng một dòng SQL. ' +
        'trigger mascot_inventory_no_swap là thứ chặn việc đó',
    );
    want(d.inv.owner === 'refused', `user_id của một dòng kho ĐỔI ĐƯỢC (${d.inv.owner}) — chuyển quyền sở hữu là chuyển giá trị`);
    want(d.inv.insert === 'refused' && d.inv.delete === 0, `client INSERT/DELETE thẳng vào kho được (${d.inv.insert}/${d.inv.delete})`);

    /* G. awards — cosmetic, and measured to be so */
    want(d.awards.forged === 'ok', 'bộ dò không cấp được huy chương bịa — luật huy chương không kiểm gì cả');
    want(
      d.awards.balAfter === d.awards.balBefore && d.awards.invAfter === d.awards.invBefore,
      `một huy chương BỊA RA làm đổi trạng thái kinh tế (xu ${d.awards.balBefore}→${d.awards.balAfter}, ` +
        `kho ${d.awards.invBefore}→${d.awards.invAfter}) — huy chương nhận ghi từ client, nên nó chỉ vô hại ` +
        'chừng nào không quy ra được xu, XP hay quyền sở hữu',
    );
    want(d.awards.crossInsert === 'refused' && d.awards.crossDelete === 0, `A ghi/xoá được huy chương của B (${d.awards.crossInsert}/${d.awards.crossDelete})`);
    want(d.awards.update === 0, `huy chương SỬA được sau khi đã cấp (${d.awards.update} dòng)`);

    /* H. weekly_challenges — writable, and worth nothing by itself */
    want(
      d.challenge.forged === 'ok' && d.challenge.balAfter === d.challenge.balBefore,
      `tự tạo một thử thách ĐÃ HOÀN THÀNH làm đổi số dư (${d.challenge.balBefore}→${d.challenge.balAfter}) — ` +
        'một dòng thử thách không phải là tiền; chỉ claim_quest_reward mới ghi sổ, và nó tự định giá theo hạng trong ref_key',
    );
    want(d.challenge.cross === 'refused', `A tạo được thử thách cho B (${d.challenge.cross})`);

    /* I. XP is derived, never stored */
    want(d.xpColumns === 0, `có ${d.xpColumns} cột XP trong schema — XP phải được SUY RA từ sổ cái, không lưu ở đâu cả`);
    if (xpForRefKey) {
      const forged = ['made_up', '', 'd:2026-08-20:ghost', 'buy:head_cap', 'seed:x', 'ch:diamond:2026-08-17:x'];
      const bad = forged.filter((k) => xpForRefKey(k) !== 0);
      want(bad.length === 0, `xpForRefKey cấp XP cho khoá không nhận ra được: ${JSON.stringify(bad)}`);
      const known = [['d:2026-08-20:meal', 10], ['d:2026-08-20:streak', 15], ['w:1', 40], ['ch:gold:2026-08-17:x', 80]];
      const wrong = known.filter(([k, v]) => xpForRefKey(k) !== v).map(([k, v]) => `${k}: ${xpForRefKey(k)} ≠ ${v}`);
      want(wrong.length === 0, `xpForRefKey lệch với bảng thưởng: ${JSON.stringify(wrong)}`);
    }

    /* K. cross-account and anonymity, across every writer at once */
    want(d.cross.length === 0, `A với tới được trạng thái kinh tế của B: ${JSON.stringify(d.cross)}`);
    want(d.anon.length === 0, `một phiên KHÔNG có JWT vẫn thực hiện được: ${JSON.stringify(d.anon)}`);

    /* L. account deletion */
    want(d.deleted.before > 0, 'bộ dò không dựng được lịch sử kinh tế để xoá — luật xoá tài khoản rỗng');
    want(d.deleted.after === 0, `xoá tài khoản để lại ${d.deleted.after} dòng kinh tế — ON DELETE CASCADE phải dọn hết`);
    want(d.deleted.recreated === 0, `tạo lại cùng một id thừa kế ${d.deleted.recreated} dòng kinh tế của tài khoản cũ`);

    /* M. retry, and the one documented residue */
    want(d.retry.claim === 'HỘI TỤ', `nhận thưởng hai lần không hội tụ (${d.retry.claim})`);
    want(d.retry.buyItem === 'HỘI TỤ', `mua món hai lần không hội tụ (${d.retry.buyItem})`);
    want(d.retry.freezeNew === 'HỘI TỤ', `mua freeze với cùng request id không hội tụ (${d.retry.freezeNew}) — Chain Z`);
    want(
      d.retry.freezeOld === 'ĐỔI',
      `chữ ký buy_streak_freeze() KHÔNG tham số nay lại hội tụ (${d.retry.freezeOld}) — ` +
        'nó KHÔNG idempotent được, vì client cũ không gửi gì nhận diện được một ý định. Nếu điều này đổi thì ' +
        'hoặc chữ ký cũ đã bị bỏ (làm hỏng bản app đã cài), hoặc một id đã được bịa ra ở phía máy chủ — cả hai ' +
        'đều cần được nói ra chứ không phải lặng lẽ xanh',
    );

    /* N. the ceiling, which is the documented bound on a forged call */
    want(
      d.ceiling.minted <= d.ceiling.cap && d.ceiling.minted > 0,
      `trần thưởng ngày không còn chặn: đúc được ${d.ceiling.minted} xu, trần là ${d.ceiling.cap}`,
    );
    want(d.ceiling.negative === 0, `${d.ceiling.negative} lần để lại số dư ÂM`);

    /* O. the oracle */
    want(d.oracle.mismatch === 0, `${d.oracle.mismatch}/${d.oracle.runs} chuỗi lệch với oracle ĐỘC LẬP: ${JSON.stringify(d.oracle.sample)}`);
    want(d.oracle.negative === 0 && d.oracle.overCap === 0, `oracle thấy ${d.oracle.negative} số dư âm và ${d.oracle.overCap} lần vượt trần`);
  }
} catch (e) {
  problems.push(`không dựng được phép thử toàn vẹn kinh tế: ${e.message}`);
} finally {
  stopCluster();
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('toàn vẹn kinh tế còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  'toàn vẹn kinh tế OK — ' + (PGBIN ? 'PostgreSQL THẬT dựng từ mọi migration' : 'KHÔNG có PostgreSQL (phần CSDL bị bỏ qua)') +
    ', và một oracle chỉ suy từ DÒNG DỮ LIỆU cộng hằng số máy chủ, không import hàm kinh tế nào. Mọi bảng giữ ' +
    'giá trị — mascot_transactions, streak_freezes, entitlements, shop_prices, reward_prices — CHỈ ĐỌC với client: ' +
    'INSERT bị RLS chặn, UPDATE/DELETE trả 0 dòng, và mọi lần ghi đi qua hàm SECURITY DEFINER. mascot_inventory ' +
    'mở đúng một cột, và trigger mascot_inventory_no_swap chặn đổi item_key hay user_id — không có nó thì món 80 xu ' +
    'thành món 800 xu bằng một câu UPDATE. entitlements do webhook ghi, current_tier() suy ra tier còn hiệu lực và ' +
    'hết hạn là free. awards và weekly_challenges NHẬN ghi từ client và đó là quyết định sản phẩm: đã đo, một huy ' +
    'chương bịa ra không đổi xu, không đổi XP, không đổi quyền sở hữu, và luật G ghim danh sách nơi đọc awards lại ' +
    'để ngày có thứ gì đó bắt đầu quy nó thành giá trị thì có người phải nói ra. XP suy từ sổ cái chứ không lưu. ' +
    'Xoá tài khoản dọn sạch lịch sử qua CASCADE và tạo lại cùng id không thừa kế gì. ĐIỀU CỐ Ý KHÔNG KIỂM: ' +
    'claim_quest_reward không xác minh phần thưởng đã KIẾM ĐƯỢC — quest hằng ngày không có bảng hoàn thành nào ' +
    'để xác minh (Chain Y), và 20260815130000 đã viết rõ việc chặn nằm ở trần: "the RPC\'s job is to bound what a ' +
    'forged call can mint". Đó là ngữ nghĩa kinh tế, không phải lỗi.',
);
for (const n of notes) console.log(`  · ${n}`);

/* ────────────────────────────────────────────────────────────────────────── */
function writeDriver(out, PORT, NATIVE) {
  const p = path.join(out, 'drive.cjs');
  writeFileSync(p, String.raw`
const pg = require(${JSON.stringify(path.join(NATIVE, 'node_modules/pg/lib/index.js'))});
const CFG = { host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'econ' };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const TODAY = new Date().toISOString().slice(0, 10);

(async () => {
  const conn = async () => { const x = new pg.Client(CFG); await x.connect(); return x; };
  const admin = await conn();
  await admin.query("INSERT INTO auth.users (id,email) VALUES ($1,'a@x'),($2,'b@x') ON CONFLICT DO NOTHING", [A, B]);
  const c = await conn();
  /* Every act inside ONE explicit transaction with SET LOCAL — outside one it
     is a no-op and every RLS conclusion would be worthless. */
  const as = async (uid, sql, params) => {
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE authenticated');
      if (uid) await c.query("SET LOCAL request.jwt.claim.sub = '" + uid + "'");
      const r = await c.query(sql, params || []);
      await c.query('COMMIT');
      return { ok: true, rows: r.rowCount, v: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, e: e.message.split('\n')[0] }; }
  };
  /* ROW_COUNT, not the exit status: RLS filters an UPDATE to zero rows and
     reports success, so "no error" says nothing. */
  const rows = async (uid, sql) => { const r = await as(uid, sql); return r.ok ? r.rows : -1; };
  const refused = async (uid, sql) => ((await as(uid, sql)).ok ? 'allowed' : 'refused');
  const wipe = async () => { for (const t of ['mascot_transactions','mascot_inventory','awards','weekly_challenges','streak_freezes','entitlements'])
    await admin.query('DELETE FROM public.' + t); };
  const give = async (u, n) => admin.query("INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ($1,$2,'seed','seed:'||gen_random_uuid())", [u, n]);
  const bal = async (u) => (await admin.query('SELECT COALESCE(SUM(amount),0)::int b FROM public.mascot_transactions WHERE user_id=$1', [u])).rows[0].b;
  const invN = async (u) => (await admin.query('SELECT count(*)::int n FROM public.mascot_inventory WHERE user_id=$1', [u])).rows[0].n;
  const snap = async (u) => JSON.stringify((await admin.query(
    'SELECT (SELECT COALESCE(SUM(amount),0)::int FROM public.mascot_transactions WHERE user_id=$1) a,' +
    '(SELECT count(*)::int FROM public.mascot_inventory WHERE user_id=$1) b,' +
    '(SELECT count(*)::int FROM public.streak_freezes WHERE user_id=$1) d', [u])).rows[0]);
  const o = {};

  await wipe();
  o.baseline = String((await as(A, "SELECT public.claim_quest_reward('d:'||CURRENT_DATE||':meal','x')")).v);

  /* A. the ledger */
  await wipe(); await give(A, 500);
  o.tx = {
    insert: await refused(A, "INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ('" + A + "',9999,'x','forge')"),
    update: await rows(A, "UPDATE public.mascot_transactions SET amount=9999 WHERE user_id='" + A + "'"),
    delete: await rows(A, "DELETE FROM public.mascot_transactions WHERE user_id='" + A + "'"),
  };

  /* B. freezes */
  await wipe(); await give(A, 500);
  await as(A, "SELECT public.buy_streak_freeze(gen_random_uuid())");
  o.freeze = {
    insert: await refused(A, "INSERT INTO public.streak_freezes (user_id) VALUES ('" + A + "')"),
    update: await rows(A, "UPDATE public.streak_freezes SET used_on=NULL WHERE user_id='" + A + "'"),
    delete: await rows(A, "DELETE FROM public.streak_freezes WHERE user_id='" + A + "'"),
  };

  /* C. entitlements */
  await wipe();
  o.ent = {
    insert: await refused(A, "INSERT INTO public.entitlements (user_id,tier,expires_at) VALUES ('" + A + "','max',now()+interval '1 year')"),
    update: 0, activeTier: '', expiredTier: '', afterDelete: 0,
  };
  await admin.query("INSERT INTO public.entitlements (user_id,tier,expires_at) VALUES ($1,'max',now()+interval '1 year') ON CONFLICT (user_id) DO UPDATE SET tier='max', expires_at=now()+interval '1 year'", [A]);
  o.ent.update = await rows(A, "UPDATE public.entitlements SET tier='max', expires_at=now()+interval '10 years' WHERE user_id='" + A + "'");
  o.ent.activeTier = String((await as(A, 'SELECT public.current_tier()')).v);
  await admin.query("UPDATE public.entitlements SET expires_at = now() - interval '1 day' WHERE user_id=$1", [A]);
  o.ent.expiredTier = String((await as(A, 'SELECT public.current_tier()')).v);
  await admin.query('DELETE FROM auth.users WHERE id=$1', [A]);
  await admin.query("INSERT INTO auth.users (id,email) VALUES ($1,'a@x')", [A]);
  o.ent.afterDelete = (await admin.query('SELECT count(*)::int n FROM public.entitlements WHERE user_id=$1', [A])).rows[0].n;

  /* D/E. price lists */
  o.prices = {
    shop: await rows(A, "UPDATE public.shop_prices SET price=0"),
    shopAfter: String((await admin.query("SELECT price FROM public.shop_prices WHERE item_key='head_band'")).rows[0].price),
    reward: await rows(A, "UPDATE public.reward_prices SET coins=300"),
    rewardAfter: String((await admin.query("SELECT coins FROM public.reward_prices WHERE reward_key='quest:meal'")).rows[0].coins),
  };

  /* F. inventory */
  await wipe(); await give(A, 500);
  await as(A, "SELECT public.buy_mascot_item('head_band')");
  o.inv = {
    owned: String((await admin.query('SELECT string_agg(item_key,\',\') s FROM public.mascot_inventory WHERE user_id=$1', [A])).rows[0].s),
    swap: await refused(A, "UPDATE public.mascot_inventory SET item_key='back_dragonwing' WHERE user_id='" + A + "'"),
    owner: await refused(A, "UPDATE public.mascot_inventory SET user_id='" + B + "' WHERE user_id='" + A + "'"),
    insert: await refused(A, "INSERT INTO public.mascot_inventory (user_id,item_key) VALUES ('" + A + "','stage_champion')"),
    delete: await rows(A, "DELETE FROM public.mascot_inventory WHERE user_id='" + A + "'"),
    stillOwns: '',
  };
  o.inv.stillOwns = String((await admin.query('SELECT string_agg(item_key,\',\') s FROM public.mascot_inventory WHERE user_id=$1', [A])).rows[0].s);
  /* Equipping must still work — the policy exists for it, and a rule that
     forbade every UPDATE would be locking the wrong thing. */
  o.inv.equip = await rows(A, "UPDATE public.mascot_inventory SET equipped=true WHERE user_id='" + A + "'");

  /* G. awards */
  await wipe(); await give(A, 500);
  await as(A, "SELECT public.buy_mascot_item('head_band')");
  const balBefore = await bal(A), invBefore = await invN(A);
  const forgedAward = await as(A, "INSERT INTO public.awards (user_id,award_key,award_type,title,tier) VALUES ('" + A + "','made_up_key','streak','Bịa','platinum')");
  await as(A, "INSERT INTO public.awards (user_id,award_key,award_type,title,tier) VALUES ('" + A + "','streak_100','streak','100','gold')");
  o.awards = {
    forged: forgedAward.ok ? 'ok' : 'refused',
    balBefore, invBefore, balAfter: await bal(A), invAfter: await invN(A),
    crossInsert: await refused(A, "INSERT INTO public.awards (user_id,award_key,award_type,title) VALUES ('" + B + "','x','y','z')"),
    crossDelete: await rows(A, "DELETE FROM public.awards WHERE user_id='" + B + "'"),
    update: await rows(A, "UPDATE public.awards SET tier='platinum' WHERE user_id='" + A + "'"),
  };

  /* H. weekly challenges */
  await wipe(); await give(A, 500);
  const cBefore = await bal(A);
  const forgedCh = await as(A, "INSERT INTO public.weekly_challenges (user_id,week_start,challenge_key,title,target_value,current_value,completed,reward_tier) VALUES ('" + A + "','2026-08-17','forged','x',1,1,true,'platinum')");
  o.challenge = {
    forged: forgedCh.ok ? 'ok' : 'refused',
    balBefore: cBefore, balAfter: await bal(A),
    cross: await refused(A, "INSERT INTO public.weekly_challenges (user_id,week_start,challenge_key,title,target_value) VALUES ('" + B + "','2026-08-17','x','x',1)"),
  };

  /* I. no XP is stored anywhere */
  o.xpColumns = (await admin.query(
    "SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND column_name ~ '^(xp|experience)'")).rows[0].n;

  /* K. cross-account and anonymity */
  await wipe(); await give(A, 500); await give(B, 500);
  await as(B, "SELECT public.buy_mascot_item('head_band')");
  await as(B, "SELECT public.buy_streak_freeze(gen_random_uuid())");
  const bSnap = await snap(B);
  o.cross = [];
  for (const [label, sql] of [
    ['tx insert', "INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ('" + B + "',9999,'x','f')"],
    ['tx update', "UPDATE public.mascot_transactions SET amount=0 WHERE user_id='" + B + "'"],
    ['tx delete', "DELETE FROM public.mascot_transactions WHERE user_id='" + B + "'"],
    ['inv update', "UPDATE public.mascot_inventory SET equipped=true WHERE user_id='" + B + "'"],
    ['inv delete', "DELETE FROM public.mascot_inventory WHERE user_id='" + B + "'"],
    ['freeze update', "UPDATE public.streak_freezes SET used_on=CURRENT_DATE WHERE user_id='" + B + "'"],
    ['freeze delete', "DELETE FROM public.streak_freezes WHERE user_id='" + B + "'"],
    ['ent insert', "INSERT INTO public.entitlements (user_id,tier) VALUES ('" + B + "','max')"],
  ]) { await as(A, sql); }
  if (await snap(B) !== bSnap) o.cross.push('B state changed: ' + bSnap + ' → ' + await snap(B));
  const bReadable = await as(A, "SELECT count(*)::int FROM public.mascot_transactions WHERE user_id='" + B + "'");
  if (Number(bReadable.v) !== 0) o.cross.push('A đọc được ' + bReadable.v + ' dòng sổ của B');

  o.anon = [];
  for (const [label, sql] of [
    ['claim_quest_reward', "SELECT public.claim_quest_reward('d:'||CURRENT_DATE||':meal','x')"],
    ['buy_mascot_item', "SELECT public.buy_mascot_item('head_band')"],
    ['buy_streak_freeze', "SELECT public.buy_streak_freeze(gen_random_uuid())"],
    ['use_streak_freeze', "SELECT public.use_streak_freeze(CURRENT_DATE-1)"],
    ['awards insert', "INSERT INTO public.awards (user_id,award_key,award_type,title) VALUES ('" + A + "','x','y','z')"],
  ]) { if ((await as(null, sql)).ok) o.anon.push(label); }

  /* L. account deletion */
  await wipe(); await give(A, 500);
  await as(A, "SELECT public.buy_mascot_item('head_band')");
  await as(A, "SELECT public.buy_streak_freeze(gen_random_uuid())");
  await as(A, "INSERT INTO public.awards (user_id,award_key,award_type,title) VALUES ('" + A + "','streak_7','streak','x')");
  const before = (await admin.query(
    "SELECT (SELECT count(*)::int FROM public.mascot_transactions WHERE user_id=$1) + (SELECT count(*)::int FROM public.mascot_inventory WHERE user_id=$1) + (SELECT count(*)::int FROM public.streak_freezes WHERE user_id=$1) + (SELECT count(*)::int FROM public.awards WHERE user_id=$1) n", [A])).rows[0].n;
  await admin.query('DELETE FROM auth.users WHERE id=$1', [A]);
  const after = (await admin.query(
    "SELECT (SELECT count(*)::int FROM public.mascot_transactions WHERE user_id=$1) + (SELECT count(*)::int FROM public.mascot_inventory WHERE user_id=$1) + (SELECT count(*)::int FROM public.streak_freezes WHERE user_id=$1) + (SELECT count(*)::int FROM public.awards WHERE user_id=$1) n", [A])).rows[0].n;
  await admin.query("INSERT INTO auth.users (id,email) VALUES ($1,'a@x')", [A]);
  const recreated = (await admin.query(
    "SELECT (SELECT count(*)::int FROM public.mascot_transactions WHERE user_id=$1) + (SELECT count(*)::int FROM public.mascot_inventory WHERE user_id=$1) n", [A])).rows[0].n;
  o.deleted = { before, after, recreated };

  /* M. retry */
  const retryOf = async (sql, seed) => {
    await wipe(); if (seed) await give(A, seed);
    await as(A, sql); const s1 = await snap(A);
    await as(A, sql); const s2 = await snap(A);
    return s1 === s2 ? 'HỘI TỤ' : 'ĐỔI';
  };
  o.retry = {
    claim: await retryOf("SELECT public.claim_quest_reward('d:'||CURRENT_DATE||':meal','x')", 0),
    buyItem: await retryOf("SELECT public.buy_mascot_item('head_band')", 500),
    freezeNew: await retryOf("SELECT public.buy_streak_freeze('aaaaaaaa-0000-0000-0000-000000000001')", 500),
    freezeOld: await retryOf("SELECT public.buy_streak_freeze()", 500),
  };

  /* N. the ceiling */
  await wipe();
  let minted = 0, negative = 0;
  for (let i = 0; i < 30; i++) {
    const r = await as(A, "SELECT public.claim_quest_reward($1,'x')", ['ch:platinum:2026-08-17:k' + i]);
    if (r.ok) minted += 120;
  }
  if (await bal(A) < 0) negative++;
  o.ceiling = { minted: await bal(A), cap: 800, negative };

  /* O. the oracle — rows and server constants only */
  const PRICES = Object.fromEntries((await admin.query('SELECT reward_key, coins FROM public.reward_prices')).rows.map((r) => [r.reward_key, r.coins]));
  const SHOP = Object.fromEntries((await admin.query('SELECT item_key, price FROM public.shop_prices')).rows.map((r) => [r.item_key, r.price]));
  const MAX_DAY = 800;
  const priceOf = (ref) => {
    if (ref === 'welcome') return PRICES.welcome;
    const p = ref.split(':');
    if (p[0] === 'd' && p.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(p[1])) {
      const off = Math.round((Date.parse(p[1] + 'T00:00:00Z') - Date.parse(TODAY + 'T00:00:00Z')) / 86400000);
      if (off > 1 || off < -2) return null;
      return p[2] === 'streak' ? PRICES['streak:max'] : (PRICES['quest:' + p[2]] ?? null);
    }
    if (p[0] === 'ch' && p.length === 4) return PRICES['challenge:' + p[1]] ?? null;
    if (p[0] === 'w' && ref.length > 2) return PRICES.weekly;
    if (p[0] === 'set') return PRICES[ref] ?? null;
    return null;
  };
  let seed = 20260821;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const day = (n) => new Date(Date.parse(TODAY + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const QUESTS = ['meal','workout','water','sleep','steps'];
  let mismatch = 0, sample = null, oNeg = 0, oOver = 0;
  const RUNS = 500;
  for (let mode = 0; mode < 2; mode++) {
    for (let t = 0; t < RUNS; t++) {
      await wipe(); await give(A, 200);
      let oBal = 200; const oPaid = new Set(); const oInv = new Set(); let oToday = 0;
      for (let i = 0, n = 2 + Math.floor(rnd() * 6); i < n; i++) {
        const roll = rnd();
        const ref = mode === 0
          ? (roll < 0.6 ? 'd:' + day(0) + ':' + QUESTS[Math.floor(rnd() * 5)]
            : roll < 0.8 ? 'ch:' + ['bronze','silver','gold','platinum'][Math.floor(rnd() * 4)] + ':2026-08-17:k' + Math.floor(rnd() * 3)
            : 'set:' + ['gym','runner','tet'][Math.floor(rnd() * 3)])
          : (roll < 0.2 ? 'd:' + day(0) + ':ghost' : roll < 0.4 ? 'd:' + day(-9) + ':meal'
            : roll < 0.55 ? 'ch:diamond:2026-08-17:x' : roll < 0.7 ? ''
            : roll < 0.85 ? 'd:not-a-date:meal' : 'd:' + day(0) + ':' + QUESTS[Math.floor(rnd() * 5)]);
        await as(A, "SELECT public.claim_quest_reward($1,'x')", [ref]);
        const pr = priceOf(ref);
        if (pr !== null && !oPaid.has(ref) && oToday + pr <= MAX_DAY) { oPaid.add(ref); oBal += pr; oToday += pr; }
      }
      if (rnd() < 0.4) {
        const item = ['head_band','head_cap'][Math.floor(rnd() * 2)];
        const r = await as(A, 'SELECT public.buy_mascot_item($1)', [item]);
        if (r.ok) { oInv.add(item); oBal -= SHOP[item]; }
      }
      const realBal = await bal(A), realInv = await invN(A);
      if (realBal < 0) oNeg++;
      const credited = (await admin.query("SELECT COALESCE(SUM(amount),0)::int b FROM public.mascot_transactions WHERE user_id=$1 AND amount>0 AND ref_key NOT LIKE 'seed:%'", [A])).rows[0].b;
      if (credited > MAX_DAY) oOver++;
      if (realBal !== oBal || realInv !== oInv.size) {
        mismatch++;
        if (!sample) sample = { mode, realBal, realInv, oracleBal: oBal, oracleInv: oInv.size };
      }
    }
  }
  o.oracle = { runs: RUNS * 2, mismatch, sample, negative: oNeg, overCap: oOver };

  await c.end(); await admin.end();
  console.log('RESULT ' + JSON.stringify(o));
})().catch((e) => console.log('RESULT ' + JSON.stringify({ harnessError: String(e && e.stack || e) })));
`);
  return p;
}
