/**
 * Một khối đứng trên TRANG không được lấy mặt của một chỗ LÕM.
 *
 *     node tools/on-page-fill.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Chủ dự án chụp tab Tập luyện và khoanh đỏ ba chỗ một lúc: nút "+ Tạo mới" và
 * khối hai hàng "Thư viện & lịch sử" / "Tiến bộ từng bài". Cả ba trôi vào nền
 * be của trang, không đọc ra là một khối.
 *
 * Cả hai style ấy viết `backgroundColor: m.inset.bg`. Đo ra:
 *
 *     tối    rgba(255,255,255,0.06) trên #070708 → #161617   1,113:1
 *     sáng   #f7f4ef                trên #f7f4ef → #f7f4ef   1,000:1
 *
 * `inset.bg` của bản sáng ĐÚNG BẰNG `background`, và giao ước của nó nói vì
 * sao: một chỗ lõm là chỗ mặt thẻ lộ trở lại. Khi không có mặt thẻ nào ở sau —
 * khi khối nằm thẳng trên trang — thì "lộ thứ ở sau" là lộ chính cái trang.
 *
 * ── vì sao đây là lần thứ NĂM ──
 *
 *     segmented.tsx     thumb   "đúng bằng hex nền trang (1,00:1)"
 *     today-meals.tsx   tấm     "trên giấy `inset.bg` CHÍNH LÀ nền trang"
 *     nutrition.tsx     pill    chủ dự án: "trộn vào màu be bên dưới"
 *     workouts/index    2 khối  ← lần này
 *
 * Ba lần đầu được chữa TẠI CHỖ. Không lần nào để lại một cái cửa, nên lần sau
 * người viết lại gặp lại đúng câu hỏi ấy và lại trả lời sai — vì `inset.bg` là
 * cái tên duy nhất kho này có cho "một mặt nhạt", và nó nghe đúng.
 *
 * ── vì sao không luật màu nào có sẵn bắt được ──
 *
 *   `palette.mjs`     đo các TOKEN, và `inset.bg` LÀ một token hợp lệ, đúng giá
 *                     trị nó phải có. Lỗi không nằm trong giá trị.
 *   `same-color.mjs`  hỏi CHỮ có trùng nền không, không hỏi một cái NỀN
 *   `ink-alpha.mjs`   chỉ có thẩm quyền với `alpha(m.ink, x)`
 *   `paper-warmth`    đo SẮC của một lớp phủ, không đo bậc của một mặt
 *   `tsc`             một trường hợp lệ
 *
 * Không cửa nào bắt được vì lỗi KHÔNG nằm trong style — nó nằm ở chỗ style ấy
 * được TREO LÊN. Cùng một dòng `backgroundColor: m.inset.bg` là đúng trong một
 * `GlassCard` và sai trên trang. Muốn biết cái nào thì phải đọc cây JSX, mà
 * bốn luật trên đều đọc `StyleSheet` như một bảng giá trị rời.
 *
 * Nên luật này PHÂN TÍCH CÂY. Nó dựng lại ngữ cảnh bằng trình biên dịch
 * TypeScript thật (`ts.createSourceFile`), không phải regex:
 *
 *   1. đọc mọi bảng style của tệp (`makeStyles`, `StyleSheet.create`), ghi lại
 *      style nào có `backgroundColor` và văn bản của nó;
 *   2. theo một nấc import để thấy bảng dùng chung (`useFoodListStyles()`);
 *   3. đi từ một cái GỐC BIẾT TÊN xuống, đếm số MẶT đã đi qua — một thẻ, hay
 *      bất kỳ element nào có `backgroundColor` của riêng nó;
 *   4. một element đeo style `m.inset.bg` khi số mặt đã đi qua bằng 0 thì nó
 *      nằm thẳng trên trang.
 *
 * Có hai loại gốc. `<Screen>` là trang, độ sâu 0. Và gốc của một SHEET —
 * `<KeyboardAvoidingView style={styles.root}>` — được đọc theo GIÁ TRỊ nền nó
 * tự khai, không theo tên: ba sheet ghi buổi tập / ghi bữa / dựng buổi tập đều
 * tô `c.card`, tức một mặt trắng, nên `inset.bg` trên đó là chỗ lõm ĐÚNG; một
 * sheet tô `c.background` thì lại chính là trang, và cùng dòng ấy sẽ vô hình y
 * như ở tab Tập luyện.
 *
 * Component con khai báo trong cùng tệp được ĐI VÀO tại chỗ gọi, mang theo
 * số mặt hiện tại — `FoodGroup` trong `nutrition.tsx` là ca ấy.
 *
 * ── và cặp `X` / `XOnCard` ──
 *
 * Khi một bảng có cả hai tên ấy thì chính cái hậu tố đã ghi lại lựa chọn, nên
 * luật đọc được nó mà không cần biết tên riêng của style nào: `X` phải ở độ
 * sâu 0, `XOnCard` phải ở độ sâu >0. `groupOnCard` ra đời đúng để chặn một
 * khối lồng trong một thẻ, rồi hai chỗ trong `nutrition.tsx` vẫn gọi `group`
 * bên trong một `GlassCard` — quyết định trôi mất ngay trong tệp đã ghi nó.
 *
 * ── và luật đã phải RỘNG hơn một cái tên ──
 *
 * Bản đầu chỉ hỏi "có phải `m.inset.bg` không". Nút "Đồng bộ Apple Health" ở
 * màn Hôm nay chìm hẳn vào nền mà vẫn đi qua, vì nó tô bằng một biểu thức
 * KHÁC: `alpha(c.secondary, 0.2)` — composite ra 1,018:1 so với trang, ở cả
 * hai diện mạo. Cùng triệu chứng, khác token, và chủ dự án lại là người tìm ra.
 *
 * Nên thứ được canh không còn là một cái tên mà là một PHÉP ĐO: composite biểu
 * thức lên trang rồi hỏi nó có tách ra khỏi trang không, sàn 1,05. Mở rộng ấy
 * lập tức tìm thêm hai chỗ chưa ai báo — một thẻ huy chương (1,024 ở bản tối)
 * và một Ô TÌM KIẾM (1,026 ở bản sáng), tức một ô nhập không có hình.
 *
 * Chỉ hình dạng `alpha(x, n)` được đánh giá, vì nó đọc được bằng một tra bảng
 * và một phép trộn. Biểu thức có nhánh thì luật KHÔNG đoán — đoán giá trị màu
 * sẽ sai ở đúng chỗ khó kiểm nhất.
 *
 * ── luật KHÔNG biết gì, và nó nói ra ──
 *
 * Một component không có `<Screen>` và cũng không tự khai nền ở gốc thì luật
 * không biết cái gì nằm sau nó, và nó KHÔNG đoán: đoán "chắc là trang" sẽ đẻ
 * ra báo động giả ở đúng những chỗ khó kiểm nhất. Những chỗ ấy được ĐẾM và KỂ
 * TÊN trong dòng xanh, chứ không lặng lẽ bỏ qua — một luật giấu vùng mù của
 * mình thì con số nó in ra không có nghĩa. Cũng vì thế "đã xét và đúng" được
 * đếm riêng khỏi "không thấy": bản đầu trộn hai cái và khai 20 chỗ mù trong
 * khi 8 chỗ trong đó đã được xét xong.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { NATIVE, hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const ts = createRequire(path.join(NATIVE, 'x.cjs'))('typescript');

const BAD = 'm.inset.bg';
const GOOD = 'm.onPage';

/* ── 0. tiền đề của luật, ĐỌC ra khỏi bảng màu chứ không gõ lại ───────────
   Nếu một ngày `inset.bg` của bản sáng thôi trùng nền trang thì luật này mất
   lý do tồn tại, và nó phải nói ra điều đó chứ không tiếp tục canh theo quán
   tính. */
