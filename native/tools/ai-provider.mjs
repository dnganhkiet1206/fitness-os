/**
 * Đường tới nhà cung cấp AI, CHẠY THẬT — chuyển bên, hạn giờ, và sổ token.
 *
 * ── vì sao bước này tồn tại ──
 *
 * Ba chế độ hỏng trên đường này đều IM LẶNG, và cả ba đều dễ gặp nhất đúng vào
 * ngày đổi nhà cung cấp:
 *
 *   1. Một bên TREO. `fetch` trần không có hạn giờ, nên vòng dự phòng đứng lại
 *      ở bên hỏng và bên thứ hai không bao giờ được thử. Không lỗi, không log —
 *      chỉ là một request không bao giờ xong.
 *   2. Một bên không trả `usage`. Mọi thứ chạy đúng, chỉ có `ai_usage` về 0:
 *      app phục vụ AI miễn phí và không có gì trông như hỏng.
 *   3. Một bên bỏ qua `tool_choice`. HTTP 200, thân hợp lệ, thiếu đúng thứ mình
 *      cần — và bốn tính năng trả về rỗng.
 *
 * Không cái nào bắt được bằng cách đọc mã. Nên bước này biên dịch `_shared/ai.ts`
 * và `_shared/guard.ts` ra rồi GỌI chúng, với `fetch` và `Deno.env` là đồ giả.
 *
 * ── và nó KHÔNG kiểm cái gì ──
 *
 * Không nhà cung cấp thật nào được gọi. Nó chứng minh phần logic của mình đúng
 * với một nhà cung cấp cư xử theo từng kiểu; nó không chứng minh nhà cung cấp
 * thật cư xử theo kiểu nào. Đó là việc của khói ở bản deploy.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

/* ── biên dịch hai tệp Deno ra CommonJS ─────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'aiprov-'));
try {
  execFileSync('npx', ['tsc',
    '../supabase/functions/_shared/ai.ts', '../supabase/functions/_shared/guard.ts',
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2022',
    '--skipLibCheck', '--lib', 'es2022,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* Tệp Deno: `Deno` chưa khai và import là URL. tsc kêu rồi vẫn emit. */ }

const guardJs = path.join(out, 'guard.js');
writeFileSync(guardJs, readFileSync(guardJs, 'utf8')
  .replace(/require\("https:\/\/esm\.sh\/[^"]+"\)/g, 'require("./sb.cjs")'));
writeFileSync(path.join(out, 'sb.cjs'), 'module.exports = { createClient: () => ({}) };');

const req = createRequire(path.join(out, 'x.cjs'));
const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };

/** Nạp lại module sau khi đổi env — `TIMEOUT_MS` đọc lúc nạp. */
const load = (name) => { delete req.cache[req.resolve(`./${name}.js`)]; return req(`./${name}.js`); };

/* ── đồ giả cho fetch ────────────────────────────────────────────────────── */
const jsonRes = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const sseRes = (chunks) => new Response(
  new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  }),
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
);
/*
  Một bên TREO — và nó phải treo đúng cách một `fetch` thật treo.

  Bản đầu của đồ giả này trả `new Promise(() => {})` và bỏ qua `signal`. Nó
  không mô phỏng được `fetch`: khi controller abort, `fetch` thật NÉM, còn cái
  này thì không — nên bước kiểm treo mãi và báo "unsettled top-level await"
  thay vì báo có hay không có hạn giờ. Đồ đo sai thì phép đo không nói gì cả.
*/
const never = (init) => new Promise((_, reject) => {
  init?.signal?.addEventListener('abort', () => {
    reject(Object.assign(new Error('The signal has been aborted'), { name: 'AbortError' }));
  });
});

/** Một `fetch` giả trả lời theo URL. `hits` ghi lại thứ tự đã gọi. */
function fakeFetch(byUrl, hits) {
  return async (url, init) => {
    hits.push(url);
    const r = byUrl[url];
    if (typeof r === 'function') return r(init);
    return r;
  };
}

/*
  Một bước kiểm TREO là một bước kiểm không nói gì.

  Chính chế độ hỏng mà mục 2 tồn tại để bắt — không có hạn giờ — cũng làm treo
  bước kiểm này nếu nó chỉ `await`. Nó sẽ in "unsettled top-level await" và
  thoát 0, tức báo XANH cho đúng cái lỗi nó được viết ra để bắt. Nên mọi lời gọi
  ở đây chạy đua với một đồng hồ, và hết giờ là một KẾT QUẢ, không phải một
  khoảng lặng.
*/
const CAP_MS = 4000;
const within = (p, label) => Promise.race([
  p,
  new Promise((r) => setTimeout(() => r({ __stalled: label }), CAP_MS)),
]);

