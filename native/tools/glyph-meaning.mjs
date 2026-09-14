/**
 * Một hình icon = một nghĩa, trong phạm vi một màn hình.
 *
 * ── lỗi đã sửa ──
 *
 * Chủ dự án khoanh đỏ hai chỗ trên tab Tiến trình: "bị trùng lặp chữ cùng một
 * chức năng và trùng icon".
 *
 *   ◎ Cân nặng mục tiêu        Đặt cân nặng mục tiêu  ›   → mở hộp thoại
 *   ◎ Hiệu chỉnh mục tiêu      ...                    ›   → /smart-goals
 *
 * Hai cửa đi hai nơi khác hẳn nhau mà mang CÙNG một bia ngắm. Tệp ấy đã có
 * sẵn một đoạn chú thích dài nói đúng chuyện này — `Target` được vẽ ở ba chỗ
 * với ba màu — nhưng bản sửa lần trước chỉ đổi MÀU và giữ nguyên HÌNH. Màu
 * nhạt đi không gỡ được, vì hình mới là thứ người ta nhận ra trước.
 *
 * Và cái hàng trên còn tự nhắc lại chính nó: nhãn "Cân nặng mục tiêu", giá
 * trị "Đặt cân nặng mục tiêu". Gần nửa bề ngang hàng dùng để nói lại cái vừa
 * nói, ở đúng chỗ đáng lẽ phải là con số.
 *
 * ── phạm vi được ĐO trước khi chọn luật ──
 *
 * Luật "một tệp không được vẽ một icon hai lần" là luật SAI: 21 tệp vẽ lặp, và
 * gần hết là đúng — `ChevronRight` năm lần trong Cài đặt là đồ nội thất,
 * `Coins` năm lần trong phòng linh vật là cùng MỘT nghĩa vẽ nhiều chỗ, `Moon`
 * hai lần vẫn là giấc ngủ. Lặp không phải lỗi; lặp với HAI NGHĨA mới là lỗi.
 *
 * Nên luật hỏi đúng câu đó: trong một màn, một hình có dẫn tới hai NƠI khác
 * nhau không. Đo trên toàn app sau bản sửa: 0 vi phạm. Dựng lại lỗi cũ: đúng
 * 1, đúng tệp, đúng hai đích. Không một chỗ nào bị kêu oan.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(NATIVE, 'x.cjs'))('typescript');

/*
  Đồ nội thất: những hình KHÔNG gọi tên một chủ đề nào. Mũi tên cuối hàng, dấu
  đóng, dấu ba chấm — chúng nói "bấm được" chứ không nói "về cái gì", nên lặp
  bao nhiêu lần cũng đúng và không bao giờ là hai nghĩa.
*/
const FURNITURE = new Set([
  'ChevronRight', 'ChevronLeft', 'ChevronDown', 'ChevronUp',
  'X', 'MoreHorizontal', 'MoreVertical', 'ArrowLeft', 'ArrowRight',
]);
const TAPS = new Set(['PressScale', 'Pressable', 'TouchableOpacity', 'TouchableHighlight']);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})(path.join(NATIVE, 'src'));

const problems = [];
let scanned = 0;
let doors = 0;

for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  scanned++;
  const rows = [];
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = (n.tagName ?? n.openingElement?.tagName)?.getText();
      if (tag && TAPS.has(tag)) {
        const text = n.getText();
        const glyphs = [...text.matchAll(/icon=\{([A-Z][A-Za-z0-9]*)\}/g)]
          .map((m) => m[1])
          .filter((g) => !FURNITURE.has(g));
        /*
          "Nơi" là route nếu có, còn không thì tên hàm mở tấm/hộp thoại. Một
          hộp thoại cũng là một đích: người dùng không phân biệt "đi màn khác"
          với "mở tấm khác", họ chỉ biết hai cửa này dẫn tới hai thứ.
        */
        const nav = text.match(/nav\.push\(\s*'([^']+)'/) ?? text.match(/pathname:\s*'([^']+)'/);
        const set = text.match(/\b(set[A-Z][A-Za-z0-9]*)\(/);
        const dest = nav ? nav[1] : set ? set[1] : null;
        if (dest) for (const g of glyphs) rows.push({ glyph: g, dest });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  doors += rows.length;

  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.glyph)) by.set(r.glyph, new Set());
    by.get(r.glyph).add(r.dest);
  }
  for (const [g, dests] of by) {
    if (dests.size > 1) {
      problems.push(
        `${path.relative(NATIVE, f)}: hình \`${g}\` dẫn tới ${dests.size} nơi khác nhau (${[...dests].join(' , ')}) — hai cửa cùng một hình đọc ra là một cửa vẽ hai lần`,
      );
    }
  }
}

/* Tự soi: quét trượt thì luật này xanh vĩnh viễn mà không ai biết. */
if (doors < 20) {
  problems.push(`chỉ thấy ${doors} cửa có hình trong ${scanned} tệp — bộ quét hỏng chứ không phải app sạch`);
}

/*
  Nửa thứ hai của cùng một lời phàn nàn: giá trị của một hàng không được nhắc
  lại nhãn của chính hàng ấy.

  Luật này CỐ Ý hẹp, chỉ canh đúng hàng đã sai. Phép đo chung — "chuỗi này
  chứa chuỗi kia trong cùng một khối" — cho 2 kết quả trên toàn app và cả hai
  đều ĐÚNG: "Nghỉ ngơi" + "Nghỉ ngơi hoặc vận động nhẹ" là tiêu đề và câu diễn
  giải, không phải nhãn và giá trị. Một luật kêu oan là một luật bị tắt, nên
  nó không được mở rộng ra khỏi hình dạng nhãn-và-giá-trị.
*/
const strings = readFileSync(path.join(NATIVE, 'src/lib/native-strings.ts'), 'utf8');
const val = (k) => [...strings.matchAll(new RegExp(`\\n  ${k}: '([^']*)'`, 'g'))].map((m) => m[1]);
const titles = val('nWeightGoalTitle');
const unset = val('nWeightGoalUnset');
if (titles.length !== 2 || unset.length !== 2) {
  problems.push(
    `nWeightGoalTitle/nWeightGoalUnset không đủ hai bản dịch (${titles.length}/${unset.length})`,
  );
} else {
  for (let i = 0; i < 2; i++) {
    if (unset[i].toLowerCase().includes(titles[i].toLowerCase())) {
      problems.push(
        `hàng cân nặng mục tiêu: chỗ trống ghi "${unset[i]}" trong khi nhãn đã là "${titles[i]}" — giá trị đang nói lại cái nhãn vừa nói`,
      );
    }
  }
}
const progress = readFileSync(path.join(NATIVE, 'src/app/(tabs)/progress.tsx'), 'utf8');
if (!/i18n\.nWeightGoalUnset/.test(progress)) {
  problems.push('progress: hàng cân nặng mục tiêu không còn dùng nWeightGoalUnset cho chỗ trống');
}

if (problems.length) {
  console.error('icon và chữ trùng nghĩa:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `icon một nghĩa OK — ${doors} cửa có hình trong ${scanned} tệp, không hình nào dẫn tới hai nơi. Luật hỏi HAI NGHĨA chứ không hỏi lặp: 21 tệp vẽ lặp icon và gần hết là đúng (ChevronRight ×5 là nội thất, Coins ×5 là một nghĩa vẽ nhiều chỗ), nên "cấm lặp" sẽ kêu oan 20 lần. Kèm hàng cân nặng mục tiêu: chỗ trống không được nhắc lại nhãn`,
);