const { palettes, materials } = loadPalette();
const comp = (v, ground) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v);
  if (!m) return hex(v);
  return overC(hex(toHex([+m[1], +m[2], +m[3]])), ground, m[4] === undefined ? 1 : +m[4]);
};
const step = {};
for (const t of ['light', 'dark']) {
  const page = hex(palettes[t].background);
  step[t] = {
    inset: ratio(comp(materials[t].inset.bg, page), page),
    onPage: ratio(comp(materials[t].onPage, page), page),
  };
}
const premise = [];
if (step.light.inset >= 1.02) {
  premise.push(
    `\`inset.bg\` của bản sáng nay cách trang ${step.light.inset.toFixed(3)}:1 — không còn trùng nền, ` +
      'nên tiền đề của luật này đã hết. Đọc lại chú thích rồi xoá hoặc viết lại nó, đừng để nó canh theo quán tính',
  );
}
for (const t of ['light', 'dark']) {
  if (step[t].onPage < 1.05) {
    premise.push(
      `\`${GOOD}\` của bản ${t} chỉ cách trang ${step[t].onPage.toFixed(3)}:1 — dưới bậc mà danh sách gom ` +
        'nhóm của iOS tạo ra (1,134:1), tức cái tên này không còn giải quyết được thứ nó sinh ra để giải quyết',
    );
  }
}

