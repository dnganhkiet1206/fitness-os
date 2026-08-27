/**
 * Lối vào chế độ sắp xếp: đúng MỘT, và neo vào VỊ TRÍ chứ không vào một mục.
 *
 * ── điều người dùng yêu cầu, nói bằng chữ của họ ──
 *
 * *"cho dù người dùng có chỉnh bất cứ thẻ nào nó vẫn nằm ở đây"*. Đó là một
 * ràng buộc thật và nó có một cách hỏng cụ thể: neo cái nút vào mục Sức khoẻ
 * (`group.id === 'health'`) thì hôm nào người dùng xoá hoặc đổi thứ tự mục ấy,
 * nút Sửa biến mất khỏi dashboard — và lúc đó KHÔNG còn đường nào vào chế độ
 * sắp xếp, vì nó vừa được dời khỏi góc trên. Người dùng mất luôn khả năng sắp
 * xếp lại, không kèm một lỗi nào.
 *
 * Nên luật đòi cái cổng là VỊ TRÍ (`gi === 0`), và cấm nó đọc bất cứ thứ gì
 * thuộc về danh tính của mục.
 *
 * ── và đúng một lối vào ──
 *
 * Một nút cho mỗi mục là bốn nút Sửa làm cùng một việc trên một màn hình. Còn
 * để sót bản cũ ở góc trên thì có hai nút giống nhau ở hai chỗ xa nhau, và cái
 * ở góc trên chỉ hiện ra khi cuộn về đỉnh.
 *
 * ── Cài đặt ──
 *
 * Avatar từng mang hai việc, vì nút Sửa nấp sau nó. Nút ấy đi rồi thì việc thứ
 * nhất không còn gì để làm, và một cú chạm thừa đứng chắn trước màn hình DUY
 * NHẤT không có lối vào nào khác — `app-tabs.tsx` chỉ dựng bốn Trigger. Luật
 * giữ cả hai vế đó, và giữ luôn lời cảnh báo về câu chú thích cũ từng nói
 * ngược lại.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const TODAY = 'src/app/(tabs)/index.tsx';
const TABS_IMPL = 'src/components/app-tabs.tsx';
const CONFIG = 'src/hooks/use-widget-config.ts';

/** Đọc biểu thức quyết định mục nào được nút Sửa. */
function gate(src) {
  const m = /action=\{\s*([\s\S]*?)\s*\?\s*\(/.exec(src);
  return m ? m[1] : null;
}

function judge(today) {
  const bad = [];

  /* ── 1. cổng là VỊ TRÍ, không phải danh tính của mục ──────────────────── */
  const g = gate(today);
  if (g === null) {
    bad.push('không đọc được cổng của nút Sửa — nó không còn nằm trên hàng tiêu đề mục nào');
  } else {
    if (!/^\w+ === 0$/.test(g)) {
      bad.push(
        `cổng của nút Sửa là \`${g}\` chứ không phải một phép so VỊ TRÍ — người dùng có quyền xoá, đổi tên ` +
          'và đổi thứ tự mục, nên neo vào một mục cụ thể là neo vào thứ họ làm biến mất được, và hôm đó ' +
          'không còn đường nào vào chế độ sắp xếp',
      );
    }
    if (/group\b|\.id\b|title/.test(g)) {
      bad.push(`cổng của nút Sửa đọc thuộc tính của mục (\`${g}\`) — nó phải chỉ đọc chỉ số vị trí`);
    }
  }

  /* ── 2. đúng MỘT lối vào ──────────────────────────────────────────────── */
  const entries = [...today.matchAll(/toggleEdit\(true\)/g)].length;
  if (entries !== 1) {
    bad.push(
      `có ${entries} chỗ bật chế độ sắp xếp, phải đúng 1 — hai nút giống nhau ở hai chỗ xa nhau (một trong ` +
        'số đó chỉ hiện khi cuộn về đỉnh) là hai lời mời cho cùng một việc',
    );
  }
  if (/<EditLayoutButton/.test(today.slice(today.indexOf('styles.headerButtons')))) {
    bad.push('nút Sửa vẫn còn ở hàng nút góc trên — nó đã được dời xuống hàng tiêu đề mục');
  }

  /* ── 3. nhãn HIỆN ngắn, tách khỏi nhãn cho trình đọc màn hình ─────────── */
  /*
    `a11yEditLayout` là "Sắp xếp lại bảng điều khiển" — đúng cho tai, quá dài
    cho một hàng tiêu đề. Ngược lại, để trình đọc màn hình chỉ nghe "Sửa" là bỏ
    rơi nó: nó đọc từng phần tử rời nhau, không thấy tiêu đề mục bên trái.
  */
  if (!/label=\{i18n\.editLayout\}/.test(today) || !/a11yLabel=\{i18n\.a11yEditLayout\}/.test(today)) {
    bad.push(
      'nút Sửa không tách nhãn hiện khỏi nhãn trợ năng — mắt thấy cả tiêu đề mục bên trái nên "Sửa" là đủ, ' +
        'còn trình đọc màn hình đọc từng phần tử rời nhau nên nó cần câu đầy đủ',
    );
  }

  /* ── 4. vùng chạm vẫn đủ sàn 44 của Apple ────────────────────────────── */
  /*
    Chữ 13 điểm cao khoảng 18. Không có `padding` (padding sẽ đẩy hàng tiêu đề
    cao lên và làm hỏng nhịp dọc), nên `hitSlop` phải bù đủ phần còn thiếu.
  */
  const slop = /hitSlop=\{\{ top: (\d+), bottom: (\d+)/.exec(today);
  if (!slop) {
    bad.push('nút Sửa không có hitSlop — chữ cao ~18 điểm, dưới sàn 44 của Apple');
  } else if (18 + Number(slop[1]) + Number(slop[2]) < 44) {
    bad.push(
      `hitSlop dọc của nút Sửa chỉ đưa vùng chạm lên ${18 + Number(slop[1]) + Number(slop[2])} điểm, cần ≥44`,
    );
  }

  /* ── 4b. icon đi CÙNG chữ ─────────────────────────────────────────────── */
  /*
    Bản đầu chỉ có chữ, và người dùng bác: "vẫn phải có icon bên cạnh chữ sửa
    để người ta hiểu". Lý do nằm ở chính chỗ nó đứng — hàng này đã có một huy
    hiệu icon ở đầu, nên một chữ đơn độc ở cuối hàng đọc ra là NHÃN, cùng loại
    với tiêu đề mục bên trái, chỉ nhạt hơn. Cái icon là thứ nói rằng đây là một
    nút, trước cả khi người ta đọc chữ.
  */
  const btn = /function EditLayoutButton\(([\s\S]*?)\n\}\n/.exec(today);
  if (!btn) {
    bad.push('không đọc được EditLayoutButton');
  } else if (!/<Icon icon=\{Pencil\}/.test(btn[1])) {
    bad.push(
      'nút Sửa không còn icon cạnh chữ — hàng tiêu đề đã có một huy hiệu icon ở đầu, nên một chữ đơn độc ở ' +
        'cuối hàng đọc ra là NHÃN chứ không phải nút',
    );
  }

  /* ── 4c. đổi chế độ thì đưa trang về ĐẦU ─────────────────────────────── */
  /*
    Cùng lý do mà `toggleHero` có nó và `tools/hero-scroll.mjs` giữ luật cho
    nó: cả nội dung trang bị thay, chiều cao đổi đột ngột, và ScrollView tự kẹp
    vị trí cuộn về mốc gần nhất còn hợp lệ — người dùng thấy một cú trôi mình
    không ra lệnh.
  */
  const tog = /const toggleEdit = useCallback\(([\s\S]*?)\n  \);/.exec(today);
  if (!tog) {
    bad.push('không đọc được toggleEdit — vào/ra chế độ sắp xếp phải đi qua MỘT chỗ, nếu không lối vào sau sẽ quên đưa trang về đầu');
  } else if (!/scrollTo\(\{ y: 0, animated: true \}\)/.test(tog[1])) {
    bad.push(
      'đổi chế độ sắp xếp không đưa trang về đầu — chiều cao nội dung đổi đột ngột thì ScrollView tự kẹp vị ' +
        'trí cuộn, và cú trôi đó đọc ra như một lỗi',
    );
  }

  /* ── 5. avatar về một chạm ───────────────────────────────────────────── */
  if (/accessibilityState=\{\{ expanded: toolsOpen \}\}/.test(today) || /toolsOpen/.test(today)) {
    bad.push(
      'avatar vẫn mang cơ chế mở-ra-trước — nút Sửa đã đi khỏi góc trên, nên việc thứ nhất không còn gì để ' +
        'làm và nó chỉ còn là một cú chạm thừa trước Cài đặt',
    );
  }
  if (!/router\.push\('\/settings'\)/.test(today)) {
    bad.push("avatar không còn `router.push('/settings')`");
  }

  return bad;
}

const today = read(TODAY);
const problems = judge(today);

/* ── 6. Cài đặt vẫn không có lối vào nào khác, và mã đừng nói ngược lại ─── */
const settingsIsTab = /<NativeTabs\.Trigger[^>]*name="settings"/.test(read(TABS_IMPL));
/* Bóc trích dẫn `*"…"*` trước khi so — chú thích sửa sai trích lại đúng câu cũ
   để nói vì sao nó sai, và không bóc thì luật bắt người ta xoá bằng chứng. */
const claims = today.replace(/\*"[\s\S]*?"\*/g, '');
if (!settingsIsTab && /(fifth tab|tab thứ năm|second way in)/.test(claims)) {
  problems.push(
    `${TODAY}: vẫn còn khẳng định Settings là một tab, trong khi ${TABS_IMPL} chỉ dựng bốn Trigger. Câu ấy ` +
      'đã một lần được tin và dùng làm căn cứ cho một quyết định thiết kế',
  );
}

/* ── 7. nhóm MẶC ĐỊNH không xoá được, nhóm người dùng tạo thì có ─────────── */
/*
  ── vì sao đây là một luật chứ không phải một tuỳ chọn ──

  Xoá một nhóm KHÔNG xoá widget của nó — chúng dồn vào nhóm cuối. Nên xoá "Sức
  khoẻ" không mất dữ liệu, nhưng nó phá cấu trúc mà cả app dựa vào để nói
  chuyện: mọi câu chữ, mọi sheet giải thích, mọi lời khuyên đều nói về "sức
  khoẻ", "dinh dưỡng", "tập luyện". Và không có đường nào dựng lại chúng — chế
  độ sắp xếp chỉ tạo được nhóm RỖNG với tên tự gõ, nó không có "thêm widget".

  `resetConfig` là lối về duy nhất, và nó ném đi mọi sắp xếp người dùng đã làm.
  Một nút xoá mà lối hoàn tác là "vứt hết đi làm lại" không phải một nút xoá.

  Luật CHẠY THẬT `isCustomGroup` trên id của bốn nhóm gốc đọc ngược từ
  DEFAULT_CONFIG, chứ không gõ lại danh sách ấy: thêm nhóm gốc thứ năm mà quên
  chỗ này thì phép so vẫn đúng.
*/
{
  const cfg = read(CONFIG);
  const ids = [...cfg.matchAll(/^      id: '([\w-]+)',$/gm)].map((m) => m[1]);
  if (ids.length < 4) {
    problems.push(`${CONFIG}: không đọc được id các nhóm mặc định (thấy ${ids.length})`);
  }
  const fn = /export function isCustomGroup\(id: string\): boolean \{([\s\S]*?)\n\}/.exec(cfg);
  const defaults = /const DEFAULT_GROUP_IDS[^=]*= new Set\(DEFAULT_CONFIG\.groups\.map\(\(g\) => g\.id\)\)/.test(cfg);
  if (!fn) {
    problems.push(`${CONFIG}: không còn \`isCustomGroup\``);
  } else if (!defaults) {
    problems.push(
      `${CONFIG}: danh sách nhóm mặc định không suy từ DEFAULT_CONFIG — gõ lại nó là một bản sao sẽ lệch ` +
        'ngày ai đó thêm nhóm gốc thứ năm, và hôm đó nhóm mới ấy xoá được',
    );
  } else {
    const isCustom = new Function('id', 'DEFAULT', 'return !new Set(DEFAULT).has(id);');
    for (const id of ids) {
      if (isCustom(id, ids)) problems.push(`${CONFIG}: nhóm mặc định "${id}" lại xoá được`);
    }
    if (!isCustom('grp-1730000000000', ids)) {
      problems.push(`${CONFIG}: nhóm do người dùng tạo lại KHÔNG xoá được`);
    }
  }
  /* Và dây nối: chỉ nhóm xoá được mới bọc trong lối vuốt. */
  if (!/removable=\{isCustomGroup\(group\.id\)\}/.test(today)) {
    problems.push(`${TODAY}: lối vuốt-để-xoá không gắn với \`isCustomGroup\``);
  }
  if (/icon=\{Trash2\}/.test(today)) {
    problems.push(
      `${TODAY}: nút thùng rác vẫn còn — xoá là thao tác không hoàn tác được, nó không đứng thường trực ` +
        'ngang hàng với hai thao tác vô hại trên một hàng người ta lướt qua',
    );
  }
  if (!/name: 'delete', label: i18n\.a11yDelete/.test(today)) {
    problems.push(
      `${TODAY}: không có accessibility action xoá — cú vuốt là vô hình với VoiceOver, y như cú kéo, và nút ` +
        'thùng rác đã đi rồi',
    );
  }
}

/* ── 8. không chú thích nào được nói rằng mũi tên của NHÓM vẫn còn ───────── */
/*
  ── vì sao luật này tồn tại, và vì sao nó là luật thứ hai cùng loại ──

  Mũi tên lên/xuống của nhóm bị gỡ khi hàng tiêu đề được dựng lại theo kiểu
  Apple Music. Ba tệp vẫn ghi rằng chúng còn đó và rằng chúng là "đường duy
  nhất cho người dùng VoiceOver" — một câu vừa sai vừa nguy hiểm, vì nó bảo
  người đọc sau rằng đường trợ năng đã được lo, trong khi thứ thật sự lo nó là
  accessibility action.

  Đây là lần thứ hai trong cùng một phiên: lần trước là câu "Settings là tab
  thứ năm", và câu ấy đã được đưa cho người dùng như một dữ kiện để họ chọn
  thiết kế. Một chú thích lệch khỏi mã tệ hơn không có chú thích, đúng vì nó
  được tin.

  Luật suy trạng thái từ MÃ (nhóm còn nút mũi tên không?) rồi mới đi soi chữ,
  nên nó tự tắt nếu ngày nào đó mũi tên quay lại.
*/
{
  const groupArrows = /<ArrowBtn\s+icon=\{Chevron(Up|Down)\}\s+label=\{i18n\.a11yMove(Up|Down)\}\s+disabled=\{gi /.test(today);
  if (!groupArrows) {
    /* Bóc trích dẫn `*"…"*`: một chú thích sửa sai được phép trích lại câu cũ. */
    const strip = (x) => x.replace(/\*"[\s\S]*?"\*/g, '');
    const CLAIMS = [
      /hai cái nút mũi tên KHÔNG bị gỡ/i,
      /[Hh]ai cái nút mũi tên vẫn/,
      /[Hh]ai cái nút là đường duy nhất/,
      /[Hh]ai nút mũi tên vẫn còn/,
    ];
    for (const f of [TODAY, 'src/components/ascnd/drag-reorder.tsx', 'tools/drag-reorder.mjs']) {
      const src = strip(read(f));
      for (const re of CLAIMS) {
        if (re.test(src)) {
          problems.push(
            `${f}: còn khẳng định hai nút mũi tên của NHÓM vẫn ở đó, trong khi mã đã gỡ chúng. Câu ấy bảo ` +
              'người đọc sau rằng đường trợ năng đã được lo — thứ lo nó bây giờ là accessibility action',
          );
          break;
        }
      }
    }
  }
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'neo nút Sửa vào mục Sức khoẻ thay vì vị trí',
    mutate: (s) => s.replace('gi === 0 ? (', "group.id === 'health' ? ("),
    expect: /không phải một phép so VỊ TRÍ|đọc thuộc tính của mục/,
  },
  {
    name: 'cho MỌI mục một nút Sửa',
    mutate: (s) => s.replace('gi === 0 ? (', 'true ? ('),
    expect: /không phải một phép so VỊ TRÍ/,
  },
  {
    name: 'gộp hai nhãn làm một (trình đọc màn hình chỉ nghe "Sửa")',
    mutate: (s) => s.replace('a11yLabel={i18n.a11yEditLayout}', 'a11yLabel={i18n.editLayout}'),
    expect: /không tách nhãn hiện khỏi nhãn trợ năng/,
  },
  {
    name: 'bỏ hitSlop (vùng chạm tụt xuống ~18 điểm)',
    mutate: (s) => s.replace(/hitSlop=\{\{ top: \d+, bottom: \d+, left: \d+, right: \d+ \}\}\n\s*/, ''),
    expect: /không có hitSlop/,
  },
  {
    name: 'bỏ icon, chỉ còn chữ (bản người dùng đã bác)',
    mutate: (s) => s.replace('<Icon icon={Pencil} size={14} color={colors.mutedForeground} />\n        ', ''),
    expect: /không còn icon cạnh chữ/,
  },
  {
    name: 'đổi chế độ mà không đưa trang về đầu',
    mutate: (s) => s.replace("      scroller.current?.scrollTo({ y: 0, animated: true });\n      setNewGroupName", '      setNewGroupName')
      .replace(/(const toggleEdit = useCallback\([\s\S]*?)\n      scroller\.current\?\.scrollTo\(\{ y: 0, animated: true \}\);/, '$1'),
    expect: /không đưa trang về đầu/,
  },
  {
    name: 'thêm một lối vào thứ hai',
    mutate: (s) => s.replace('onPress={() => toggleEdit(true)}', 'onPress={() => { toggleEdit(true); toggleEdit(true); }}'),
    expect: /chỗ bật chế độ sắp xếp, phải đúng 1/,
  },
];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(today);
  if (broken === today) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = judge(broken);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}
if (judge(today).length !== 0) selfFail.push(`phép kiểm đỏ ngay trên BẢN THẬT: ${judge(today).join('; ')}`);

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('lối vào chế độ sắp xếp sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'lối vào chế độ sắp xếp OK — đúng MỘT nút Sửa, và nó neo vào VỊ TRÍ (`gi === 0`) chứ không vào danh tính ' +
    'của mục: người dùng có quyền xoá, đổi tên và đổi thứ tự mục, nên neo vào mục Sức khoẻ là neo vào thứ ' +
    'họ làm biến mất được — và hôm đó không còn đường nào vào chế độ sắp xếp, vì nút cũ ở góc trên đã bị ' +
    'dời đi. Nhãn tách đôi: mắt thấy tiêu đề mục ngay bên trái nên "Sửa" là đủ, còn trình đọc màn hình đọc ' +
    'từng phần tử rời nhau nên nó nghe câu đầy đủ. Vùng chạm đạt sàn 44 bằng `hitSlop` chứ không bằng ' +
    '`padding`, vì padding sẽ đẩy hàng tiêu đề cao lên và làm hỏng nhịp dọc của trang. Avatar về một chạm ' +
    'vào Cài đặt — màn hình ấy không có lối vào nào khác, nên một cú chạm thừa đứng trước nó là một cú ' +
    `chạm thừa trong cả app. ${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật`,
);