const A = 'https://a.test/v1/chat/completions';
const B = 'https://b.test/v1/chat/completions';
const twoProviders = () => {
  ENV.ASCND_AI_URL = A; ENV.ASCND_AI_KEY = 'ka'; ENV.ASCND_AI_MODEL = 'ma'; ENV.ASCND_AI_VISION_MODEL = 'va';
  ENV.ASCND_AI_URL_2 = B; ENV.ASCND_AI_KEY_2 = 'kb'; ENV.ASCND_AI_MODEL_2 = 'mb'; ENV.ASCND_AI_VISION_MODEL_2 = 'vb';
};
const clearEnv = () => { for (const k of Object.keys(ENV)) delete ENV[k]; };

/* ═══ 1. không có nhà cung cấp nào → null, không phải một request ═══ */
{
  clearEnv();
  const hits = [];
  globalThis.fetch = fakeFetch({}, hits);
  const ai = load('ai');
  const res = await ai.callAI({ messages: [] });
  want(res === null, `không cấu hình bên nào: callAI trả ${res === null ? 'null' : 'một Response'} — phải là null`);
  want(hits.length === 0, `không cấu hình bên nào mà vẫn gọi ${hits.length} request`);
}

/* ═══ 2. E2 — bên A TREO thì bên B vẫn được thử ═══ */
{
  clearEnv(); twoProviders(); ENV.ASCND_AI_TIMEOUT_MS = '150';
  const hits = [];
  globalThis.fetch = fakeFetch({ [A]: never, [B]: jsonRes(200, { ok: true }) }, hits);
  const ai = load('ai');
  const t0 = Date.now();
  const res = await within(ai.callAI({ messages: [] }), 'callAI');
  const ms = Date.now() - t0;
  want(!res?.__stalled, `bên A treo: callAI không trả về sau ${CAP_MS}ms — hạn giờ không cắt được, nên dự phòng không bao giờ chạy`);
  want(!res?.__stalled && res !== null && res.status === 200, 'bên A treo: không nhận được câu trả lời của bên B');
  want(hits[0] === A && hits[1] === B, `bên A treo: thứ tự gọi là ${JSON.stringify(hits)} — phải là A rồi B`);
  want(ms < 2000, `bên A treo: mất ${ms}ms để tới bên B với hạn giờ 150ms — hạn giờ không có tác dụng`);
}

/* ═══ 3. hạn giờ KHÔNG được cắt thân đang stream ═══ */
{
  clearEnv(); twoProviders(); ENV.ASCND_AI_TIMEOUT_MS = '150';
  const hits = [];
  /* Header về ngay, thân chảy chậm hơn hạn giờ. */
  globalThis.fetch = fakeFetch({
    [A]: () => new Response(new ReadableStream({
      async start(c) {
        const enc = new TextEncoder();
        await new Promise((r) => setTimeout(r, 400));
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"xong"}}]}\n\n'));
        c.close();
      },
    }), { status: 200 }),
  }, hits);
  const ai = load('ai');
  const res = await within(ai.callAI({ messages: [], stream: true }), 'callAI-stream');
  want(!res?.__stalled, `stream: callAI không trả về sau ${CAP_MS}ms`);
  if (res?.__stalled) { console.error('đường tới nhà cung cấp AI:'); for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
  let body = '';
  try { body = await res.text(); } catch (e) { body = `NÉM: ${e}`; }
  want(body.includes('xong'), `thân stream bị cắt sau khi có header: ${body.slice(0, 80)} — hạn giờ phải tắt khi header về, nếu không nó tự ngắt một cuộc trò chuyện dài`);
}

/* ═══ 4. lỗi CỦA BÊN thì chuyển; lỗi CỦA YÊU CẦU thì không ═══ */
for (const [status, shouldFallback] of [[500, true], [402, true], [429, true], [401, true], [403, true], [400, false], [422, false]]) {
  clearEnv(); twoProviders(); ENV.ASCND_AI_TIMEOUT_MS = '2000';
  const hits = [];
  globalThis.fetch = fakeFetch({ [A]: jsonRes(status, { e: 1 }), [B]: jsonRes(200, { ok: true }) }, hits);
  const ai = load('ai');
  const res = await ai.callAI({ messages: [] });
  const went = hits.includes(B);
  want(went === shouldFallback,
    `bên A trả ${status}: ${went ? 'CÓ' : 'KHÔNG'} chuyển sang bên B, phải là ${shouldFallback ? 'CÓ' : 'KHÔNG'} — ` +
    (shouldFallback ? 'đây là lỗi của bên đó' : 'gửi lại đúng cái yêu cầu sai sang bên thứ hai là tiêu hai lượt cho cùng một câu trả lời'));
  want(res !== null && res.status === (shouldFallback ? 200 : status), `bên A trả ${status}: kết quả cuối là ${res && res.status}`);
}