/* ── 1. đọc mọi tệp một lần ─────────────────────────────────────────────── */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx$/.test(f));

const parsed = new Map();
for (const rel of files) {
  const text = readFileSync(path.join(NATIVE, rel), 'utf8');
  parsed.set(rel, {
    rel,
    text,
    sf: ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    tables: new Map(),   // tên hằng bảng  → Map<tên style, {hasBg, bg, line}>
    hooks: new Map(),    // tên hook xuất  → tên hằng bảng
  });
}

const line = (f, node) => f.sf.getLineAndCharacterOfPosition(node.getStart(f.sf)).line + 1;
const txt = (f, node) => f.text.slice(node.getStart(f.sf), node.getEnd()).replace(/\s+/g, '');

/** Bảng style: object literal của `makeStyles((c,m)=>({…}))` hoặc `StyleSheet.create({…})`. */
function readTable(f, obj) {
  const out = new Map();
  out.file = f.rel;
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
    const name = p.name.getText(f.sf).replace(/['"]/g, '');
    let hasBg = false;
    let bg = null;
    for (const q of p.initializer.properties) {
      if (!ts.isPropertyAssignment(q)) continue;
      if (q.name.getText(f.sf).replace(/['"]/g, '') !== 'backgroundColor') continue;
      bg = txt(f, q.initializer);
      /*
        `'transparent'` KHÔNG phải một mặt.

        `hasBg` quyết định element ấy có che mất thứ phía sau hay không — tức
        con cháu nó có còn đứng trên TRANG nữa không. Một nền trong suốt không
        che gì cả.

        Bản đầu chỉ hỏi "có thuộc tính `backgroundColor` không" và trả giá ngay:
        `Animated.ScrollView` của màn Hôm nay khai `backgroundColor:
        'transparent'` — CỐ Ý, để `AmbientLight` phía sau không bị tô đè — nên
        luật coi nó là một mặt và MỌI THỨ trên màn ấy tụt xuống độ sâu 1. Cả
        màn hình biến mất khỏi tầm luật, và đó đúng là màn chứa lỗi được báo.
      */
      hasBg = !/^['"]transparent['"]$/.test(bg);
    }
    out.set(name, { hasBg, bg, line: line(f, p) });
  }
  return out;
}

/** Object literal mà một `makeStyles`/`StyleSheet.create` trả về, nếu có. */
function styleObjectOf(f, init) {
  if (!init || !ts.isCallExpression(init)) return null;
  const callee = init.expression.getText(f.sf);
  if (callee === 'StyleSheet.create') {
    const a = init.arguments[0];
    return a && ts.isObjectLiteralExpression(a) ? a : null;
  }
  if (callee !== 'makeStyles') return null;
  const a = init.arguments[0];
  if (!a || !ts.isArrowFunction(a)) return null;
  let body = a.body;
  if (ts.isParenthesizedExpression(body)) body = body.expression;
  return ts.isObjectLiteralExpression(body) ? body : null;
}

for (const f of parsed.values()) {
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name)) {
      const obj = styleObjectOf(f, n.initializer);
      if (obj) f.tables.set(n.name.text, readTable(f, obj));
    }
    /* `export function useFoodListStyles() { return foodListStylesFor(usePalette()); }` */
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      const r = n.body.statements.find((s) => ts.isReturnStatement(s));
      if (r?.expression && ts.isCallExpression(r.expression)) {
        const callee = r.expression.expression.getText(f.sf);
        if (f.tables.has(callee)) f.hooks.set(n.name.text, callee);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(f.sf);
}

/* Hook xuất khẩu → bảng thật, để một tệp khác gọi `useFoodListStyles()` vẫn
   tra được. Tên hook là duy nhất trong kho, nên một map phẳng là đủ. */
const exported = new Map();
for (const f of parsed.values()) {
  for (const [hook, tableName] of f.hooks) exported.set(hook, f.tables.get(tableName));
}

/* ── 2. những thành phần được coi là một MẶT ───────────────────────────────
   Danh sách này ngắn có chủ đích, và mỗi cái tên phải TỒN TẠI — một cái tên
   gõ sai ở đây làm luật tưởng mình đang đi qua một mặt và bỏ sót đúng thứ nó
   canh, mà không có gì báo. Luật tự kiểm ở dưới. */
const SURFACE_TAGS = ['GlassCard', 'LiquidGlass', 'Modal'];
for (const tag of SURFACE_TAGS) {
  const found = [...parsed.values()].some((f) => new RegExp(`(function|const)\\s+${tag}\\b`).test(f.text))
    || tag === 'Modal';
  if (!found) {
    premise.push(`\`${tag}\` nằm trong danh sách MẶT nhưng không có component nào tên thế — một cái tên gõ sai ở đây làm luật bỏ sót trong im lặng`);
  }
}

/* ── 3. đi cây ─────────────────────────────────────────────────────────── */
const problems = [];
const seen = new Set();     // "rel:styleName" đã phán xử
const pairs = new Set();    // cặp `X`/`XOnCard` dùng sai phía
/* Style đã được ĐI TỚI trong một cây, dù kết luận là đúng hay sai. Tách khỏi
   `seen` (chỉ chứa lỗi) vì nếu trộn hai cái thì "đã xét và đúng" bị đếm thành
   "không biết", và con số vùng mù in ra sẽ vô nghĩa — bản đầu của luật này
   đúng như vậy, và nó khai báo 20 chỗ mù trong khi 18 chỗ đã được xét. */
const reached = new Set();
const opaque = new Set();   // biểu thức màu luật không đánh giá được
const stepOK = new Set();   // lớp tô alpha trên trang, đo xong và đủ bậc
const onPageOK = [];

function tagName(el) {
  const o = ts.isJsxSelfClosingElement(el) ? el : el.openingElement;
  return o.tagName.getText();
}

/** Mọi `<alias>.<prop>` xuất hiện trong prop `style` của một element. */
function stylesOn(f, el, aliases) {
  const o = ts.isJsxSelfClosingElement(el) ? el : el.openingElement;
  const attr = o.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(f.sf) === 'style',
  );
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer)) return [];
  const hits = [];
  /* `cond` = style này đứng sau một điều kiện (`a && styles.x`, `c ? x : y`).
     Nó quyết định style nào là nền CÓ HIỆU LỰC — xem `effectiveBg`. */
  const walk = (n, cond) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const table = aliases.get(n.expression.text);
      const entry = table?.get(n.name.text);
      if (entry) hits.push({ alias: n.expression.text, prop: n.name.text, entry, table, cond });
    }
    const gate = cond
      || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      || ts.isConditionalExpression(n);
    ts.forEachChild(n, (ch) => walk(ch, gate));
  };
  walk(attr.initializer, false);
  return hits;
}

