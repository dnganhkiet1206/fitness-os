/**
 * Mọi phép ĐỌC của một vế `live.mjs` chỉ đọc màn ĐANG HIỆN (#110).
 *
 * ── vì sao ──
 *
 * Trên bản web, điều hướng trong app (bấm → push) KHÔNG gỡ màn trước: nó ở lại
 * trong DOM với `display: none` và `aria-hidden="true"`. Đo ở #108 (Thư viện Đã
 * lưu → "Tìm công thức" → màn Tìm): năm phần tử `role="tab"`, ba của màn CŨ,
 * trong đó ô "Công thức" ĐANG CHỌN.
 *
 * `count()`, `getAttribute()`, `evaluateAll()`, `allInnerTexts()` của Playwright
 * không lọc phần tử ẩn. Chỉ `click()` chờ phần tử hiện. Bản đầu của vế #108 đọc
 * `aria-selected` của ô màn cũ và XANH cả khi màn Tìm mở ở phân đoạn Người. Phép
 * phá thử bắt được; không có nó thì vế ấy đã lên nhánh rỗng nghĩa.
 *
 * ── luật ──
 *
 * Trong mỗi vế của `SCENARIOS` (đọc bằng Babel, không bằng regex): mọi phép đọc
 * `count / getAttribute / evaluateAll / allInnerTexts / allTextContents /
 * textContent / inputValue / innerText` trên một locator gốc là `page.locator`,
 * `getByText`, `getByPlaceholder`, `getByLabel`, `getByTitle`, `getByAltText`,
 * `getByTestId` phải đi qua `.filter({ visible: true })` hay `:visible` trong
 * bộ chọn. Gốc được lần qua biến và hàm phụ trong cùng vế. Được miễn:
 *   · `getByRole` — mặc định `includeHidden: false`, và màn cũ mang `aria-hidden`;
 *   · `locator('body' | '#root').innerText()` — `innerText` của một phần tử đang
 *     vẽ đã bỏ mọi con `display: none`.
 *
 * Luật áp cho MỌI vế, không chỉ vế có điều hướng: đoán "vế này có điều hướng
 * không" từ mã là đoán sai. Nút "Quay lại", một hàm phụ khai ở đầu vế rồi gọi
 * sau cú bấm — bản thử theo vị trí vừa báo oan vừa bỏ sót đúng hai kiểu ấy.
 * Lúc viết luật có 23 phép đọc như thế; chèn bộ lọc vào 20 gốc.
 *
 * ── và DOM tự truy vấn (#113) ──
 *
 * `page.evaluate(() => document.querySelectorAll(…))` không qua locator, nên
 * bản đầu của luật không thấy (đã ghi là vùng mù). Có 11 lệnh gọi như thế trong
 * 6 vế. Nay trong thân một vế, mọi `querySelector`/`querySelectorAll` phải là
 * `window.__shown(sel, root)`, hàm `openPage` cài vào mọi trang, lọc bằng
 * `checkVisibility()`. Hàm của lượt quét màn (chụp nhanh, `visitSegments`) chạy
 * trên trang vừa mở và nằm ngoài các vế, nên không bị xét.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = createRequire(pathToFileURL(path.join(NATIVE, 'package.json')))('@babel/parser');

const READS = new Set(['count', 'getAttribute', 'evaluateAll', 'innerText', 'textContent', 'allInnerTexts', 'allTextContents', 'inputValue']);
const RISKY = new Set(['locator', 'getByText', 'getByPlaceholder', 'getByLabel', 'getByTitle', 'getByAltText', 'getByTestId']);

function walk(n, f) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) return n.forEach((c) => walk(c, f));
  if (typeof n.type !== 'string') return;
  f(n);
  for (const k in n) if (k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments') walk(n[k], f);
}

const mentionsVisible = (a) =>
  (a?.type === 'StringLiteral' && /:visible/.test(a.value)) ||
  (a?.type === 'TemplateLiteral' && a.quasis.some((q) => /:visible/.test(q.value.cooked)));

/** Gốc của một chuỗi gọi: `{ kind, visible, body }`, lần qua biến và hàm phụ trong `scope`. */
function root(n, scope, depth = 0) {
  let visible = false;
  while (n) {
    if (n.type === 'AwaitExpression') n = n.argument;
    else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
      const p = n.callee.property.name;
      const a = n.arguments[0];
      if (p === 'filter' && a?.type === 'ObjectExpression' && a.properties.some((q) => q.key?.name === 'visible' && q.value?.value === true)) visible = true;
      if (n.callee.object.type === 'Identifier' && n.callee.object.name === 'page') {
        if (!RISKY.has(p)) return { kind: p, visible: true };
        return { kind: p, visible: visible || mentionsVisible(a), body: p === 'locator' && a?.type === 'StringLiteral' && /^(body|#root)$/.test(a.value) };
      }
      n = n.callee.object;
    } else if ((n.type === 'CallExpression' && n.callee.type === 'Identifier') || n.type === 'Identifier') {
      const name = n.type === 'Identifier' ? n.name : n.callee.name;
      const d = depth < 4 ? scope.get(name) : null;
      if (!d) return { kind: `?${name}`, visible: true };
      const r = root(d, scope, depth + 1);
      return { ...r, visible: r.visible || visible };
    } else if (n.type === 'ArrowFunctionExpression') {
      n = n.body.type === 'BlockStatement' ? n.body.body.find((s) => s.type === 'ReturnStatement')?.argument : n.body;
    } else if (n.type === 'MemberExpression') n = n.object;
    else return { kind: n.type, visible: true };
  }
  return { kind: 'none', visible: true };
}

/** `{ out: ["dòng: [vế] gốc(…).đọc()"], reads: số phép đọc trên gốc rủi ro }`. */
export function problemsOf(src) {
  const ast = parse(src, { sourceType: 'module', allowAwaitOutsideFunction: true });
  const out = [];
  let reads = 0;
  let leaf = 0;
  walk(ast.program, (n) => {
    if (n.type !== 'ObjectExpression') return;
    const name = n.properties.find((p) => p.key?.name === 'name')?.value;
    const run = n.properties.find((p) => p.key?.name === 'run');
    if (!name || !run) return;
    const fn = run.type === 'ObjectMethod' ? run : run.value;
    if (!fn?.body) return;
    const scope = new Map();
    walk(fn.body, (m) => {
      if (m.type === 'VariableDeclarator' && m.id.type === 'Identifier' && m.init) scope.set(m.id.name, m.init);
    });
    /* #176: vế có GÕ chữ thì mọi lượt quét chữ lá phải bỏ qua ô nhập — trên web
       `<textarea>` mang chữ vừa gõ trong `textContent`, nên "gõ X rồi tìm X trên
       màn" khớp CHÍNH Ô ẤY (vế (B) của #170 xanh sau 66 ms, trước cả lượt đọc
       lại). Vế không gõ gì thì không dính được, nên không bị xét. */
    let types = false;
    walk(fn.body, (m) => {
      if (m.type === 'CallExpression' && m.callee.type === 'MemberExpression' && ['fill', 'type', 'pressSequentially'].includes(m.callee.property.name)) types = true;
    });
    if (types) {
      walk(fn.body, (m) => {
        if (m.type !== 'CallExpression' || m.callee.type !== 'MemberExpression' || m.callee.property.name !== 'evaluate') return;
        if (!(m.callee.object.type === 'Identifier' && m.callee.object.name === 'page')) return;
        const text = src.slice(m.start, m.end);
        if (!/children\.length === 0/.test(text) || !/textContent/.test(text)) return;
        leaf++;
        if (!/TEXTAREA|INPUT/.test(text)) {
          const line = src.slice(0, m.start).split('\n').length;
          out.push(`tools/live.mjs:${line}: [${String(name.value ?? '?').slice(0, 60)}] vế có gõ chữ mà lượt quét chữ lá không bỏ qua TEXTAREA/INPUT — "gõ X rồi tìm X" sẽ khớp chính ô nhập (#176)`);
        }
      });
    }
    /* #181: xoá cache trên tài liệu CŨ không xoá được gì — persister còn sống ở
       đó ghi lại cả cache trong 100 ms. Vế dùng `freshCache(page)` (xoá ở đầu
       tài liệu mới, trước mã của app). */
    walk(fn.body, (m) => {
      if (m.type !== 'CallExpression' || m.callee.type !== 'MemberExpression' || !['removeItem', 'clear'].includes(m.callee.property.name)) return;
      const o = m.callee.object;
      const isLS = (o.type === 'Identifier' && o.name === 'localStorage') ||
        (o.type === 'MemberExpression' && o.property.name === 'localStorage');
      if (!isLS) return;
      const line = src.slice(0, m.start).split('\n').length;
      out.push(`tools/live.mjs:${line}: [${String(name.value ?? '?').slice(0, 60)}] localStorage.${m.callee.property.name}(…) trên tài liệu cũ — persister ghi lại cache trong 100 ms; dùng freshCache(page) rồi tải lại (#181)`);
    });
    walk(fn.body, (m) => {
      if (m.type === 'CallExpression' && m.callee.type === 'MemberExpression' && ['querySelector', 'querySelectorAll'].includes(m.callee.property.name)) {
        reads++;
        const line = src.slice(0, m.start).split('\n').length;
        out.push(`tools/live.mjs:${line}: [${String(name.value ?? '?').slice(0, 60)}] ${m.callee.property.name}(…) trần đọc cả màn CŨ còn trong DOM — dùng window.__shown(sel, root) (#113)`);
        return;
      }
      if (m.type !== 'CallExpression' || m.callee.type !== 'MemberExpression' || !READS.has(m.callee.property.name)) return;
      const r = root(m.callee.object, scope);
      if (!RISKY.has(r.kind)) return;
      if (r.body && m.callee.property.name === 'innerText') return;
      reads++;
      if (!r.visible) {
        const line = src.slice(0, m.start).split('\n').length;
        out.push(`tools/live.mjs:${line}: [${String(name.value ?? '?').slice(0, 60)}] ${r.kind}(…).${m.callee.property.name}() đọc cả màn CŨ còn trong DOM — thêm .filter({ visible: true })`);
      }
    });
  });
  return { out, reads, leaf };
}

const LIVE = readFileSync(path.join(NATIVE, 'tools/live.mjs'), 'utf8');
const { out: problems, reads, leaf } = problemsOf(LIVE);
if (reads < 20) problems.push(`chỉ thấy ${reads} phép đọc trên locator rủi ro — bộ đọc hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const one = (label, body, wantRed) => {
    const src = `const SCENARIOS = [{ name: 'thử', async run(page) {\n${body}\n} }];`;
    const got = problemsOf(src).out.length > 0;
    if (got !== wantRed) problems.push(`thử ngược hỏng: ${label} — luật ${got ? 'đỏ' : 'xanh'}, phải ${wantRed ? 'đỏ' : 'xanh'}`);
  };
  one('getByText(…).count() không lọc', "if (await page.getByText('x').count()) return 'a';", true);
  one('locator(css).getAttribute() qua biến', "const t = page.locator('[role=tab]').first(); await t.getAttribute('aria-selected');", true);
  one('hàm phụ khai trước, gọi sau (kiểu "Huy hiệu")', "const has = async () => (await page.locator('[aria-label]').evaluateAll((e) => e.length)); await has();", true);
  one('có .filter({ visible: true })', "await page.getByText('x').filter({ visible: true }).count();", false);
  one(':visible trong bộ chọn', "await page.locator('#root [role=\"tab\"]:visible').count();", false);
  one('getByRole (tự loại phần tử ẩn)', "await page.getByRole('button', { name: 'x' }).count();", false);
  one("locator('body').innerText()", "await page.locator('body').innerText();", false);
  one('document.querySelectorAll trong page.evaluate (#113)', "await page.evaluate(() => [...document.querySelectorAll('div')].length);", true);
  one('el.querySelector trong page.evaluate (#113)', "await page.evaluate(() => document.body.querySelector('[data-x]'));", true);
  one('window.__shown (#113)', "await page.evaluate(() => window.__shown('div').length);", false);
  one('gõ chữ rồi quét chữ lá không bỏ ô nhập (#176)', "await page.getByRole('textbox').fill('x'); await page.evaluate(() => window.__shown('*').filter((e) => e.children.length === 0 && e.textContent === 'x').length);", true);
  one('gõ chữ rồi quét chữ lá có bỏ ô nhập (#176)', "await page.getByRole('textbox').fill('x'); await page.evaluate(() => window.__shown('*').filter((e) => !/^(TEXTAREA|INPUT)$/.test(e.tagName)).filter((e) => e.children.length === 0 && e.textContent === 'x').length);", false);
  one('không gõ gì thì quét chữ lá không bị xét (#176)', "await page.evaluate(() => window.__shown('*').filter((e) => e.children.length === 0 && e.textContent === 'x').length);", false);
  one('xoá cache trên tài liệu cũ (#181)', "await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('rq_cache')) localStorage.removeItem(k); }); await page.reload();", true);
  one('window.localStorage.clear() trên tài liệu cũ (#181)', 'await page.evaluate(() => window.localStorage.clear()); await page.reload();', true);
  one('freshCache rồi tải lại (#181)', 'await freshCache(page); await page.reload();', false);
  one('localStorage.setItem không bị xét (#181)', "await page.evaluate(() => localStorage.setItem('x', '1'));", false);
  /* #181 trên chính live.mjs: đưa một vế về lệnh xoá trần thì đỏ. */
  const cut181 = LIVE.replace('await freshCache(page);', "await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('rq_cache')) localStorage.removeItem(k); });");
  if (cut181 === LIVE) problems.push('thử ngược hỏng: không vế nào gọi freshCache(page) (#181)');
  else if (!problemsOf(cut181).out.some((x) => x.includes('#181'))) problems.push('thử ngược hỏng: đưa một vế về lệnh xoá cache trần mà luật vẫn xanh (#181)');
  /* Trên chính live.mjs: gỡ bộ lọc ở vế #108 thì đỏ. */
  const cut = LIVE.replace("page.getByPlaceholder(/^(Dish name|Tên món)$/).filter({ visible: true }).count()", 'page.getByPlaceholder(/^(Dish name|Tên món)$/).count()');
  if (cut === LIVE) problems.push('thử ngược hỏng: không thấy phép đếm "Tên món" có bộ lọc trong vế #108');
  /* #176 trên chính live.mjs: gỡ bộ lọc ô nhập ở vế #170 thì đỏ. */
  const cut176 = LIVE.replace("        .filter((e) => !/^(TEXTAREA|INPUT)$/.test(e.tagName))\n", '');
  if (cut176 === LIVE) problems.push('thử ngược hỏng: không thấy bộ lọc ô nhập của vế #170');
  else if (!problemsOf(cut176).out.some((x) => x.includes('#176'))) problems.push('thử ngược hỏng: gỡ bộ lọc ô nhập ở vế #170 mà luật vẫn xanh');
  else if (problemsOf(cut).out.length === 0) problems.push('thử ngược hỏng: gỡ bộ lọc ở vế #108 mà luật vẫn xanh');
}

if (problems.length) {
  console.log('vế live.mjs đọc cả màn cũ còn trong DOM:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `đọc màn đang hiện OK — ${reads} phép đọc (count, getAttribute, evaluateAll, allInnerTexts…) trên locator CSS / chữ / gợi ý trong các vế của ` +
    'live.mjs đều lọc phần tử hiển thị, nên không vế nào đọc nhầm màn trước — màn ấy vẫn nằm trong DOM với display:none sau một cú bấm ' +
    'điều hướng, và bản đầu của vế #108 đã xanh nhờ nó. Miễn: getByRole (tự loại phần tử ẩn) và innerText của body/#root. Thử ngược: ' +
    'getByText.count, getAttribute qua biến, hàm phụ khai trước gọi sau, và gỡ bộ lọc ở vế #108 thì đỏ; có bộ lọc, :visible, getByRole, ' +
    'body.innerText thì xanh; querySelector(All) trần trong một vế thì đỏ, window.__shown thì xanh (#113); ' +
    `${leaf} lượt quét chữ lá trong vế có gõ chữ đều bỏ qua ô nhập (#176; gỡ bộ lọc ở vế #170 thì đỏ); không vế nào xoá cache trên ` +
    'tài liệu cũ — persister ghi lại nó trong 100 ms — mà qua freshCache (#181; đưa một vế về lệnh xoá trần thì đỏ)',
);
