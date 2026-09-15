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
  ── và cái mà luật trên KHÔNG thấy ──

  Chủ dự án chụp tiếp màn Hôm nay: huy hiệu mục "Thể lực" mang cái tạ, rồi
  cách một thẻ là hàng buổi tập gần nhất cũng mang cái tạ. Luật "một hình hai
  NƠI" ở trên xanh trơn — vì huy hiệu mục không phải một cửa, nó không dẫn đi
  đâu cả, nên nó không nằm trong tập mà luật ấy quét.

  Đây là lần thứ HAI cho đúng cặp icon ấy. Lần trước chúng khác MÀU (cam ở huy
  hiệu, xanh ở hàng) và bản sửa cho chúng CÙNG màu — tức làm chúng giống nhau
  hơn. Chú thích ngay chỗ `GROUP_ICONS` đã ghi lại lần ấy, và còn viết sẵn câu
  kết luận đúng: "Nếu hai nhóm ra cùng một màu thì đó là tín hiệu đổi ICON".

  Nên luật thứ hai hỏi quan hệ CHỨA, không hỏi quan hệ ngang hàng: một widget
  không được vẽ lại chính cái hình của mục chứa nó. Huy hiệu đặt tên cho mục;
  một thẻ bên trong vẽ lại cái tên ấy là nói hai lần, và nó luôn nói ở ngay
  dưới lần thứ nhất.

  Bản đồ đi từ dữ liệu thật, không gõ tay: nhóm và danh sách widget đọc từ
  `use-widget-config.ts`, emoji → hình đọc từ bảng `GROUP_ICONS`, widget →
  component đọc từ chính câu `switch` dựng thẻ, rồi component → tệp theo dòng
  import. Gõ tay bản đồ này là để nó lệch khỏi app ở lần thêm widget kế tiếp.

  Đo trên toàn app: 2 vi phạm — cái được báo, và MỘT cái nữa chưa ai thấy.
*/
const ALLOW = {
  /*
    `Sparkles` trong thẻ Gợi ý thông minh là ký hiệu AI của app, dùng thống
    nhất ở `ai-meal-suggest` và ở đây. Huy hiệu mục "Phân tích" cũng là ✨, nên
    chúng đụng nhau — nhưng CẢ HAI cách sửa đều đắt hơn cái lỗi:

      · đổi hình của thẻ → app mất ký hiệu AI đã dạy người dùng ở ba chỗ
      · đổi hình của mục → emoji nhóm nằm trong bố cục ĐÃ LƯU của từng người
        (`withNewWidgets` giữ nguyên `stored.groups`), nên sửa DEFAULT_CONFIG
        không tới được máy ai đang dùng; muốn tới phải di trú dữ liệu bố cục,
        cho một việc thuần hình thức

    Nên nó được ghi tên ở đây thay vì bị bỏ qua im lặng: dòng xanh in nó ra
    mỗi lần chạy, và nếu bố cục có ngày di trú vì lý do khác thì đây là chỗ
    nhắc rằng ✨ nên đi cùng.
  */
  'insights:ai-tips': 'Sparkles = AI, dùng chung với ai-meal-suggest; đổi bên nào cũng đắt hơn lỗi',
};

{
  const cfg = readFileSync(path.join(NATIVE, 'src/hooks/use-widget-config.ts'), 'utf8');
  const idxPath = path.join(NATIVE, 'src/app/(tabs)/index.tsx');
  const idx = readFileSync(idxPath, 'utf8');

  const groups = [...cfg.matchAll(/id: '([a-z-]+)',[\s\S]*?icon: '([^']+)',[\s\S]*?widgets: \[([^\]]*)\]/g)].map((m) => ({
    id: m[1],
    emoji: m[2],
    widgets: m[3].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean),
  }));
  const glyphOf = Object.fromEntries(
    [...idx.matchAll(/'([^']+)': \{ icon: ([A-Za-z]+),/g)].map((m) => [m[1], m[2]]),
  );
  const widgetComp = Object.fromEntries(
    [...idx.matchAll(/case '([a-z-]+)':\s*\n\s*return <([A-Z][A-Za-z]*)/g)].map((m) => [m[1], m[2]]),
  );
  const importOf = {};
  for (const m of idx.matchAll(/import \{([^}]*)\} from '(@\/[^']+)'/g)) {
    for (const n of m[1].split(',').map((x) => x.trim().split(' as ').pop()).filter(Boolean)) {
      importOf[n] = m[2];
    }
  }
  const fileOf = (spec) => {
    for (const ext of ['.tsx', '.ts']) {
      const f = path.join(NATIVE, spec.replace('@/', 'src/') + ext);
      try {
        readFileSync(f);
        return f;
      } catch {}
    }
    return null;
  };

  let checked = 0;
  const allowed = [];
  for (const g of groups) {
    const glyph = glyphOf[g.emoji];
    if (!glyph) continue;
    for (const w of g.widgets) {
      const comp = widgetComp[w];
      const file = comp && importOf[comp] ? fileOf(importOf[comp]) : null;
      if (!file) continue;
      const src = readFileSync(file, 'utf8');
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let body = null;
      const seek = (n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.getText() === comp) body = n.getText();
        ts.forEachChild(n, seek);
      };
      seek(sf);
      if (!body) continue;
      checked++;
      if (!new RegExp(`icon=\\{${glyph}\\}`).test(body)) continue;
      const key = `${g.id}:${w}`;
      if (ALLOW[key]) {
        allowed.push(`${key} (${ALLOW[key]})`);
        continue;
      }
      problems.push(
        `${comp} vẽ lại \`${glyph}\` — chính hình của mục "${g.id}" chứa nó; huy hiệu mục đã đặt tên rồi, thẻ bên trong nói lại là nói hai lần ngay dưới lần thứ nhất`,
      );
    }
  }
  /* Tự soi: bản đồ đi qua bốn phép nối, và bất kỳ phép nào trượt cũng làm luật
     này xanh mà không kiểm gì. */
  if (checked < 5) {
    problems.push(`chỉ nối được ${checked} widget với mục của nó — bản đồ hỏng chứ không phải app sạch`);
  }
  globalThis.__glyphAllowed = allowed;
  globalThis.__glyphChecked = checked;
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