/** Component khai báo trong tệp → thân của nó, để đi vào tại chỗ gọi. */
function localComponents(f) {
  const out = new Map();
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) {
      out.set(n.name.text, n.body);
    }
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text)
      && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      out.set(n.name.text, n.initializer.body);
    }
    ts.forEachChild(n, visit);
  };
  visit(f.sf);
  return out;
}

/** Bí danh trong tệp: `const styles = stylesFor(c)`, `const foodList = useFoodListStyles()`. */
function aliasesOf(f) {
  const out = new Map();
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)
      && n.initializer && ts.isCallExpression(n.initializer)
    ) {
      const callee = n.initializer.expression.getText(f.sf);
      const table = f.tables.get(callee) ?? exported.get(callee);
      if (table) out.set(n.name.text, table);
    }
    ts.forEachChild(n, visit);
  };
  visit(f.sf);
  /* Bảng của chính tệp cũng tra được bằng tên hằng, cho chỗ dùng thẳng. */
  for (const [name, t] of f.tables) if (!out.has(name)) out.set(name, t);
  return out;
}

/**
 * Cặp `X` / `XOnCard`: cái tên ĐÃ ghi lại lựa chọn, nên luật đọc được nó.
 *
 * `food-cards.tsx` dựng `group` (trên trang, có mặt) và `groupOnCard` (trong
 * thẻ, không mặt) cùng một chú thích nói rõ chỗ nào dùng cái nào. Rồi hai chỗ
 * trong `nutrition.tsx` vẫn gọi `group` bên trong một `GlassCard` — nên trên
 * giấy có một khối lồng trong một thẻ, đúng thứ cặp tên ấy sinh ra để chặn.
 *
 * Quy ước hậu tố `OnCard` là thứ luật kiểm được mà không phải biết tên riêng
 * của style nào: có cặp thì `X` phải ở độ sâu 0 và `XOnCard` phải ở độ sâu >0.
 */