/* ═══ 5. mỗi bên nhận TÊN MODEL của chính nó ═══ */
{
  clearEnv(); twoProviders(); ENV.ASCND_AI_TIMEOUT_MS = '2000';
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen[url] = JSON.parse(init.body).model;
    return url === A ? jsonRes(500, {}) : jsonRes(200, { ok: true });
  };
  const ai = load('ai');
  await ai.callAI({ messages: [] });
  want(seen[A] === 'ma' && seen[B] === 'mb', `model gửi đi: A=${seen[A]} B=${seen[B]} — mỗi bên phải nhận tên model của chính nó`);
  const seen2 = {};
  globalThis.fetch = async (url, init) => { seen2[url] = JSON.parse(init.body).model; return jsonRes(200, {}); };
  await load('ai').callAI({ messages: [] }, { vision: true });
  want(seen2[A] === 'va', `model ảnh gửi đi: ${seen2[A]} — phải là model thị giác của bên đó`);
}

/* ═══ 6. PHASE 3 — sổ token không được im lặng ═══ */
{
  const g = load('guard');
  const cases = [
    ['usage đầy đủ', { usage: { total_tokens: 120 } }, 120],
    ['không có usage', { choices: [] }, 0],
    ['usage rác', { usage: { total_tokens: 'nhiều' } }, 0],
    ['usage âm', { usage: { total_tokens: -5 } }, 0],
    ['null', null, 0],
  ];
  for (const [label, payload, expect] of cases) {
    want(g.tokensOf(payload) === expect, `tokensOf(${label}) ra ${g.tokensOf(payload)}, mong ${expect}`);
  }

  /* `recordTokens` với 0 phải NÓI RA, không được im lặng trả về. */
  const spoke = [];
  const realErr = console.error;
  console.error = (...a) => spoke.push(a.join(' '));
  const rpc = [];
  const fakeDb = { rpc: async (name, args) => { rpc.push([name, args]); return { error: null }; } };
  await g.recordTokens(fakeDb, 'ai-coach', 0, false);
  console.error = realErr;
  want(rpc.length === 0, 'recordTokens(0) vẫn ghi vào sổ — không được bịa ra một con số');
  want(spoke.some((s) => /UNMETERED/.test(s)),
    'recordTokens(0) im lặng trả về — "một lượt gọi AI vừa được phục vụ và không ai tính tiền" phải đếm được, ' +
    `log thấy: ${JSON.stringify(spoke).slice(0, 120)}`);
}

/* ═══ 7. PHASE 3 — meterStream trên bảy hình dạng dòng ═══ */
{
  const g = load('guard');
  const drain = async (chunks) => {
    const rpc = [];
    const spoke = [];
    const realErr = console.error;
    console.error = (...a) => spoke.push(a.join(' '));
    const db = { rpc: async (n, a) => { rpc.push([n, a]); return { error: null }; } };
    const body = sseRes(chunks).body;
    g.meterStream(db, 'ai-coach', body, false);
    await new Promise((r) => setTimeout(r, 60));
    console.error = realErr;
    return { rpc, spoke };
  };
  const usageChunk = 'data: {"usage":{"total_tokens":77}}\n\n';
  const textChunk = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n';

  const ok = await drain([textChunk, usageChunk, 'data: [DONE]\n\n']);
  want(ok.rpc.length === 1 && ok.rpc[0][1].p_tokens === 77,
    `dòng có usage: ghi ${JSON.stringify(ok.rpc)} — phải ghi 77 token`);

  const noUsage = await drain([textChunk, 'data: [DONE]\n\n']);
  want(noUsage.rpc.length === 0, 'dòng KHÔNG có usage: vẫn ghi vào sổ — không được bịa số');
  want(noUsage.spoke.some((s) => /UNMETERED/.test(s)),
    'dòng KHÔNG có usage kết thúc trong IM LẶNG — đó là một cuộc trò chuyện được phục vụ mà không ai tính tiền, ' +
    'và nó phải đếm được');

  const badUsage = await drain([textChunk, 'data: {"usage":{"total_tokens":"nhiều"}}\n\n']);
  want(badUsage.spoke.some((s) => /UNMETERED/.test(s)), 'usage rác cũng phải nói ra');

  const cutOff = await drain([textChunk]);
  want(cutOff.spoke.some((s) => /UNMETERED/.test(s)), 'dòng đứt giữa chừng (không [DONE], không usage) phải nói ra');

  const junk = await drain(['data: {oops\n\n', usageChunk]);
  want(junk.rpc.length === 1 && junk.rpc[0][1].p_tokens === 77,
    'một chunk không parse được phải là một chunk, không phải một lỗi — usage sau đó vẫn phải đọc được');
}

