/**
 * A photograph is untrusted input, and the plate in it belongs to somebody.
 *
 * ── what this chain found the shape of, before it found anything wrong ──
 *
 * `scan-food` is a **pure function of the image**. It reads three fields —
 * `image_base64`, `lang`, `mode` — and nothing else; it never touches the
 * database except to claim a quota unit; it is handed no meal id, no entry id
 * and no user id; and it writes nothing. Half the attack surface an image
 * endpoint usually has therefore cannot exist here, and that is worth stating
 * as measured fact rather than as an absence somebody has to re-derive:
 *
 *   · **No SSRF.** There is no URL field. Every URL-shaped input — `http://`,
 *     `file://`, `javascript:`, `gopher://`, a storage path — is treated as an
 *     opaque string and pasted into a `data:` URL. Driven through the real
 *     handler with a fetch recorder, the only host ever contacted across the
 *     whole input matrix is the gateway. The provider receives the bytes
 *     inline, so it does not fetch anything either. **APP FETCHES: no.
 *     PROVIDER FETCHES: no.**
 *   · **No client MIME.** The type is hard-coded `image/jpeg` in the data URL,
 *     so a client-supplied content type is not trusted because there is nowhere
 *     to supply one.
 *   · **No server-side decode.** The base64 string is passed straight through,
 *     so a decompression bomb has no decoder here to exhaust. That risk, if it
 *     exists, belongs to the provider.
 *   · **No meal target.** `mealId`, `entry_id` and `userId` in the body are
 *     ignored entirely, so a cross-user meal write is not something the
 *     function can be talked into.
 *   · **Size is bounded before the money.** `MAX_IMAGE_CHARS` is checked
 *     *before* `claimCall`: 4,000,000 chars passes, 4,000,001 returns 413 with
 *     zero provider calls and zero quota spent.
 *
 * Attribution lives in the client, and that is where the bugs were.
 *
 * ── the two that were real ──
 *
 * **The hand-off slot outlived the session.** `lib/scan-bridge.ts` holds one
 * module-scope slot of scanned food. Six other module stores register a reset
 * with `user-scoped-reset`; this one did not, because it has no key on disk to
 * have been noticed by. Run against the real modules, with the same
 * `runUserScopedResets()` the `SIGNED_OUT` handler calls:
 *
 *     A scans a plate, signs out, B opens a meal sheet
 *     → B receives ["ALPHA_MEAL_123 111kcal"]
 *
 * and the sheet appends it to B's meal. `SCAN_TTL_MS` bounds it to five
 * minutes, which is the whole difference between this and the Chain E bugs.
 *
 * **One unusable model reply escaped as a 500.** Every other shape lands on
 * `{items: []}` — no tool call, empty `choices`, numbers that are not
 * measurements. Malformed tool *arguments* threw out of `JSON.parse` and the
 * outer catch handed the caller the parser's own sentence, after the quota had
 * been spent.
 *
 * ── what these rules cannot tell you ──
 *
 * `HANDLER-AND-PAYLOAD-PROVEN`, `REAL-PROVIDER-UNVERIFIED`,
 * `DEVICE-UNVERIFIED`. The handler, the bridge, the clamp and the payload are
 * real. Supabase, Deno, the camera and the gateway are stand-ins; no image has
 * been taken on a phone and no model has run.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'scanfood-'));
try {
  const fnDir = path.join(out, 'fn');
  mkdirSync(fnDir, { recursive: true });
  copyFileSync(path.join(REPO, 'supabase/functions/scan-food/index.ts'), path.join(fnDir, 'scan-food.ts'));
  copyFileSync(path.join(REPO, 'supabase/functions/_shared/guard.ts'), path.join(fnDir, 'guard.ts'));
  for (const f of ['scan-food.ts', 'guard.ts']) {
    const p = path.join(fnDir, f);
    writeFileSync(
      p,
      readFileSync(p, 'utf8')
        .replace('https://deno.land/std@0.168.0/http/server.ts', './shim-serve.js')
        .replace('https://esm.sh/@supabase/supabase-js@2', './shim-sb.js')
        .replaceAll('"../_shared/guard.ts"', '"./guard.ts"'),
    );
  }
  writeFileSync(
    path.join(fnDir, 'shim-serve.js'),
    `let h = null; module.exports = { serve: (x) => { h = x; }, __handler: () => h, __reset: () => { h = null; } };\n`,
  );
  writeFileSync(
    path.join(fnDir, 'shim-sb.js'),
    `const db = { calls: [] }; const T = {};
     module.exports = {
       createClient: (u, k, o) => ({
         from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
         rpc: async (n) => { db.calls.push({ rpc: n }); return { data: true, error: null }; },
         auth: { async getClaims(t) { const c = T[t]; return c ? { data: { claims: c }, error: null } : { data: null, error: { message: 'bad' } }; } },
       }),
       __db: db, __addToken: (t, c) => { T[t] = c; }, __reset: () => { db.calls = []; },
     };\n`,
  );

  /* The bridge and the reset registry, exactly as the app has them. */
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/scan-bridge.ts', 'src/lib/user-scoped-reset.ts',
        '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--ignoreConfig'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch { /* `@/` is unmapped without the project tsconfig — emitted anyway. */ }
  const bridgePath = path.join(out, 'scan-bridge.js');
  writeFileSync(
    bridgePath,
    readFileSync(bridgePath, 'utf8').replace('require("@/lib/user-scoped-reset")', 'require("./user-scoped-reset.js")'),
  );

  try {
    execFileSync(
      'npx',
      ['tsc', path.join(fnDir, 'scan-food.ts'), path.join(fnDir, 'guard.ts'),
        '--outDir', fnDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--ignoreConfig'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch { /* Deno globals have no types here — emitted anyway. */ }
  for (const f of readdirSync(fnDir).filter((f) => f.endsWith('.js') && !f.startsWith('shim-'))) {
    const p = path.join(fnDir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace('require("./guard.ts")', 'require("./guard.js")'));
  }

  writeFileSync(
    path.join(out, 'run.cjs'),
    `const path = require('path');
     const FN = path.join(__dirname, 'fn');
     const sb = require(path.join(FN, 'shim-sb.js'));
     const ss = require(path.join(FN, 'shim-serve.js'));
     const bridge = require('./scan-bridge.js');
     const resets = require('./user-scoped-reset.js');
     sb.__addToken('tokB', { sub: 'bbbbbbbb-2222-2222-2222-222222222222', role: 'authenticated' });
     sb.__addToken('anonTok', { role: 'anon' });

     let sent = [], hosts = [], reply = null, httpFail = null;
     global.fetch = async (url, init) => {
       hosts.push(String(url).split('/').slice(0, 3).join('/'));
       sent.push({ len: init?.body ? String(init.body).length : 0, body: init?.body ? JSON.parse(init.body) : null });
       if (httpFail) return { ok: false, status: httpFail, json: async () => ({}), text: async () => '{}' };
       return { ok: true, status: 200, json: async () => reply, text: async () => 'ok' };
     };
     global.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'ANON', LOVABLE_API_KEY: 'GATEWAY_KEY' }[k]) } };
     const tool = (args) => ({ choices: [{ message: { tool_calls: [{ function: { arguments: args } }] } }] });
     const okItem = { food_name: 'x', kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 1, serving_g: 100 };

     async function call(body, token = 'tokB') {
       ss.__reset();
       delete require.cache[require.resolve(path.join(FN, 'scan-food.js'))];
       require(path.join(FN, 'scan-food.js'));
       sent = []; hosts = []; sb.__reset();
       const h = new Map();
       if (token) h.set('authorization', 'Bearer ' + token);
       const res = await ss.__handler()({ method: 'POST', headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, json: async () => body });
       return { status: res.status, body: await res.text(), sent, hosts, quota: sb.__db.calls.filter((c) => c.rpc).length };
     }

     (async () => {
       const o = {};
       reply = tool(JSON.stringify({ items: [okItem] }));

       /* ── A. no host but the gateway, whatever the input looks like ── */
       const URLISH = ['http://127.0.0.1:9/x', 'https://169.254.169.254/latest/meta-data/',
         'file:///etc/passwd', 'javascript:alert(1)', 'gopher://127.0.0.1:70/x',
         'http://user:pass@127.0.0.1/x', 'http://[::1]/x', 'http://0.0.0.0/x',
         'http://192.168.0.1/x', 'data:image/png;base64,iVBORw0KGgo=', 'user-a/photo.jpg'];
       o.hosts = [];
       for (const s of URLISH) {
         const r = await call({ image_base64: s });
         o.hosts.push(...r.hosts);
       }
       /* and a URL offered under every other field name the client might use */
       o.urlFieldStatuses = [];
       for (const f of ['image_url', 'url', 'imageUrl', 'image', 'photo_url']) {
         const r = await call({ [f]: 'http://127.0.0.1:9/x' });
         o.urlFieldStatuses.push(r.status);
         o.hosts.push(...r.hosts);
       }
       o.hosts = [...new Set(o.hosts)];

       /* APP FETCHES vs PROVIDER FETCHES — two different questions, and the
          host recorder above only answers the first. If a client URL were ever
          forwarded as the provider's image_url field instead of being inlined, this
          app would fetch nothing and the *provider* would fetch an arbitrary
          address on the caller's behalf. So the shape of what is handed over is
          asserted too: always a data: URL, never something to go and get. */
       o.providerImageUrls = [];
       for (const s of URLISH) {
         const r = await call({ image_base64: s });
         for (const p of r.sent) {
           for (const m of (p.body?.messages ?? [])) {
             for (const c of (Array.isArray(m.content) ? m.content : [])) {
               if (c?.image_url?.url) o.providerImageUrls.push(String(c.image_url.url).slice(0, 12));
             }
           }
         }
       }
       o.providerImageUrls = [...new Set(o.providerImageUrls)];

       /* ── B. size bounded before the money ── */
       o.size = {};
       for (const n of [1000, 4000000, 4000001, 40000000]) {
         const r = await call({ image_base64: 'A'.repeat(n) });
         o.size[n] = { status: r.status, providerCalls: r.sent.length, quota: r.quota, payload: r.sent[0]?.len ?? 0 };
       }

       /* ── C. identity is never taken from the body or the model ── */
       const withIds = await call({ image_base64: 'QUJD', mealId: 'ALPHA_MEAL_123', entry_id: 'ALPHA_MEAL_123', userId: 'aaaa' });
       o.bodyIdsIgnored = !/ALPHA_MEAL_123|aaaa/.test(JSON.stringify(withIds.sent));
       reply = tool(JSON.stringify({ items: [{ ...okItem, user_id: 'ALPHA', meal_id: 'ALPHA_MEAL_123', entry_id: 'ALPHA_MEAL_123', reward: 9999 }] }));
       const idOut = await call({ image_base64: 'QUJD' });
       o.modelIdFields = idOut.body;
       reply = tool(JSON.stringify({ items: [okItem] }));

       /* ── D. every unusable model reply ends the same way ── */
       o.replies = {};
       for (const [label, r] of [
         ['negativeKcal', tool(JSON.stringify({ items: [{ ...okItem, kcal: -500 }] }))],
         ['infiniteKcal', tool('{"items":[{"food_name":"x","kcal":1e999,"protein_g":1,"carbs_g":1,"fat_g":1,"fiber_g":1,"serving_g":100}]}')],
         ['hugeKcal', tool(JSON.stringify({ items: [{ ...okItem, kcal: 99999999 }] }))],
         ['nullKcal', tool(JSON.stringify({ items: [{ ...okItem, kcal: null }] }))],
         ['itemsIsArray', tool(JSON.stringify([okItem]))],
         ['noToolCall', { choices: [{ message: { content: 'sorry' } }] }],
         ['emptyChoices', { choices: [] }],
         ['argsNotJson', tool('{oops')],
         ['argsEmpty', tool('')],
       ]) {
         reply = r;
         const x = await call({ image_base64: 'QUJD' });
         o.replies[label] = { status: x.status, body: x.body.slice(0, 60) };
       }
       reply = tool(JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ ...okItem, food_name: 'f' + i })) }));
       const many = await call({ image_base64: 'QUJD' });
       o.manyItems = JSON.parse(many.body).items.length;
       reply = tool(JSON.stringify({ items: [okItem] }));

       /* ── E. identity at the door ── */
       o.auth = {};
       for (const [label, tok] of [['none', null], ['bad', 'garbage'], ['anon', 'anonTok'], ['user', 'tokB']]) {
         const r = await call({ image_base64: 'QUJD' }, tok);
         o.auth[label] = { status: r.status, providerCalls: r.sent.length };
       }

       /* ── F. gateway failure ── */
       o.gateway = {};
       for (const s of [429, 500, 402]) {
         httpFail = s;
         const r = await call({ image_base64: 'QUJD' });
         o.gateway[s] = r.status;
       }
       httpFail = null;

       /* ── G. the hand-off slot: whose plate is it ── */
       const A_FOOD = { food_name: 'ALPHA_MEAL_123', kcal: 111, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 1, serving_g: 100 };
       const B_FOOD = { food_name: 'BRAVO_MEAL_456', kcal: 222, protein_g: 2, carbs_g: 2, fat_g: 2, fiber_g: 2, serving_g: 200 };
       bridge.setPendingScan(A_FOOD);
       resets.runUserScopedResets();                      // what SIGNED_OUT runs
       const afterLogout = bridge.consumePendingScan();
       o.survivesLogout = afterLogout ? afterLogout.map((x) => x.food_name) : null;

       const t0 = 1000000;
       bridge.setPendingScan(A_FOOD, t0);
       o.ttlFresh = (bridge.consumePendingScan(t0 + 60000) || []).length;
       bridge.setPendingScan(A_FOOD, t0);
       o.ttlStale = bridge.consumePendingScan(t0 + 6 * 60000);
       bridge.setPendingScan(A_FOOD);
       o.firstRead = (bridge.consumePendingScan() || []).length;
       o.secondRead = bridge.consumePendingScan();
       bridge.setPendingScan(A_FOOD);
       bridge.setPendingScan(B_FOOD);
       o.overwrite = (bridge.consumePendingScan() || []).map((x) => x.food_name);

       console.log(JSON.stringify(o));
     })();\n`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'run.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A ── */
  want(
    r.hosts.length === 1 && r.hosts[0] === 'https://ai.gateway.lovable.dev',
    `một đầu vào hình dạng URL làm máy chủ gọi ra ngoài: ${JSON.stringify(r.hosts)}. ` +
      'scan-food KHÔNG có trường URL — mọi chuỗi được dán nguyên vào một data: URL và không bao giờ được ' +
      'tải về. Nếu luật này đỏ nghĩa là ai đó đã thêm một đường tải ảnh từ URL do client cung cấp, và ' +
      'đó là SSRF',
  );
  want(
    r.providerImageUrls.length > 0 && r.providerImageUrls.every((u) => u.startsWith('data:image/')),
    `ảnh được trao cho nhà cung cấp dưới dạng ${JSON.stringify(r.providerImageUrls)} thay vì một data: URL. ` +
      'Nếu một URL của client được chuyển tiếp thành image_url, ứng dụng này không tải gì cả — nhưng NHÀ ' +
      'CUNG CẤP sẽ tải một địa chỉ tuỳ ý thay mặt người gọi. Đó là hai câu hỏi khác nhau và luật host ở ' +
      'trên chỉ trả lời câu thứ nhất',
  );
  want(
    r.urlFieldStatuses.every((s) => s === 400),
    `một trường URL khác được chấp nhận thay cho image_base64: ${JSON.stringify(r.urlFieldStatuses)}`,
  );

  /* ── B ── */
  want(
    r.size['4000000'].status === 200 && r.size['4000001'].status === 413 && r.size['40000000'].status === 413,
    `trần kích thước ảnh đã đổi: ${JSON.stringify(r.size)}`,
  );
  want(
    r.size['4000001'].quota === 0 && r.size['4000001'].providerCalls === 0 &&
      r.size['40000000'].quota === 0 && r.size['40000000'].providerCalls === 0,
    'một ảnh quá khổ vẫn tiêu một lượt hạn mức hoặc vẫn tới nhà cung cấp — chốt kích thước phải nằm ' +
      'TRƯỚC claimCall, nếu không một client hỏng sẽ đốt cả hạn mức ngày mà không có lấy một lần gọi mô hình',
  );

  /* ── C ── */
  want(r.bodyIdsIgnored, 'mealId/entry_id/userId trong thân yêu cầu đi được tới nhà cung cấp — scan-food không nhận mục tiêu bữa ăn từ client');
  want(
    !/user_id|meal_id|entry_id|reward/.test(r.modelIdFields),
    `output của mô hình mang được user_id/meal_id/entry_id/reward ra khỏi hàm: ${r.modelIdFields.slice(0, 120)} — ` +
      'clampItems phải DỰNG LẠI từng món chứ không lan truyền',
  );

  /* ── D ── */
  for (const [label, x] of Object.entries(r.replies)) {
    want(
      x.status === 200 && x.body.startsWith('{"items":[]}'),
      `phản hồi mô hình không dùng được (${label}) ra ${x.status} ${x.body} thay vì {"items":[]} — ` +
        'mọi hình dạng không dùng được phải kết thúc giống nhau; bản đã ship để args hỏng ném ra 500 kèm ' +
        'nguyên câu của bộ phân tích JSON, sau khi hạn mức đã bị trừ',
    );
  }
  want(r.manyItems <= 20, `200 món trả về ${r.manyItems} — trần là 20`);

  /* ── E ── */
  want(
    r.auth.none.status === 401 && r.auth.bad.status === 401 && r.auth.anon.status === 401,
    `không token / token rác / khoá anon ra ${r.auth.none.status}/${r.auth.bad.status}/${r.auth.anon.status} thay vì 401`,
  );
  want(r.auth.anon.providerCalls === 0, 'khoá anon gọi được tới nhà cung cấp');
  want(r.auth.user.status === 200, `người dùng hợp lệ bị từ chối (${r.auth.user.status})`);

  /* ── F ── */
  want(
    r.gateway['429'] === 429 && r.gateway['402'] === 402,
    `lỗi gateway không còn được chuyển tiếp đúng mã: ${JSON.stringify(r.gateway)}`,
  );

  /* ── G ── */
  want(
    r.survivesLogout === null,
    `ô bàn giao ảnh quét SỐNG SÓT qua đăng xuất: người kế tiếp nhận được ${JSON.stringify(r.survivesLogout)}. ` +
      'Đây là state ở phạm vi module mô tả đĩa ăn của một người, và sáu kho cùng loại đều đăng ký reset ' +
      'với user-scoped-reset. Sheet sẽ nối món đó vào bữa của người thứ hai, rồi calo và macro đi tiếp ' +
      'vào meal_entries, recomputeDailyLog, vòng calo và điểm sẵn sàng',
  );
  want(r.ttlFresh === 1, `một lần quét mới bị bỏ (${r.ttlFresh})`);
  want(r.ttlStale === null, 'một lần quét quá hạn vẫn được phục vụ — bữa người ta quên đã chụp không phải bữa họ đang chọn ghi');
  want(r.firstRead === 1 && r.secondRead === null, `ô bàn giao đọc được hai lần (${r.firstRead}/${JSON.stringify(r.secondRead)}) — focus lại sẽ nối món hai lần`);
  want(
    JSON.stringify(r.overwrite) === '["BRAVO_MEAL_456"]',
    `ngữ nghĩa ghi đè của ô bàn giao đã đổi: ${JSON.stringify(r.overwrite)}`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('ranh giới ảnh quét còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ranh giới ảnh quét OK — CHẠY THẬT handler scan-food và lib/scan-bridge. Mười một đầu vào hình dạng URL ' +
    '(127.0.0.1, 169.254.169.254, file:, javascript:, gopher:, userinfo, [::1], đường dẫn storage…) và năm ' +
    'tên trường URL khác: host duy nhất từng được gọi là gateway — không có SSRF vì không có đường tải ảnh ' +
    'từ URL, ảnh đi inline trong một data: URL nên nhà cung cấp cũng không tải gì. 4.000.000 ký tự qua, ' +
    '4.000.001 ra 413 với 0 lượt hạn mức và 0 lần gọi nhà cung cấp — chốt kích thước nằm TRƯỚC claimCall. ' +
    'mealId/entry_id/userId trong thân yêu cầu bị bỏ qua hoàn toàn, và user_id/meal_id/entry_id/reward do mô ' +
    'hình bịa ra không ra khỏi hàm vì clampItems dựng lại từng món. Mọi phản hồi không dùng được — kcal âm, ' +
    'Infinity, khổng lồ, null, items là mảng, không có tool call, choices rỗng, args không phải JSON — đều ' +
    'ra {"items":[]} (bản đã ship để args hỏng ném 500 kèm nguyên câu của bộ phân tích, sau khi đã trừ hạn ' +
    'mức), 200 món bị chặn ở 20. Không token/token rác/khoá anon đều 401 và không gọi nhà cung cấp. Và ô ' +
    'bàn giao ảnh quét KHÔNG còn sống sót qua đăng xuất (bản đã ship: B nhận đúng đĩa ăn A vừa chụp), vẫn ' +
    'hết hạn sau 5 phút và vẫn chỉ đọc được một lần',
);
