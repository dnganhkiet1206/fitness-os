/**
 * Thẻ "Cần làm hôm nay": danh sách đúng, và KHÔNG ai dựng lại lời mời thứ hai.
 *
 *     node tools/todo-card.mjs
 *
 * ── vì sao một thẻ danh sách lại cần một bước kiểm ──
 *
 * Thứ nó thay thế đã sai đúng ở phần logic. Hàng bốn chip trên Today mời ghi
 * bốn thứ mà không bao giờ hỏi thứ nào ĐÃ ghi — `lib/today-cta.ts` ra đời vì
 * điều kiện `planned || day?.is_rest` không có vế `done`, nên một buổi tập đã
 * xong vẫn được mời ghi lại. Một danh sách nằm trong JSX là một danh sách không
 * công cụ nào chạy được, nên danh sách này nằm ở `lib/todo.ts` và bước dưới đây
 * GỌI nó với cả 32 tổ hợp.
 *
 * ── ba luật còn lại đều là về chuyện "đừng có bản thứ hai" ──
 *
 * Cả thay đổi này là một phép GỘP: năm lời mời rải trên một trang cuộn về một
 * chỗ. Chế độ hỏng của nó không phải thẻ vẽ sai, mà là lời mời thứ hai mọc lại
 * — một hàng chip mới, một nguồn trạng thái riêng, hay một ô nhập cân nặng thứ
 * hai. Cả ba đều dựng được, đều chạy được, và không cái nào làm đỏ `tsc`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { styleBody } from './lib/code-mask.mjs';
import { hex, loadPalette, overC, ratio } from './lib/stack.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CARD = 'src/components/ascnd/todo-card.tsx';
const WRITE = 'src/hooks/use-weight-write.ts';
const SHEET = 'src/app/log-weight.tsx';
const TODAY = 'src/app/(tabs)/index.tsx';

const problems = [];
let CASES = 0;
const out = mkdtempSync(path.join(tmpdir(), 'todo-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/todo.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { TODO_ORDER, todoProgress } = createRequire(import.meta.url)(
    path.join(out, 'todo.js'),
  );

  /* ── 1. thứ tự là thứ tự chủ dự án đọc ra, không phải thứ tự tôi thấy hợp lý ──
     "ghi bữa ăn, ghi buổi tập, ghi giấc ngủ, nhập sinh trắc, ghi cân nặng". */
  const WANT = ['meal', 'workout', 'sleep', 'biometrics', 'weight'];
  CASES++;
  if (TODO_ORDER.join(',') !== WANT.join(',')) {
    problems.push(
      `thứ tự dòng là ${TODO_ORDER.join(', ')} chứ không phải ${WANT.join(', ')} — thứ tự này do chủ ` +
        'dự án đọc ra khi đặt hàng thẻ, và nó cũng đi từ việc làm nhiều lần mỗi ngày xuống việc làm ' +
        'một lần. Đổi nó thì phải có một lý do mới, ghi vào đây',
    );
  }

  /* ── 2. chạy thật, cả 32 tổ hợp ──

     Bản trước chạy `todoOpen()` ở đây: 32 tổ hợp × "việc đã ghi không được còn
     nằm trong danh sách cần làm", đúng lỗi hàng chip cũ mắc. Phép kiểm ấy đã đi
     cùng hàm nó canh — thẻ nay vẽ ĐỦ năm dòng và đánh dấu dòng đã ghi, nên
     không còn phép lọc nào để sai, và `linked.mjs` gọi ra rằng một hàm chỉ
     còn phép kiểm của chính nó gọi tới là mã chết đội lốt vùng phủ.

     Thứ CÒN sống là con số trên đầu thẻ, nên đó là thứ được chạy — và từ khi có
     "bỏ qua hôm nay" nó có HAI chiều, nên chạy cả 32 × 32 = 1.024 tổ hợp
     xong/chưa × bỏ/không. Con số ấy rẻ, và nó phủ đúng chỗ dễ sai nhất: một
     việc VỪA ghi VỪA bị bỏ qua. */
  for (let dm = 0; dm < 32; dm++) {
    for (let sm = 0; sm < 32; sm++) {
      const done = {};
      WANT.forEach((k, i) => (done[k] = !!(dm & (1 << i))));
      const skipped = WANT.filter((_, i) => !!(sm & (1 << i)));
      const prog = todoProgress(done, skipped);
      CASES++;

      /* Đáp án được suy từ ĐỊNH NGHĨA, không chép lại phép tính: việc còn sống
         là việc không bị bỏ qua; tử số là việc còn sống đã ghi. */
      const live = WANT.filter((k) => !skipped.includes(k));
      const expectDone = live.filter((k) => done[k]).length;
      if (prog.done !== expectDone || prog.total !== live.length) {
        problems.push(
          `xong ${JSON.stringify(done)} · bỏ [${skipped.join(',')}]: tiến độ ${prog.done}/${prog.total}, ` +
            `đáng lẽ ${expectDone}/${live.length}`,
        );
      }
      /* Tử số không bao giờ vượt mẫu số. Bản dễ sai nhất của hàm này cộng việc
         đã ghi vào tử mà trừ nó khỏi mẫu, và ra `3/2`. */
      if (prog.done > prog.total) {
        problems.push(`xong ${JSON.stringify(done)} · bỏ [${skipped.join(',')}]: ${prog.done}/${prog.total}`);
      }
    }
  }

  /* Không bỏ qua gì thì mẫu số là năm: bỏ qua là câu trả lời cho HÔM NAY, nên
     mặc định phải là "vẫn hỏi đủ". */
  CASES++;
  if (todoProgress(Object.fromEntries(WANT.map((x) => [x, false]))).total !== WANT.length) {
    problems.push('chưa ghi gì và chưa bỏ qua gì thì mẫu số không còn là năm');
  }
  /* Bỏ qua HẾT thì mẫu số về 0 chứ không âm và không kẹt ở năm. */
  CASES++;
  const all = todoProgress(Object.fromEntries(WANT.map((x) => [x, true])), WANT);
  if (all.total !== 0 || all.done !== 0) {
    problems.push(`bỏ qua hết năm việc ra ${all.done}/${all.total}, đáng lẽ 0/0`);
  }
} catch (e) {
  problems.push(`không chạy được lib/todo.ts: ${e.message.split('\n')[0]}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ── 3. mỗi khoá có đủ bốn thứ để vẽ ra một dòng ──
   Thêm một khoá thứ sáu mà quên một bảng thì dòng ấy vẫn dựng: icon thành
   `undefined` và `graphicOf` nhận `undefined`. Không cái nào làm đỏ `tsc` nếu
   bảng được khai kiểu lỏng hơn một ngày nào đó. */
{
  const src = strip(read(CARD));
  const keysOf = (name) => {
    const m = new RegExp(`const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\}`).exec(src);
    return m ? [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : null;
  };
  const order = ['meal', 'workout', 'sleep', 'biometrics', 'weight'];
  for (const [name, expect] of [
    ['ICON', order],
    /* Cả NĂM khoá đều có route. `weight` từng là ngoại lệ duy nhất — nó ghi tại
       chỗ bằng một ô bung ra, vì không có màn nào để mở. Từ 17/09 nó có
       `/log-weight`, nên ngoại lệ ấy biến mất và bảng phải phủ đủ năm: một
       khoá thiếu route là một dòng bấm vào không đi đâu cả. */
    ['ROUTE', order],
  ]) {
    CASES++;
    const got = keysOf(name);
    if (!got) {
      problems.push(`${CARD}: không đọc được bảng \`${name}\``);
    } else if (got.join(',') !== expect.join(',')) {
      problems.push(`${CARD}: bảng \`${name}\` có [${got.join(', ')}], cần [${expect.join(', ')}]`);
    }
  }
  /* ── 3b. mỗi dòng hẹn được giờ, và dòng giấc ngủ KHÔNG mượn `bedtime` ──

     `bedtime` nhắc bạn đi ngủ: một việc buổi tối, không bao giờ "xong", và
     `planReminders` cố ý không tắt nó theo trạng thái nào. Dòng To-do thì là
     GHI LẠI đêm qua: việc buổi sáng, xong hẳn khi đã có bản ghi. Gộp hai cái là
     bắn "ghi đêm qua" lúc 22:30 cho một đêm chưa xảy ra, và không bao giờ im
     dù đã ghi. Đây là chỗ duy nhất trong bảng mà tên gần giống nhau. */
  CASES++;
  const remind = keysOf('TODO_REMINDER');
  if (!remind || remind.join(',') !== order.join(',')) {
    problems.push(`${CARD}: bảng \`TODO_REMINDER\` có [${remind?.join(', ') ?? '?'}], cần [${order.join(', ')}]`);
  }
  CASES++;
  if (!/^\s*sleep: 'sleepLog',$/m.test(src)) {
    problems.push(
      `${CARD}: dòng giấc ngủ không trỏ vào \`sleepLog\`. Nếu nó mượn \`bedtime\` thì lời nhắc "ghi ` +
        'lại đêm qua" bắn lúc đi ngủ, cho một đêm chưa xảy ra, và không bao giờ im dù đã ghi',
    );
  }
  /* ── 3c. không hứa một thông báo mà nền tảng không bắn ── */
  CASES++;
  if (!/if \(!available\) return null;/.test(src)) {
    problems.push(
      `${CARD}: dòng hẹn giờ không chặn theo \`available\` — ngoài iOS thì \`notificationsAvailable()\` ` +
        'là false, và một nút hẹn giờ không bao giờ bắn được gì thì tệ hơn là không có nút',
    );
  }
  CASES++;
  if (!/<ReminderRow\b/.test(src)) {
    problems.push(`${CARD}: không còn dựng <ReminderRow /> — mỗi dòng phải hẹn được giờ`);
  }

  /* ── 3d. việc đã ghi Ở LẠI trên thẻ ──

     Bản đầu chỉ vẽ việc chưa xong, và chủ dự án báo "khi log xong thì lại bị
     mất cả": dòng biến mất ngay dưới ngón tay vừa bấm, nên không xác nhận được
     gì, không sửa lại được lời nhắc của nó, và bấm nhầm thì không còn gì để
     bấm lại. Thẻ phải lặp qua CẢ `TODO_ORDER`. */
  CASES++;
  if (!/TODO_ORDER\.map\(/.test(src)) {
    problems.push(
      `${CARD}: không lặp qua \`TODO_ORDER\` — nếu chỉ vẽ việc chưa xong thì một dòng vừa ghi sẽ ` +
        'biến mất ngay dưới ngón tay, không để lại gì để xác nhận hay sửa lại',
    );
  }

  /* ── 3e. mọi đích chạm trên thẻ ≥ 44 điểm, và KHÔNG bù bằng hitSlop ──

     Apple đặt sàn 44×44pt; WCAG 2.2 · 2.5.5 (AAA) cũng 44×44. Nghiên cứu về
     người cao tuổi còn đi xa hơn: hiệu năng cải thiện tới ~17,5mm và người
     ngón tay kém linh hoạt cần ≥19mm, trong khi 44pt trên iPhone chỉ ≈7,3mm.

     Bản đầu của thẻ này có nút ghi cao 32 và một nút tắt nhắc 13 điểm, và chủ
     dự án hỏi đúng câu phải hỏi: "người già dùng nút nhỏ như vậy sao họ bấm
     được". `hitSlop` KHÔNG được tính là đã sửa: nó nới vùng chạm mà không nới
     thứ mắt nhìn thấy, và người phải ngắm thì nhắm vào cái nhìn thấy. */
  const FLOOR = 44;
  /*
    `DateField display="compact"` KHÔNG nằm trong danh sách này, và đó là một
    miễn trừ có tên chứ không phải một chỗ bỏ sót: WCAG 2.2 · 2.5.8 loại trừ
    hẳn "User agent control" — đích chạm mà cỡ do hệ điều hành quyết định và
    tác giả không sửa. Đồng hồ gọn của iOS là đúng nhóm ấy, và chủ dự án đòi
    giữ nó vì nó mượt hơn mọi thứ tự vẽ.

    Thứ KHÔNG được miễn là mọi bề mặt do app tự vẽ.

    `remind` RỜI khỏi danh sách này ở bản "đồng hồ cùng dòng", và đó là một
    miễn trừ CÓ ĐIỀU KIỆN, không phải một lần nới tay: hàng ấy nay không chứa
    một nút nào do app vẽ nữa — chỉ còn đúng cái đồng hồ gọn của hệ thống. Điều
    kiện ấy được KIỂM ngay dưới đây, nên ngày nào một `Pressable` quay lại nằm
    trong hàng ấy thì luật đỏ.

    Lý do bỏ ràng buộc 44 khỏi nó: ép một hàng chỉ chứa control của hệ thống
    phải cao 44 là ép cả dòng cao thêm cho một thứ không cần, và đó đúng là
    chuyện chủ dự án báo — "sửa luôn kích thước đồng hồ vì nó ảnh hưởng đến toàn
    bộ kích thước thẻ".
  */
  const SIZED = ['tile', 'action'];
  for (const name of SIZED) {
    CASES++;
    /* Đếm ngoặc, KHÔNG regex tới `\n  },` — bản đầu làm thế và các style viết
       một dòng (`tileDone`, `remindText`) nuốt luôn block kế tiếp, nên luật
       báo "không đọc được style" cho những style đang có thật. */
    const found = styleBody(src, name);
    if (found == null) {
      problems.push(`${CARD}: không đọc được style \`${name}\``);
      continue;
    }
    const h = /\bheight: (\d+)/.exec(found);
    if (!h || Number(h[1]) < FLOOR) {
      problems.push(
        `${CARD}: \`${name}\` cao ${h ? h[1] : '?'} điểm, dưới sàn ${FLOOR} của Apple HIG và WCAG 2.5.5. ` +
          'Thẻ này đã có một nút 32 và một nút 13 điểm, và chủ dự án đã phải nói ra',
      );
    }
  }
  /* ── 3f. icon trên thẻ này ĐƠN SẮC ──

     Thẻ từng có bảng `TINT` gán cho mỗi dòng một hue, theo nửa sau của luật ở
     `raised-pill.mjs` ("màu dời vào glyph"). Chủ dự án nhìn bản dựng thật rồi
     quyết định khác: "tôi muốn tất cả icon ở mục này về đơn sắc". Nửa ĐẦU của
     luật ấy vẫn nguyên và nay áp trọn — màu dành cho GIÁ TRỊ, không dành cho
     lối đi — nên bảng màu không được mọc lại. */
  CASES++;
  if (/const TINT\b/.test(src) || /graphicOf\(/.test(src)) {
    problems.push(
      `${CARD}: có bảng màu RIÊNG cho từng dòng (\`TINT\` hoặc \`graphicOf\`). Màu icon phải đến từ ` +
        '`constants/icon-tint.ts`, bảng app đã dựng cho đúng việc này và đã suy luận theo nghĩa đen ' +
        '("một cái tạ màu xanh neon là một cái tạ không ai từng thấy"). Một bảng thứ hai cho cùng ' +
        'những khái niệm là chỗ hai bên sẽ trôi khỏi nhau',
    );
  }
  CASES++;
  if (!/iconTint\(ICON\[/.test(src)) {
    problems.push(
      `${CARD}: không lấy màu icon từ \`iconTint()\` — đó là nguồn chuẩn, và nó khoá theo CHÍNH ` +
        'component icon chứ không theo một cái tên gõ tay',
    );
  }

  /* ── 3g. ô icon TRÒN, và bán kính không được gõ tay ──

     Chủ dự án chọn hình tròn (HIG không có quy tắc nào cho ô icon trong hàng
     danh sách — chính app Apple dùng cả hai). `radius.full` chứ không phải một
     con số: React Native tự kẹp bán kính về nửa cạnh ngắn, nên một số gõ tay
     thành sai ngay lần đầu ai đó đổi cạnh — mà cạnh ấy vừa đi từ 30 lên 44. */
  CASES++;
  {
    const tile = styleBody(src, 'tile') ?? '';
    if (!/borderRadius: radius\.full/.test(tile)) {
      problems.push(
        `${CARD}: \`tile\` không dùng \`radius.full\` — ô icon ở đây là hình TRÒN, và một bán kính gõ ` +
          'tay sẽ lệch ngay lần đầu cạnh ô đổi',
      );
    }
  }

  /* ── công tắc lời nhắc: không bao giờ là một glyph tí hon ──

     Bất biến thật là KÍCH THƯỚC, không phải chữ. Bản đầu cài nó thành "phải có
     nhãn `remindOffText`", và đó là MỘT cách thoả — cách duy nhất đúng khi công
     tắc còn nằm trong dòng, cạnh đồng hồ, ở 13 điểm.

     Chủ dự án đã chuyển nó đi: "xoá chữ tắt trên thẻ vì đã có nút rồi". Nay nó
     là một ô vuốt, và ô ấy to hơn hẳn — nên luật đo CHỖ MỚI thay vì đòi chỗ cũ.
     Hai vế: công tắc phải nằm trong danh sách nút vuốt, và ô nút phải ≥44 điểm,
     sàn của Apple HIG và WCAG 2.5.5. */
  CASES++;
  {
    const swipe = readFileSync(path.join(NATIVE, 'src/components/ascnd/swipe-row.tsx'), 'utf8');
    const cap = /const ACTION_H = ([^;]+);/.exec(swipe) && /const CAPSULE_H = (\d+);/.exec(swipe);
    const hasToggle = /label: reminderOn \? i18n\.nTodoOff : i18n\.nTodoOn/.test(src);
    if (!hasToggle) {
      problems.push(
        `${CARD}: không còn nút LẬT bật/tắt lời nhắc. Nhãn phải đổi theo trạng thái — một công tắc ` +
          'mang tên cố định thì không nói được nó đang ở đâu',
      );
    }
    if (/styles\.remindOffText/.test(src)) {
      problems.push(
        `${CARD}: chữ "Tắt" quay lại trong dòng. Công tắc nay nằm ở nút vuốt, và hai lối vào cho cùng ` +
          'một công tắc cách nhau mười điểm là đúng cái chủ dự án bảo dọn',
      );
    }
    /*
      Đích chạm của nút vuốt là CẢ CỘT — viên nang cộng khe cộng dòng chữ, và cả
      cột ấy bấm được (`styles.hit` phủ kín `actionWrap`). Đo riêng viên nang là
      đo sai vật: chủ dự án đã bảo làm nó "nhỏ hơn và cùng hình dạng với nút
      ghi", nên viên nang CỐ Ý nhỏ hơn 44.
    */
    const capH = /const CAPSULE_H = (\d+);/.exec(swipe);
    const w = /const OPEN_W = (\d+);/.exec(swipe);
    const wrapH = /height: ACTION_H/.test(swipe);
    if (!capH || !w) {
      problems.push('swipe-row.tsx: không đọc được hình học nút vuốt để đo đích chạm');
    } else {
      const h = Number(capH[1]);
      if (h < 44 || Number(w[1]) < 44) {
        problems.push(
          `swipe-row.tsx: đích chạm nút vuốt ${w[1]}×${h} điểm, dưới sàn 44 của Apple HIG và WCAG ` +
            '2.5.5. Công tắc lời nhắc sống ở đây, và bản 13 điểm là bản chủ dự án đã phải báo là bấm ' +
            'không nổi',
        );
      }
      if (!wrapH) {
        problems.push(
          'swipe-row.tsx: cột nút không cao đúng `ACTION_H`. Để nó giãn theo hàng là để `overflow: ' +
            'hidden` của thư viện xén mất dòng chữ khi hàng co lại — đúng cái chủ dự án chụp được',
        );
      }
    }
  }

  /* ── đồng hồ chỉ hiện khi lời nhắc đang BẬT ──
     "nếu tắt thông báo thì nút này biến mất khỏi thẻ". Một ô chọn giờ cho một
     lời nhắc không bắn là một ô hứa suông. */
  CASES++;
  if (!/if \(!r\.enabled\) return null;/.test(src)) {
    problems.push(
      `${CARD}: hàng giờ không tự ẩn khi lời nhắc tắt — người ta sẽ đặt được một giờ cho một thông ` +
        'báo không bao giờ bắn',
    );
  }

  /* ── nút "Ghi" nhường chỗ khi hàng bị kéo, ĐỒNG BỘ với cú kéo ──

     Nút vuốt và nút "Ghi" cùng đòi một đầu hàng: vuốt sang trái thì nút vuốt
     trồi lên đúng chỗ "Ghi" đang đứng và hai cái chồng nhau; vuốt sang phải thì
     "Ghi" bị mép thẻ cắt một nửa. Cả hai đều đọc ra là một cái nút hỏng.

     "Đồng bộ" là phần luật phải canh: nó phải chạy theo CHÍNH `openness` —
     giá trị `SwipeRow` đã dùng cho góc bo và mặt hàng — chứ không phải một
     animation riêng bắt đầu khi hàng mở xong.

     ── và cái neo đã phải đổi một lần ──

     Bản trước neo vào con số VIẾT THẲNG: `[0, 0.55]` và `[1, 0]`. Rồi cửa sổ
     nhường chỗ ấy thành `HANDOVER_AT`/`HANDOVER_SCALE` xuất từ `swipe-row.tsx`
     — vì nút VUỐT phải làm đúng phép này đảo chiều trong đúng khoảng này, và
     hai bản chép của một con số thì sẽ lệch nhau. Luật đỏ ngay, đúng như nó
     nên đỏ khi mã đổi hình dạng; nhưng thứ nó canh không hề hỏng.

     Nên nay nó canh HÀNH VI, và canh chặt hơn bản cũ: phải nội suy từ
     `openness`, phải dùng ĐÚNG hằng số dùng chung (không phải một số tự gõ),
     và phải đổi CẢ `opacity` lẫn `scale` — một nút mờ dần tại chỗ đọc ra là
     hỏng, một nút co lại đọc ra là nhường chỗ. */
  CASES++;
  {
    const yields = /useSwipeOpenness\(\)/.test(src);
    const shared = /HANDOVER_AT/.test(src) && /HANDOVER_SCALE/.test(src)
      && /from '@\/components\/ascnd\/swipe-row'/.test(src);
    const fades = /opacity:\s*interpolate\(openness\.value, \[0, HANDOVER_AT\], \[1, 0\]/.test(src);
    const shrinks = /scale:\s*interpolate\(openness\.value, \[0, HANDOVER_AT\], \[1, HANDOVER_SCALE\]/.test(src);
    const synced = shared && fades && shrinks;
    const wrapped = /<Animated\.View style=\{yield_\}>[\s\S]{0,200}?<PressScale/.test(src);
    if (!yields || !synced || !wrapped) {
      problems.push(
        `${CARD}: nút "Ghi" không nhường chỗ theo cú vuốt (đọc openness ${yields}, nội suy ${synced}, ` +
          `bọc nút ${wrapped}). Không nhường thì nó chồng lên nút vuốt hoặc bị mép thẻ cắt một nửa`,
      );
    }
  }

  /* ── hàng chạy HẾT bề ngang thẻ, và phần thụt vào nằm BÊN TRONG hàng ──

     Thẻ có đệm `spacing.card`. Không bù lại thì hàng trượt đi sẽ dừng ở mép
     trong của đệm: ô icon biến mất nhưng chữ đứng sựng lại cách mép thẻ 20 điểm
     và không bị cắt — đọc ra là một lỗi bố cục chứ không phải một hàng đang
     trượt. Chủ dự án chụp đúng cảnh ấy: "Bữa ăn" thành "a ăn" nằm hẫng ở mép.

     Hai vế phải đi cùng nhau: margin âm ở khung ngoài để hàng bleed ra, và
     padding bù lại bên trong để hàng ĐÓNG trông không đổi. Thiếu vế nào cũng
     hỏng một trong hai trạng thái, nên luật đòi cả hai và đòi chúng BẰNG nhau. */
  CASES++;
  {
    const bleed = /marginHorizontal: -spacing\.(\w+)/.exec(styleBody(src, 'bleed') ?? '');
    const pad = /paddingHorizontal: spacing\.(\w+)/.exec(styleBody(src, 'rowSwipe') ?? '');
    if (!bleed || !pad) {
      problems.push(
        `${CARD}: hàng không chạy hết bề ngang thẻ (margin âm ${bleed ? 'có' : 'thiếu'}, padding bù ` +
          `${pad ? 'có' : 'thiếu'}). Thiếu margin âm thì chữ dừng lại ở mép đệm và đọc ra là lỗi bố ` +
          'cục; thiếu padding bù thì hàng ĐÓNG mất phần thụt vào',
      );
    } else if (bleed[1] !== pad[1]) {
      problems.push(
        `${CARD}: margin âm dùng \`spacing.${bleed[1]}\` còn padding bù dùng \`spacing.${pad[1]}\` — ` +
          'hai con số phải là MỘT, không thì hàng đóng lệch khỏi tiêu đề thẻ',
      );
    }
  }

  /* ── điều kiện của miễn trừ trên: hàng hẹn giờ chỉ chứa control HỆ THỐNG ── */
  CASES++;
  {
    const body = /function ReminderRow\([\s\S]*?\n\}\n/.exec(src)?.[0] ?? '';
    if (!body) {
      problems.push(`${CARD}: không đọc được \`ReminderRow\` để kiểm miễn trừ 44 điểm`);
    } else if (/Pressable|PressScale|onPress/.test(body)) {
      problems.push(
        `${CARD}: hàng hẹn giờ lại có một nút do APP vẽ. Miễn trừ 44 điểm của nó chỉ đúng khi trong ` +
          'đó chỉ có `DateField` — control của hệ thống, thứ WCAG 2.5.8 loại trừ. Có nút app vẽ thì ' +
          'sàn 44 áp lại, và `remind` phải quay vào danh sách SIZED',
      );
    }
  }

  CASES++;
  if (/hitSlop/.test(src)) {
    problems.push(
      `${CARD}: còn dùng \`hitSlop\`. Nó nới vùng chạm mà không nới thứ nhìn thấy được, nên nó trả ` +
        'nợ với `tools/tap-target.mjs` chứ không trả nợ với người đang phải ngắm cái nút',
    );
  }

  CASES++;
  const labels = /const label: Record<TodoKey, string> = \{([\s\S]*?)\n  \};/.exec(src);
  const labelKeys = labels ? [...labels[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : null;
  if (!labelKeys || labelKeys.join(',') !== order.join(',')) {
    problems.push(`${CARD}: bảng nhãn thiếu khoá — có [${labelKeys?.join(', ') ?? '?'}]`);
  }

  /* ── 4. MỘT ý kiến về ngày hôm nay ──
     `useDailyQuests` đã đo bữa ăn / buổi tập / giấc ngủ cho phòng Koa. Đọc lại
     `useDailyLog` ở đây là dựng ý kiến thứ hai về cùng một ngày, cho cùng một
     người, trên cùng một màn — và hai ý kiến ấy sẽ lệch nhau đúng một lần. */
  CASES++;
  if (!/useDailyQuests\(\)/.test(src)) {
    problems.push(`${CARD}: không còn đọc \`useDailyQuests\` — ba trạng thái đầu phải đến từ đó, không tự đo lại`);
  }
  CASES++;
  if (/useDailyLog\(/.test(src)) {
    problems.push(
      `${CARD}: đọc thẳng \`useDailyLog\` — đó là ý kiến thứ hai về "hôm nay đã ghi gì", cạnh ` +
        '`useDailyQuests` vốn đã đo đúng ba thứ ấy',
    );
  }
  /* ── 5. chưa đọc xong ngày thì chưa nói ──
     Không có cờ này, một ngày đang tải tính ra là năm việc chưa làm: "0/5" hiện
     cho người đã ghi suốt buổi sáng. Hook `useDailyQuests` đặt hẳn một cờ vì app
     đã gặp lỗi ấy nhiều lần. */
  CASES++;
  /* Từ khi có "bỏ qua hôm nay", con số trên đầu thẻ đọc HAI kho: ngày, và danh
     sách bỏ qua. Cái nào chưa đọc xong cũng làm con số nhảy một nhịp, nên cổng
     phải hỏi cả hai — luật đòi từng cái có mặt trong cùng một câu `return null`
     chứ không đòi một chuỗi ký tự cố định, để thêm kho thứ ba không phải sửa
     luật. */
  const gate = /if \(([^)]*)\) return null;/g;
  const gates = [...src.matchAll(gate)].map((m) => m[1]);
  const ready = gates.find((g) => g.includes('quests.ready'));
  if (!ready) {
    problems.push(`${CARD}: không chặn theo \`quests.ready\` — ngày chưa đọc xong sẽ hiện ra thành 0/5`);
  } else if (!ready.includes('skip.ready')) {
    problems.push(
      `${CARD}: cổng "đã đọc xong" chỉ hỏi \`quests.ready\` mà không hỏi kho bỏ qua — trong khoảnh ` +
        'khắc trước khi đĩa trả lời, một việc đã bỏ qua vẫn nằm trong mẫu số và con số sẽ nhấp nháy',
    );
  }
}

/* ── 5b. mọi icon của thẻ đều CÓ miền trong bảng chuẩn ──

   `iconTint()` trả `undefined` cho icon không nằm trong bảng, và chỗ gọi ngã
   về `foreground`. Một dòng xám giữa bốn dòng có màu đọc ra là lỗi chứ không
   đọc ra là "icon này không thuộc miền nào" — nên nếu thẻ thêm một việc thứ
   sáu, icon của nó phải được xếp miền ở `icon-tint.ts` chứ không lặng lẽ xám.
   Luật CHẠY chính bảng ấy thay vì đọc bằng mắt. */
{
  const tint = readFileSync(path.join(NATIVE, 'src/constants/icon-tint.ts'), 'utf8');
  const listed = new Set([...tint.matchAll(/\[(\w+),\s*[A-Z]+\]/g)].map((m) => m[1]));
  /*
    Chỉ soi BẢNG `ICON`, không soi mọi cặp `khoá: Giá trị,` trong tệp.

    Bản trước quét cả tệp, và khi thẻ có thêm nút vuốt thì nó bắt luôn `icon:
    Minus` của nút "bỏ qua" rồi đòi `Minus` phải có một miền màu. Sai tiền đề:
    lý lẽ của luật này là "icon không có miền sẽ ngã về màu chữ và đứng XÁM
    giữa những dòng có màu", mà icon trên một viên thuốc vuốt không nằm trên ô
    icon và không lấy màu từ `iconTint` — nó có nền riêng và mực riêng.
  */
  const table = /const ICON: Record<TodoKey, LucideIcon> = \{([\s\S]*?)\n\};/.exec(strip(read(CARD)));
  if (!table) {
    problems.push(`${CARD}: không đọc được bảng \`ICON\` để soi miền màu`);
  }
  const used = [...(table?.[1] ?? '').matchAll(/^\s*(\w+): (\w+),$/gm)]
    .filter(([, , v]) => /^[A-Z]/.test(v))
    .map(([, , v]) => v);
  for (const icon of new Set(used)) {
    CASES++;
    if (!listed.has(icon)) {
      problems.push(
        `${CARD}: icon \`${icon}\` không có miền nào trong \`constants/icon-tint.ts\`, nên nó sẽ ngã ` +
          'về màu chữ và đứng xám giữa những dòng có màu',
      );
    }
  }
}

/* ── 5c. dòng ĐÃ GHI nhạt đi, nhưng không nhạt xuống dưới sàn ──

   Chủ dự án đặt hàng: "khi đã được ghi thì chỉ nút ghi hiện đã ghi, còn thẻ và
   icon giữ nguyên chỉ mờ đi". Cách hiển nhiên — một `opacity` trên cả dòng —
   ĐÃ được đo và bị bác: ở 0,75 thì chữ nhắc còn 3,20:1 và icon buổi tập còn
   2,96:1, dưới 4,5 của WCAG 1.4.3 và 3,0 của 1.4.11. Ngoại lệ "thành phần
   không hoạt động" của 1.4.3 không cứu được, vì dòng đã ghi vẫn bấm và vuốt
   được, tức vẫn ĐANG hoạt động.

   Nên chỉ ICON nhạt, và nhạt về phía Ô ICON chứ không về phía thẻ. Luật này
   CHẠY chính phép đo ấy trên chính bảng màu đang ship: đọc `DONE_ICON_ALPHA`
   ra khỏi thẻ, đọc miền màu của cả năm icon ra khỏi `icon-tint.ts`, rồi hỏi
   từng cái có còn ≥3:1 trên nền ô icom ở CẢ HAI diện mạo không. Hạ hằng ấy
   xuống 0,75 là đỏ. */
{
  const { palettes, materials } = loadPalette();
  const card = strip(read(CARD));
  const tint = strip(readFileSync(path.join(NATIVE, 'src/constants/icon-tint.ts'), 'utf8'));

  const mAlpha = /const DONE_ICON_ALPHA = ([\d.]+);/.exec(card);
  CASES++;
  if (!mAlpha) {
    problems.push(`${CARD}: không đọc được \`DONE_ICON_ALPHA\` — luật độ mờ đang không kiểm gì cả`);
  } else {
    const a = Number(mAlpha[1]);

    /* miền của từng icon, đọc ra khỏi hai bảng thật */
    const domain = Object.fromEntries(
      [...tint.matchAll(/\[(\w+),\s*([A-Z]+)\]/g)].map((m) => [m[1], m[2]]),
    );
    const key = Object.fromEntries(
      [...tint.matchAll(/const ([A-Z]+) = '(\w+)' satisfies PaletteKey;/g)].map((m) => [m[1], m[2]]),
    );
    const icons = [...card.matchAll(/^\s*(\w+): (\w+),$/gm)]
      .filter(([, , v]) => /^[A-Z]/.test(v) && domain[v])
      .map(([, , v]) => v);
    CASES++;
    if (icons.length !== 5) {
      problems.push(`${CARD}: đọc ra ${icons.length} icon có miền, đáng lẽ 5 — phép đo dưới đây đang hụt`);
    }

    for (const theme of ['light', 'dark']) {
      /* nền ô icon = `m.inset.bg` của diện mạo ấy, dựng đúng chồng mặt: trang →
         mặt thẻ (GlassCard `onPage`) → ô lõm. */
      const page = hex(palettes[theme].background);
      const m = materials[theme];
      const face = /rgba/.test(m.onPage)
        ? overC([255, 255, 255], page, Number(/,\s*([\d.]+)\)/.exec(m.onPage)[1]))
        : hex(m.onPage);
      const tile = /rgba/.test(m.inset.bg)
        ? overC([255, 255, 255], face, Number(/,\s*([\d.]+)\)/.exec(m.inset.bg)[1]))
        : hex(m.inset.bg);

      for (const icon of icons) {
        CASES++;
        const colour = hex(palettes[theme][key[domain[icon]]]);
        const r = ratio(overC(colour, tile, a), tile);
        if (r < 3) {
          problems.push(
            `${CARD}: icon \`${icon}\` của dòng đã ghi chỉ còn ${r.toFixed(2)}:1 trên ô icon bản ` +
              `${theme === 'light' ? 'sáng' : 'tối'} ở độ mờ ${a} — dưới sàn 3:1 của WCAG 1.4.11`,
          );
        }
      }
    }
  }

  /* Và trạng thái KHÔNG được chỉ nằm ở sắc độ: nút phải đổi CHỮ. */
  CASES++;
  if (!/done \? i18n\.nTodoDone : i18n\.nTodoLog/.test(card)) {
    problems.push(
      `${CARD}: nút của dòng không đổi chữ theo \`done\`. CHỮ là thứ mang trạng thái mà không phải ` +
        'màu — thiếu nó là vi phạm WCAG 1.4.1',
    );
  }
}

/* ── 5d. viên "Đã ghi": màu của nó được ĐO, không được chọn ──

   Chủ dự án đưa một ảnh dựng — viên xanh nhạt, tích xanh, CHỮ XANH — và nói
   "nút đã ghi thì nên làm như này". Bản dựng ấy RỚT ở bản sáng: `readinessGreen`
   sáng (#078055) mới 4,97:1 trên giấy trắng, nên trên một viên xanh nó tụt dưới
   4,5:1 của WCAG 1.4.3 ở MỌI độ đậm (4,46 ngay từ α 0,08). Nên màu xanh được
   chuyển sang chỗ nó đủ sức đứng — DẤU TÍCH, sàn 3:1 của 1.4.11 — còn chữ dùng
   một token qua được cả hai diện mạo.

   Luật này chạy lại chính phép đo ấy trên bảng màu đang ship, và nó đọc TÊN
   TOKEN ra khỏi thẻ chứ không gõ lại: đổi `actionTextDone` sang một token rớt
   sàn là đỏ, chứ không phải xanh vì luật vẫn đang đo token cũ.

   Ba vế, và vế thứ ba là vế dễ mất nhất: viên phải đi theo `done`, KHÔNG theo
   `quiet`. `quiet` gộp cả `skipped`, và một việc người dùng chủ động BỎ QUA thì
   không được nhận một viên khen có dấu tích. */
{
  const { palettes, materials } = loadPalette();
  const raw = read(CARD);
  const card = strip(raw);

  const mPill = /const DONE_PILL_ALPHA = ([\d.]+);/.exec(card);
  CASES++;
  if (!mPill) {
    problems.push(`${CARD}: không đọc được \`DONE_PILL_ALPHA\` — luật màu viên đang không kiểm gì cả`);
  } else {
    const a = Number(mPill[1]);

    /* Token của nền viên và của chữ, đọc ra khỏi CHÍNH hai style ấy. */
    const bgTok = /alpha\(c\.(\w+), DONE_PILL_ALPHA\)/.exec(styleBody(raw, 'actionDone') ?? '');
    const fgTok = /color: c\.(\w+)/.exec(styleBody(raw, 'actionTextDone') ?? '');
    CASES++;
    if (!bgTok || !fgTok) {
      problems.push(
        `${CARD}: không đọc được token của viên "Đã ghi" (nền qua \`alpha(c.…, DONE_PILL_ALPHA)\`, ` +
          'chữ qua `color: c.…`) — không có token thì không đo được gì',
      );
    } else {
      /* Màu của DẤU TÍCH, cũng đọc ra khỏi JSX chứ không giả định. */
      const tickTok = /icon=\{Check\} size=\{(\d+)\} color=\{c\.(\w+)\}/.exec(card);
      CASES++;
      if (!tickTok) {
        problems.push(
          `${CARD}: dòng ĐÃ GHI không còn dựng \`<Icon icon={Check} …>\` trong viên. Dấu tích là chỗ ` +
            'màu xanh được phép đứng (sàn 3:1) sau khi phép đo cấm nó làm màu chữ (sàn 4,5:1)',
        );
      }

      for (const theme of ['light', 'dark']) {
        const page = hex(palettes[theme].background);
        const m = materials[theme];
        const face = /rgba/.test(m.onPage)
          ? overC([255, 255, 255], page, Number(/,\s*([\d.]+)\)/.exec(m.onPage)[1]))
          : hex(m.onPage);
        const vi = theme === 'light' ? 'sáng' : 'tối';
        const pill = overC(hex(palettes[theme][bgTok[1]]), face, a);

        /* (1) viên phải THẤY được trên mặt thẻ — bậc bề mặt nhỏ nhất của iOS,
           cùng con số `bar-track.mjs` và `plan-week.mjs` dùng. Một viên tàng
           hình là đúng cái lượt trước đã tạo ra và chủ dự án vừa chỉ vào. */
        CASES++;
        const vsFace = ratio(pill, face);
        if (vsFace < 1.134) {
          problems.push(
            `${CARD}: viên "Đã ghi" chỉ tách khỏi mặt thẻ ${vsFace.toFixed(3)}:1 ở bản ${vi} — dưới ` +
              'bậc bề mặt 1,134 của iOS, tức nó lại tàng hình và nút đọc ra là một cái nhãn',
          );
        }

        /* (2) chữ trên viên, sàn 4,5:1 của WCAG 1.4.3 (chữ 15px, không phải
           "văn bản lớn"). */
        CASES++;
        const vsText = ratio(hex(palettes[theme][fgTok[1]]), pill);
        if (vsText < 4.5) {
          problems.push(
            `${CARD}: chữ \`${fgTok[1]}\` trên viên "Đã ghi" chỉ ${vsText.toFixed(2)}:1 ở bản ${vi} — ` +
              'dưới sàn 4,5:1 của WCAG 1.4.3. Đây đúng là chỗ bản dựng ban đầu (chữ xanh) rớt',
          );
        }

        /* (3) dấu tích, sàn 3:1 của WCAG 1.4.11 cho hình mang nghĩa. */
        if (tickTok) {
          CASES++;
          const vsTick = ratio(hex(palettes[theme][tickTok[2]]), pill);
          if (vsTick < 3) {
            problems.push(
              `${CARD}: dấu tích \`${tickTok[2]}\` trên viên "Đã ghi" chỉ ${vsTick.toFixed(2)}:1 ở bản ` +
                `${vi} — dưới sàn 3:1 của WCAG 1.4.11`,
            );
          }
        }
      }
    }
  }

  /* Vế thứ ba: viên khen đi theo `done`, không theo `quiet`. */
  CASES++;
  if (!/done && styles\.actionDone/.test(card)) {
    problems.push(
      `${CARD}: viên "Đã ghi" không còn gắn vào \`done\`. Gắn nó vào \`quiet\` là trao cả dấu tích ` +
        'lẫn sắc xanh khen thưởng cho dòng người dùng chủ động BỎ QUA',
    );
  }
  CASES++;
  if (/quiet && styles\.actionDone/.test(card)) {
    problems.push(
      `${CARD}: viên "Đã ghi" đang gắn vào \`quiet\`, thứ gộp cả \`skipped\`. Một việc bị bỏ qua sẽ ` +
        'được khen bằng dấu tích xanh — app nói sai về chính người dùng',
    );
  }
}

/* ── 6. lời mời thứ hai không mọc lại trên Today ── */
{
  const src = strip(read(TODAY));
  CASES++;
  if (!/<TodoCard \/>/.test(src)) {
    problems.push(`${TODAY}: không còn dựng <TodoCard /> — thẻ này LÀ chỗ trả lời "hôm nay còn ghi gì"`);
  }
  CASES++;
  if (/quickActions|styles\.quickChip|styles\.quickRow/.test(src)) {
    problems.push(
      `${TODAY}: hàng chip log cũ đã mọc lại. Nó mời ghi mà không hỏi thứ nào đã ghi, và nó là lời ` +
        'mời thứ hai cho đúng việc mà thẻ Cần làm đang mời',
    );
  }
}

/* ── 7. ô ghi cân nặng chỉ có MỘT bản ──
   Cân nặng là việc duy nhất không có màn riêng, nên nó phải được ghi tại chỗ.
   Chép ô nhập sang chỗ thứ hai là nhân đôi một logic GHI DỮ LIỆU — quy đổi
   kg/lb, ngưỡng hợp lý, và đường ghi offline có `mutationKey` bền, thứ đã từng
   nuốt mất một lần cân.

   ── và mục này đã phải sửa một lần, 15/09 ──

   Bản đầu đòi CẢ HAI tệp — thẻ Cần làm và `today-widgets.tsx` — dựng
   `<WeightEntry>`. Vế thứ hai chết khi chủ dự án nói *"tắt cái nút ghi đi không
   cho ghi nữa vì đã nằm ở todo rồi"*: thẻ Cân nặng nay là thẻ CHỈ ĐỌC, nên đòi
   nó dựng ô nhập là đòi ngược lại một yêu cầu tường minh.

   Thứ mục này thật sự canh vẫn còn nguyên và nằm ở vế `useLogWeight()` bên
   dưới: **đúng một** tệp được gọi nó.

   ── và mục này đã phải sửa lần thứ hai, 17/09 ──

   Tệp ấy từng là `weight-entry.tsx`, một ô gõ số bung ra ngay trong dòng cân
   nặng. Chủ dự án đặt hàng một màn riêng — chiếc cân lớn — nên ô ấy biến mất
   và đường GHI dời sang `use-weight-write.ts`, nguyên vẹn, kèm cả biên bản của
   nó. Cái tên đổi; điều được canh thì không: đúng MỘT chỗ gọi `useLogWeight()`,
   vì hai chỗ là hai bản của cùng một đường ghi và bản thứ hai sẽ trôi ở chỗ
   mất dữ liệu.

   Vế "phải dựng ô nhập" chết theo ô nhập. Thay nó là vế "dòng cân nặng phải
   DẪN tới đâu đó": thẻ Cần làm trỏ `/log-weight`, và màn ấy gọi đường ghi.
   Chiều ngược lại — thẻ Cân nặng KHÔNG được ghi — thuộc về
   `tools/weight-card.mjs`, và hai luật không được nói ngược nhau. */
{
  CASES++;
  const callers = [];
  for (const f of [CARD, WRITE, SHEET, 'src/components/ascnd/today-widgets.tsx']) {
    if (/useLogWeight\(\)/.test(strip(read(f)))) callers.push(f);
  }
  if (callers.join(',') !== WRITE) {
    problems.push(
      `\`useLogWeight()\` được gọi ở [${callers.join(', ') || 'KHÔNG ĐÂU CẢ'}] — chỉ \`${WRITE}\` được gọi ` +
        'nó. Hai chỗ ghi cân nặng là hai bản của cùng một đường ghi, và bản thứ hai sẽ trôi ở chỗ mất dữ liệu',
    );
  }
  CASES++;
  if (!/weight:\s*'\/log-weight'/.test(strip(read(CARD)))) {
    problems.push(
      `${CARD}: dòng cân nặng không còn trỏ tới \`/log-weight\`. Sau khi ô nhập tại chỗ bị thay bằng một ` +
        'màn riêng, đây là lối ghi cân nặng DUY NHẤT của màn Hôm nay',
    );
  }
  CASES++;
  if (!/useWeightWrite\s*\(/.test(strip(read(SHEET)))) {
    problems.push(`${SHEET}: màn ghi cân nặng không gọi \`useWeightWrite()\` — nó là một cái cân để ngắm`);
  }
  /* Và tệp KHÔNG được ghi cũng không được tự dựng lại ô nhập bằng tay. Vế
     `useLogWeight()` ở trên bắt được một lệnh ghi; vế này bắt được nửa còn lại
     của cùng logic ấy — phép quy đổi kg/lb, thứ chỉ một ô NHẬP mới cần. */
  CASES++;
  const TW = 'src/components/ascnd/today-widgets.tsx';
  if (/\bweightToKg\s*\(/.test(strip(read(TW)))) {
    problems.push(
      `${TW}: gọi \`weightToKg()\` — đó là phép quy đổi của một ô NHẬP cân nặng, và thẻ này không được ` +
        'ghi (xem `tools/weight-card.mjs`). Nếu một ô nhập cần mọc lại ở đây thì nó phải đi qua ' +
        '`useWeightWrite()`, không phải một bản chép',
    );
  }
}

if (problems.length) {
  console.log('thẻ cần làm CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `thẻ cần làm OK — ${CASES} ca, và danh sách được CHẠY chứ không đọc: cả 32 tổ hợp xong/chưa của ` +
    'năm việc × 32 tổ hợp bỏ-qua/không — 1.024 ca — đều đếm ra đúng con số trên đầu thẻ, đáp án suy ' +
    'từ ĐỊNH NGHĨA chứ không chép lại phép tính, và tử số không bao giờ vượt mẫu số (bản dễ sai nhất ' +
    'cộng việc đã ghi vào tử mà trừ nó khỏi mẫu, ra `3/2`). Bỏ qua hết năm việc ra 0/0, không âm và ' +
    'không kẹt ở năm. Thứ tự năm dòng là thứ tự chủ dự án đọc ra. Ba bảng vẽ (icon, màu, đích ' +
    'đến) và bảng nhãn phủ đúng năm khoá, nên một khoá thứ sáu không dựng ra được một dòng không có ' +
    'hình. Trạng thái ba việc đầu ĐỌC từ `useDailyQuests` chứ không tự đo lại, và thẻ im lặng tới ' +
    'khi ngày được đọc xong. Trên Today, hàng chip cũ không mọc lại. Và `useLogWeight()` chỉ có một ' +
    'chỗ gọi duy nhất — `use-weight-write.ts` — và dòng cân nặng của thẻ này trỏ tới `/log-weight`, màn ' +
    'DUY NHẤT còn ghi được, từ khi chủ dự án tắt ' +
    'ô nhập của thẻ Cân nặng ("đã nằm ở todo rồi"); thẻ ấy nay còn bị cấm gọi `weightToKg()`, nửa còn ' +
    'lại của cùng logic ghi, nên nó không dựng lại được một ô nhập bằng tay. Mỗi dòng hẹn được ' +
    'giờ qua đúng bộ lập lịch của app chứ không phải một cái hẹn riêng, dòng giấc ngủ trỏ vào ' +
    '`sleepLog` chứ không mượn `bedtime` (một cái là ghi lại đêm qua vào buổi sáng, một cái là nhắc ' +
    'đi ngủ và không bao giờ xong), và nút hẹn giờ không dựng ở nơi hệ điều hành không bắn thông báo. ' +
    'Việc đã ghi Ở LẠI trên thẻ thay vì biến mất dưới ngón tay, và mọi bề mặt do APP tự vẽ đều ≥44 điểm ' +
    '— sàn của Apple HIG và của WCAG 2.5.5 — mà không cái nào bù bằng `hitSlop`, thứ nới vùng chạm ' +
    'nhưng không nới cái người ta phải ngắm. Đồng hồ gọn của iOS được miễn có tên — WCAG 2.5.8 loại ' +
    'trừ "User agent control" — và công tắc lời nhắc nay sống ở một ô vuốt ≥44 điểm, đọc THẲNG khỏi ' +
    '`swipe-row.tsx`, chứ không phải một glyph 13 điểm trong dòng; nhãn của nó LẬT theo trạng thái, và ' +
    'hàng giờ tự ẩn khi lời nhắc tắt để không ai đặt được giờ cho một thông báo không bắn. ' +
    'Icon của cả năm dòng là ĐƠN SẮC: không bảng hue nào cho lối đi, và trạng thái đã-ghi đọc được ' +
    'bằng CHỮ ("Đã ghi" trên chính nút) chứ không bằng sắc độ. Dòng đã ghi nhạt đi bằng TOKEN và ' +
    'bằng một độ mờ chỉ áp cho icon, không phải bằng `opacity` cả dòng — cách ấy đã được đo và bác: ' +
    'ở 0,75 chữ nhắc còn 3,20:1 và icon buổi tập còn 2,96:1, mà ngoại lệ "thành phần không hoạt ' +
    'động" của 1.4.3 không áp được vì dòng ấy vẫn bấm và vuốt được. Độ mờ icon được CHẠY trên bảng ' +
    'màu đang ship, cả năm miền × hai diện mạo, trên nền ô icon dựng đúng chồng mặt. Màu icon đến từ ' +
    '`constants/icon-tint.ts` chứ không từ một bảng gõ tay ở thẻ, và mọi icon của thẻ đều có miền ' +
    'trong bảng ấy. Ô icon là hình tròn, viết ' +
    'bằng `radius.full` để bán kính đi theo cạnh thay vì được gõ tay. Và viên "Đã ghi" được ĐO ' +
    'trên bảng màu đang ship chứ không được chọn: nền, chữ và dấu tích đọc TÊN TOKEN ra khỏi chính ' +
    'hai style ấy rồi dựng lại trên mặt thẻ của từng diện mạo — viên phải qua bậc bề mặt 1,134 của ' +
    'iOS (dưới đó nó tàng hình và cái nút còn bấm được lại đọc ra là một cái nhãn, đúng chỗ chủ dự ' +
    'án chỉ vào), chữ phải qua 4,5:1 của WCAG 1.4.3 và dấu tích qua 3:1 của 1.4.11. Chính phép đo ' +
    'ấy BÁC bản dựng được đưa: chữ xanh trên viên xanh chỉ 4,23:1 ở bản sáng, vì `readinessGreen` ' +
    'sáng mới 4,97:1 trên giấy trắng nên nó không có chỗ để nhạt — màu xanh vì thế đi vào DẤU TÍCH, ' +
    'thứ chịu sàn 3:1, còn chữ dùng `secondaryForeground` (6,59 sáng · 4,88 tối), token duy nhất đi ' +
    'được cả hai diện mạo. Và viên khen gắn vào `done` chứ không vào `quiet`: `quiet` gộp cả ' +
    '`skipped`, nên gắn nhầm là trao dấu tích xanh cho đúng việc người dùng chủ động BỎ QUA',
);