function judgePair(f, hit, depth, at) {
  const table = hit.table;
  const base = hit.prop.replace(/OnCard$/, '');
  if (!table.has(base) || !table.has(`${base}OnCard`)) return;
  const onCard = hit.prop.endsWith('OnCard');
  if (onCard === (depth > 0)) return;
  pairs.add(`${f.rel}:${hit.alias}.${hit.prop}`);
  problems.push(
    onCard
      ? `${f.rel}:${at} dùng \`${hit.alias}.${hit.prop}\` ở độ sâu 0 — cái hậu tố nói nó dành cho chỗ ` +
        `nằm TRONG một thẻ, mà đây là trên trang. Vế kia là \`${hit.alias}.${base}\``
      : `${f.rel}:${at} dùng \`${hit.alias}.${hit.prop}\` bên TRONG một mặt — vế ấy tự mang mặt của ` +
        `riêng nó, nên ở đây thành một khối lồng trong một thẻ. Vế kia là \`${hit.alias}.${base}OnCard\`, ` +
        'dựng ra đúng cho chỗ này và kèm chú thích nói vì sao',
  );
}

/**
 * Lớp tô `alpha(token, α)` trên trang phải TẠO RA một bậc.
 *
 * ── vì sao luật này phải rộng hơn một cái tên ──
 *
 * Vế trên chỉ hỏi "có phải `m.inset.bg` không". Nút "Đồng bộ Apple Health" ở
 * màn Hôm nay chìm hẳn vào nền mà vẫn đi qua, vì nó tô bằng một biểu thức
 * KHÁC: `alpha(c.secondary, 0.2)`, viền `alpha(c.border, 0.3)`. Đo trên trang:
 * nền **1,018:1**, viền **1,084:1**, ở cả hai diện mạo. Cùng triệu chứng, khác
 * token — và chủ dự án lại là người tìm ra.
 *
 * Nên cái được canh không còn là một cái tên mà là một PHÉP ĐO: composite biểu
 * thức ấy lên trang rồi hỏi nó có tách ra khỏi trang không.
 *
 * ── vì sao chỉ hình dạng `alpha(x, n)` ──
 *
 * Nó đánh giá được mà không cần một trình thông dịch: một tra bảng màu và một
 * phép trộn. Biểu thức có nhánh (`m.lit ? a : b`) hay gọi hàm khác thì luật
 * KHÔNG đoán — chúng được đếm vào phần "không đánh giá được" của dòng xanh, vì
 * một luật đoán giá trị màu sẽ sai ở đúng chỗ khó kiểm nhất.
 *
 * ── sàn 1,05 ──
 *
 * Không phải một con số tròn chọn bừa. `m.onPage` — vai dựng ra cho đúng việc
 * này — cho 1,097 trên giấy và 1,113 trong tối, và bậc mà danh sách gom nhóm
 * của iOS tạo ra là 1,134. 1,05 nằm dưới cả ba với chỗ dư, nên nó bắt cái
 * KHÔNG CÓ BẬC (1,018) chứ không ép mọi mặt phải bằng `onPage`.
 */