/* ── một khái niệm = MỘT hình, trên toàn app ──

   Luật trên hỏi "một hình có hai nghĩa không". Luật này hỏi chiều ngược lại, và
   nó có vì cân nặng đã trượt HAI lần ở đúng chỗ ấy:

     `Scale`   cán cân CÔNG LÝ, hai đĩa treo trên đòn cân — nghĩa là so sánh
     `Weight`  quả cân hình thang có quai — quả cân CỦA cái cân đòn

   Cả hai đều không phải cái cân người ta bước lên, và mỗi lần sửa thì chỗ này
   đổi còn chỗ khác ở lại, nên app từng vẽ cân nặng bằng hai hình cùng lúc. Bản
   thứ ba là `BodyScale` ở `constants/app-icons.ts`, hình app tự vẽ.

   Luật đơn giản nhất giữ được kết quả ấy là CẤM hai cái tên cũ quay lại từ
   lucide: khi chúng không nhập được nữa thì chỉ còn một hình cho khái niệm này,
   và chỗ dùng thứ tư mọc ra ngày mai không lặng lẽ lệch được. */
{
  const banned = ['Scale', 'Weight'];
  /* `\b` hai đầu để không dính `WeightEntry`, `fontWeight`, `displayWeight`. */
  const inImport = (src, name) =>
    [...src.matchAll(/import \{([\s\S]*?)\} from 'lucide-react-native';/g)].some((m) =>
      new RegExp(`(^|[,\\s])${name}\\s*(,|$)`, 'm').test(m[1]),
    );

  /* tiền đề được CHẠY: phép dò phải phân biệt được `Weight` với `WeightEntry` */
  if (!inImport("import { Moon, Weight } from 'lucide-react-native';", 'Weight')) {
    problems.push('tự kiểm hỏng — không thấy `Weight` trong một import có nó');
  }
  if (inImport("import { WeightEntry } from 'lucide-react-native';", 'Weight')) {
    problems.push('tự kiểm hỏng — nhận nhầm `WeightEntry` thành `Weight`');
  }

  let users = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (/BodyScale/.test(src)) users++;
    for (const name of banned) {
      if (inImport(src, name)) {
        problems.push(
          `${path.relative(NATIVE, file)}: nhập \`${name}\` từ lucide. Cân nặng của app là ` +
            '`BodyScale` ở `constants/app-icons.ts` — `Scale` là cán cân công lý và `Weight` là quả ' +
            'cân của cân đòn; cả hai đã bị chủ dự án khoanh và thay',
        );
      }
    }
  }
  globalThis.__oneGlyphUsers = users;
}

if (problems.length) {
  console.error('icon và chữ trùng nghĩa:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `icon một nghĩa OK — ${doors} cửa có hình trong ${scanned} tệp, không hình nào dẫn tới hai nơi. Luật hỏi HAI NGHĨA chứ không hỏi lặp: 21 tệp vẽ lặp icon và gần hết là đúng (ChevronRight ×5 là nội thất, Coins ×5 là một nghĩa vẽ nhiều chỗ), nên "cấm lặp" sẽ kêu oan 20 lần. Kèm luật CHỨA: ${globalThis.__glyphChecked} widget không được vẽ lại hình của mục chứa nó${globalThis.__glyphAllowed.length ? ` (miễn có lý do: ${globalThis.__glyphAllowed.join('; ')})` : ''}. Và hàng cân nặng mục tiêu: chỗ trống không được nhắc lại nhãn. Kèm luật NGƯỢC LẠI — một khái niệm một hình: lucide Scale và Weight không nhập lại được, nên ${globalThis.__oneGlyphUsers} tệp vẽ cân nặng đều vẽ cùng BodyScale, thay vì mỗi lần sửa lại bỏ sót một chỗ như hai lần trước`,
);