/* ═══ 8. PHASE 4 — toolArgs ═══ */
{
  const g = load('guard');
  const tool = (name, args) => ({ choices: [{ message: { tool_calls: [{ function: { name, arguments: args } }] }}] });
  const cases = [
    ['đúng tên, args hợp lệ', tool('f', '{"items":[1]}'), true],
    ['danh sách rỗng nhưng hợp lệ', tool('f', '{"items":[]}'), true],
    ['không có tool call', { choices: [{ message: { content: 'xin lỗi' } }] }, false],
    ['choices rỗng', { choices: [] }, false],
    ['args không phải JSON', tool('f', '{oops'), false],
    ['args rỗng', tool('f', ''), false],
    ['args ra một mảng', tool('f', '[1,2]'), false],
    ['tên hàm khác', tool('g', '{"items":[]}'), false],
    ['null', null, false],
  ];
  for (const [label, payload, ok] of cases) {
    const got = g.toolArgs(payload, 'f');
    want((got !== null) === ok,
      `toolArgs(${label}) ra ${got === null ? 'null' : JSON.stringify(got)}, mong ${ok ? 'một object' : 'null'}`);
  }
  want(JSON.stringify(g.toolArgs(tool('f', '{"items":[]}'), 'f')) === '{"items":[]}',
    'một tool call hợp lệ có mảng RỖNG bên trong phải đi qua — "không có gợi ý nào" là câu trả lời thật, ' +
    'khác hẳn "model chưa bao giờ trả lời"');
}

/* ═══ 9. PHASE 8 — Lovable chỉ được xuất hiện ở ĐÚNG MỘT chỗ ═══

   Hôm nay gateway Lovable vẫn là giá trị MẶC ĐỊNH trong `_shared/ai.ts`, và đó
   là cố ý: trong lúc chuyển đổi, đặt sai một biến thì mọi thứ vẫn chạy như cũ
   thay vì tắt hẳn. Cái phải cấm là nó quay lại NGOÀI chỗ ấy — một endpoint gõ
   thẳng trong một function là đúng thứ mà `_shared/ai.ts` sinh ra để xoá, và
   nó sẽ lặng lẽ tính tiền vào tài khoản cũ sau khi mọi thứ khác đã chuyển.

   Ngày cắt xong, con số dưới đây về 0 và dòng này thành "không còn chỗ nào". */
{
  const FNS = path.resolve(NATIVE, '..', 'supabase/functions');
  const { readdirSync, statSync } = await import('node:fs');
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const f = path.join(d, e);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (!/\.ts$/.test(f)) continue;
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (/lovable/i.test(src)) hits.push(path.relative(FNS, f));
    }
  };
  walk(FNS);
  const allowed = ['_shared/ai.ts'];
  const stray = hits.filter((h) => !allowed.includes(h));
  want(stray.length === 0,
    `Lovable còn được nhắc ngoài \`_shared/ai.ts\`: ${stray.join(', ')} — một endpoint hay một khoá gõ thẳng ` +
    'trong một function sẽ tiếp tục tính tiền vào tài khoản cũ sau khi mọi thứ khác đã chuyển, và không có gì báo');
}

if (problems.length) {
  console.error('đường tới nhà cung cấp AI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'đường tới nhà cung cấp AI OK — CHẠY THẬT callAI/meterStream/recordTokens/toolArgs với fetch và Deno.env giả. ' +
  'Không bên nào cấu hình thì trả null và KHÔNG gửi request nào. Bên A TREO thì hạn giờ cắt và bên B vẫn được ' +
  'thử (bản không có hạn giờ đứng lại mãi ở bên A, nên dự phòng chưa từng chạy được cho chế độ hỏng dễ gặp ' +
  'nhất). Hạn giờ tắt khi header về, nên một thân stream chậm hơn hạn giờ vẫn chảy trọn — bao cả request thì ' +
  'nó tự ngắt một cuộc trò chuyện dài. 402/429/401/403/5xx chuyển bên; 400/422 thì không. Mỗi bên nhận tên ' +
  'model của chính nó, kể cả model thị giác. Sổ token: usage thiếu, rác, âm, hay dòng đứt giữa chừng đều KHÔNG ' +
  'ghi số bịa và đều nói ra UNMETERED — im lặng ở đó nghĩa là một lượt AI được phục vụ mà không ai tính tiền. ' +
  'toolArgs từ chối chín hình dạng không dùng được và vẫn cho một mảng rỗng hợp lệ đi qua',
);