const ALPHA_FLOOR = 1.05;
const tokenOf = (t, name) => {
  const [ns, key] = name.split('.');
  if (ns === 'c') return palettes[t][key];
  if (ns === 'm') return key === 'ink' ? materials[t].ink : materials[t][key];
  return null;
};

function judgeAlphaFill(f, hit, depth, at) {
  if (depth > 0) return 'trong-mặt';
  const m = /^alpha\((c|m)\.(\w+),([\d.]+)\)$/.exec(hit.entry.bg ?? '');
  if (!m) return 'không-đánh-giá-được';
  const raw = tokenOf('light', `${m[1]}.${m[2]}`);
  if (!raw) return 'không-đánh-giá-được';
  const a = Number(m[3]);
  for (const t of ['light', 'dark']) {
    const page = hex(palettes[t].background);
    const tok = tokenOf(t, `${m[1]}.${m[2]}`);
    const step = ratio(comp(String(tok), page) && overC(hex(String(tok)), page, a), page);
    if (step >= ALPHA_FLOOR) continue;
    problems.push(
      `${f.rel}:${at} style \`${hit.alias}.${hit.prop}\` tô nền bằng \`${hit.entry.bg}\` trên TRANG — ` +
        `composite ra ${step.toFixed(3)}:1 so với trang ở bản ${t}. Đó không phải một mặt kín đáo, đó là ` +
        'KHÔNG CÓ MẶT: một hàng chữ trôi trên nền. Đúng hình dạng của nút "Đồng bộ Apple Health", thứ ' +
        `chủ dự án khoanh đỏ. Dùng \`${GOOD}\` (1,097 giấy / 1,113 tối), hoặc mượn vật liệu mà hàng chip ` +
        'cạnh nó đã dùng — `LiquidGlass` blur với mép `alpha(m.ink, 0.22)`, đo ra 1,589 / 1,883',
    );
    return 'đỏ';
  }
  return 'đủ-bậc';
}

function judge(f, hit, depth, at, drawsBg) {
  judgePair(f, hit, depth, at);
  const key = `${f.rel}:${hit.alias}.${hit.prop}`;
  reached.add(`${hit.table.file}:${hit.prop}`);
  if (seen.has(key)) return;
  if (hit.entry.bg !== BAD) {
    if (hit.entry.bg === GOOD) onPageOK.push(key);
    else if (hit.entry.hasBg && drawsBg && !seen.has(key)) {
      const verdict = judgeAlphaFill(f, hit, depth, at);
      if (verdict === 'đỏ') seen.add(key);
      else if (verdict === 'không-đánh-giá-được') opaque.add(key);
      else if (verdict === 'đủ-bậc') stepOK.add(key);
    }
    return;
  }
  if (depth > 0) return;     // có một mặt ở sau — `inset` đúng việc của nó
  seen.add(key);
  problems.push(
    `${f.rel}:${at} style \`${hit.alias}.${hit.prop}\` tô nền bằng \`${BAD}\` nhưng nó nằm THẲNG TRÊN ` +
      'TRANG — không có mặt nào giữa nó và `<Screen>`. `inset.bg` là mặt của một chỗ LÕM, và trên giấy ' +
      `nó được định nghĩa đúng bằng \`background\`, nên khối này ra ${step.light.inset.toFixed(3)}:1 so ` +
      `với trang: không có gì cả. Bản tối tình cờ đúng (${step.dark.inset.toFixed(3)}:1), nên lỗi chỉ ` +
      `hiện ở một diện mạo. Dùng \`${GOOD}\` — cùng bậc ở cả hai (` +
      `${step.light.onPage.toFixed(3)} · ${step.dark.onPage.toFixed(3)}), ngang bậc mà danh sách gom ` +
      'nhóm của iOS tạo ra',
  );
}

function walkJsx(f, node, depth, aliases, comps, stack) {
  if (!node) return;
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = tagName(node);
    const hits = stylesOn(f, node, aliases);
    /*
      React Native GHÉP mảng style và cái sau thắng, nên chỉ MỘT trong các
      style ấy thật sự vẽ ra nền. Bản đầu xét từng cái rời và báo động giả
      ngay: `[styles.squareBtn, styles.squareBtnActive]` — nền của cái đầu
      không bao giờ hiện vì cái sau luôn đè lên, mà luật vẫn đo cái đầu.

      "Không điều kiện cuối cùng" là cái đúng để đo: một style đứng sau `&&`
      hay `?:` có thể vắng mặt, nên nó không thay được nền cơ sở — còn nền cơ
      sở thì luôn vẽ.
    */
    const at = line(f, node);
    const effective = [...hits].reverse().find((h) => h.entry.hasBg && !h.cond);
    for (const h of hits) judge(f, h, depth, at, h === effective || !effective);
    const isSurface = SURFACE_TAGS.includes(tag) || hits.some((h) => h.entry.hasBg);
    const next = depth + (isSurface ? 1 : 0);

    /* Component con của chính tệp này: nó vẽ ra TẠI ĐÂY, nên mang theo `next`. */
    const body = comps.get(tag);
    if (body && !stack.includes(tag)) {
      walkJsx(f, body, next, aliases, comps, [...stack, tag]);
    }
    if (ts.isJsxElement(node)) {
      for (const ch of node.children) walkJsx(f, ch, next, aliases, comps, stack);
    }
    /* Một element cũng có thể mang JSX trong prop (`ListHeaderComponent`…). */
    const o = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
    for (const a of o.attributes.properties) {
      if (ts.isJsxAttribute(a) && a.initializer && ts.isJsxExpression(a.initializer)) {
        ts.forEachChild(a.initializer, (ch) => walkJsx(f, ch, next, aliases, comps, stack));
      }
    }
    return;
  }
  ts.forEachChild(node, (ch) => walkJsx(f, ch, depth, aliases, comps, stack));
}

/**
 * Hai cái gốc mà luật biết mình đang đứng ở đâu.
 *
 *   `<Screen>`          — trang. Độ sâu 0.
 *   gốc của một SHEET   — `<KeyboardAvoidingView style={styles.root}>` với một
 *                         `backgroundColor` tự khai. Ba sheet ghi buổi tập /
 *                         ghi bữa / dựng buổi tập đều là `c.card`, tức một mặt
 *                         TRẮNG: `inset.bg` trên đó là chỗ lõm đúng nghĩa, độ
 *                         sâu 1. Nhưng một sheet tô `c.background` thì lại
 *                         chính là trang, và một khối `inset.bg` trên nó sẽ vô
 *                         hình y như ở tab Tập luyện — nên phân nhánh theo
 *                         GIÁ TRỊ, không theo tên component.
 *
 * Gốc không khai nền thì luật KHÔNG đoán: nó không biết cái gì ở sau, và đoán
 * "chắc là trang" sẽ đẻ ra báo động giả ở đúng những chỗ khó kiểm nhất. Chỗ ấy
 * đi vào vùng mù và được kể tên.
 */
const PAGE_BG = ['c.background', 'colors.background'];
let screens = 0;
let sheets = 0;
for (const f of parsed.values()) {
  const aliases = aliasesOf(f);
  const comps = localComponents(f);
  let hitScreen = false;
  const visit = (n) => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && tagName(n) === 'Screen') {
      hitScreen = true;
      walkJsx(f, n, 0, aliases, comps, []);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(f.sf);
  if (hitScreen) { screens++; continue; }

  /* Không có `<Screen>` — thử cái gốc mà default export trả về. */
  const root = defaultExportRoot(f, comps);
  if (!root) continue;
  const hits = stylesOn(f, root, aliases);
  const bg = hits.map((h) => h.entry.bg).find((b) => b);
  if (!bg) continue;                       // gốc không khai nền → không đoán
  sheets++;
  /* Đi vào CON của gốc, không đi vào chính gốc.
     Nền của gốc đã được tính một lần rồi — nó CHÍNH LÀ cái đất mà `startDepth`
     nói ra. Truyền cả element gốc vào `walkJsx` thì nó thấy `backgroundColor`
     ở đó và cộng thêm một mặt nữa, nên mọi thứ trong sheet tụt xuống độ sâu 1
     và không gì bị bắt. Bản đầu đúng như vậy: phép thử ngược [6] — đổi nền gốc
     của `workout-builder` thành `c.background` — lẽ ra phải đỏ ba chỗ mà im
     lặng hoàn toàn. Đó là lý do phép thử ngược tồn tại. */
  const startDepth = PAGE_BG.includes(bg) ? 0 : 1;
  if (ts.isJsxElement(root)) {
    for (const ch of root.children) walkJsx(f, ch, startDepth, aliases, comps, []);
  }
}

/** Element JSX ngoài cùng mà `export default` của tệp trả về, nếu đọc được. */
function defaultExportRoot(f, comps) {
  let name = null;
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name
      && n.modifiers?.some((x) => x.kind === ts.SyntaxKind.DefaultKeyword)) name = n.name.text;
    if (ts.isExportAssignment(n) && ts.isIdentifier(n.expression)) name = n.expression.text;
    ts.forEachChild(n, visit);
  };
  visit(f.sf);
  const body = comps.get(name);
  if (!body) return null;

  /*
    Thứ được TRẢ VỀ, không phải JSX đầu tiên gặp trong thân hàm.

    Bản đầu quét cả thân và lấy element đầu tiên. Phép thử ngược lộ ra ngay:
    `TodayScreen` dài hơn nghìn dòng và dựng nhiều mảnh JSX vào biến trước khi
    `return`, nên cái "gốc" luật nhặt được là một mảnh giữa bài — không khai
    nền, nên luật kết luận "không biết màn này đứng trên gì" và bỏ qua cả màn.
    Mà đó đúng là màn chứa lỗi được báo.

    `return` ở cấp cao nhất của thân hàm là chỗ duy nhất trả lời đúng câu hỏi
    "cái gì nằm dưới cùng mọi thứ trên màn này".
  */
  const stmts = ts.isBlock(body) ? body.statements : null;
  const ret = stmts?.find((st) => ts.isReturnStatement(st));
  const from = ret?.expression ?? body;
  let root = null;
  const find = (n) => {
    if (root) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) { root = n; return; }
    ts.forEachChild(n, find);
  };
  find(from);
  return root;
}

/* ── 4. vùng mù, kể tên chứ không giấu ─────────────────────────────────── */
const unproven = [];
for (const f of parsed.values()) {
  for (const [tableName, table] of f.tables) {
    for (const [prop, e] of table) {
      if (e.bg !== BAD) continue;
      if (reached.has(`${f.rel}:${prop}`)) continue;
      unproven.push(`${f.rel}:${e.line} ${tableName}.${prop}`);
    }
  }
}

if (premise.length || problems.length) {
  console.error('khối trên trang lấy mặt của một chỗ lõm:');
  for (const p of premise) console.error(`  ✗ [tiền đề] ${p}`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `mặt trên trang OK — đi cây JSX của ${screens} màn có \`<Screen>\` và ${sheets} sheet tự khai nền ` +
    'bằng trình biên dịch TypeScript ' +
    `thật, đếm số MẶT giữa mỗi element và trang: không style nào tô \`${BAD}\` ở độ sâu 0 ` +
    `(${onPageOK.length} chỗ dùng \`${GOOD}\`). Đây là chỗ mà bốn luật màu có sẵn đều không có thẩm ` +
    'quyền: lỗi không nằm TRONG style — cùng một dòng ấy là đúng trong một thẻ và sai trên trang — nên ' +
    'phải đọc chỗ style được TREO LÊN, không đọc bảng giá trị. Tiền đề cũng được kiểm: `inset.bg` bản ' +
    `sáng vẫn trùng nền trang (${step.light.inset.toFixed(3)}:1), nếu hết trùng thì luật tự đỏ. ` +
    `Vùng mù: ${unproven.length} style tô \`${BAD}\` mà luật không thấy được treo ở đâu` +
    (unproven.length ? ` — ${unproven.join(', ')}` : ''),
);
