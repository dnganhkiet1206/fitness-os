/**
 * Cú rung nói "tôi nhận rồi" phải rơi vào LÚC CHẠM, không phải lúc mạng xong.
 *
 *     node tools/tap-feedback.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Chủ dự án: "khi tích vào ô thực phẩm bổ sung còn bị delay".
 *
 * `useToggleSupplement` chỉ có `onSuccess`, nên một cú chạm đi hết BA lượt
 * mạng trước khi cái ô đổi hình: lượt ghi, rồi `invalidateQueries` bắt danh
 * sách nạp lại, và truy vấn ấy là hai lượt đọc. Cú rung xác nhận cũng nằm
 * trong `onSuccess`, nên máy rung sau khi ngón tay đã rời.
 *
 * Cùng bài mà nút Nước đã giải và ghi lại bằng chữ của nó: "Adding water is
 * the most-tapped button in the app and the round trip was the only reason it
 * ever felt like it had not registered."
 *
 * ── ranh giới, và vì sao nó KHÔNG do tôi đặt ──
 *
 * Đo trước khi chọn. Cả kho có 59 `useMutation`, 8 cái lạc quan. Một luật đòi
 * cả 59 phải có `onMutate` sẽ kêu oan 51 lần: phần lớn là gửi biểu mẫu rồi
 * chuyển màn, và ở đó CHỜ là đúng — người dùng muốn biết máy chủ đã nhận.
 *
 * Đo tiếp: 32 chỗ rung bên trong `onSuccess`/`onSettled`. Vẫn quá nhiều để gọi
 * hết là lỗi. Nhưng tách theo LOẠI rung thì ranh giới tự hiện ra, và nó là
 * ranh giới của Apple chứ không phải của tôi — `UIFeedbackGenerator` định
 * nghĩa:
 *
 *   selection  — phản hồi cho một lựa chọn ĐANG đổi
 *   impact     — hai vật va nhau, một thứ vừa khớp vào chỗ
 *   notification — KẾT QUẢ của một việc: xong, hỏng, cảnh báo
 *
 *     notificationAsync trong onSuccess   27 chỗ   ← ĐÚNG, đó là kết quả
 *     selectionAsync / impactAsync        5 chỗ    ← muộn, theo định nghĩa
 *
 * "Lựa chọn đang đổi" xảy ra lúc ngón tay chạm. Đặt nó sau một lượt mạng là
 * nói sai thời điểm của chính thứ nó đại diện. Nên luật chỉ cấm hai loại đầu,
 * và để yên 27 chỗ kia.
 *
 * ── vì sao không cửa nào khác bắt được ──
 *
 *   `tsc`        một lời gọi hàm hợp lệ
 *   `motion.mjs` canh thang thời lượng của animation, không canh haptic
 *   `live.mjs`   web không có haptic, và ảnh chụp không có trục thời gian
 *
 * Cái cuối là chỗ đau, và nó cùng họ với `today-fresh.mjs`: đây là một lỗi về
 * THỜI ĐIỂM, mà mọi thứ kho này tự động hoá đều đo trạng thái tĩnh. Chỉ ngón
 * tay trên máy thật mới thấy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { NATIVE } from './lib/stack.mjs';

/* Hai loại này là phản hồi cho CHÍNH cú chạm; loại thứ ba báo kết quả. */
const AT_TAP = ['selectionAsync', 'impactAsync'];
const AT_RESULT = 'notificationAsync';

const problems = [];
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx?$/.test(f));

/** Thân của một callback `onSuccess`/`onSettled`, cắt theo ngoặc cân bằng. */
function* resultCallbacks(src) {
  for (const m of src.matchAll(/\bon(Success|Settled)\s*:\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*/g)) {
    let i = m.index + m[0].length;
    if (src[i] === '{') {
      let d = 1;
      i++;
      while (i < src.length && d > 0) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') d--;
        i++;
      }
      yield { name: `on${m[1]}`, body: src.slice(m.index, i), at: m.index };
    } else {
      /* Dạng một biểu thức: `onSuccess: () => Haptics.selectionAsync()`. */
      const end = src.indexOf('\n', i);
      yield { name: `on${m[1]}`, body: src.slice(m.index, end < 0 ? src.length : end), at: m.index };
    }
  }
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

let scanned = 0;
let allowed = 0;
for (const rel of files) {
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));
  for (const cb of resultCallbacks(src)) {
    scanned++;
    if (cb.body.includes(`Haptics.${AT_RESULT}`)) allowed++;
    for (const kind of AT_TAP) {
      if (!cb.body.includes(`Haptics.${kind}`)) continue;
      const line = src.slice(0, cb.at).split('\n').length;
      problems.push(
        `${rel}:${line} \`Haptics.${kind}\` nằm trong \`${cb.name}\` — tức nó nổ khi MÁY CHỦ trả lời, `
          + 'muộn hơn ngón tay hàng trăm mili-giây. Theo định nghĩa của Apple, `selection` là phản hồi cho '
          + 'một lựa chọn ĐANG đổi và `impact` là hai vật vừa va nhau; cả hai xảy ra lúc chạm. Chuyển nó '
          + `sang \`onMutate\`. (Báo kết quả một việc thì dùng \`${AT_RESULT}\`, và ở \`${cb.name}\` nó đúng chỗ — `
          + 'luật này không đụng tới.)',
      );
    }
  }
}

if (!scanned) {
  problems.push('không tìm thấy một `onSuccess`/`onSettled` nào — cách viết mutation đã đổi, và luật này mất mục tiêu');
}

if (problems.length) {
  console.error('rung xác nhận rơi sau mạng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `phản hồi chạm OK — quét ${scanned} callback \`onSuccess\`/\`onSettled\`: không chỗ nào bắn `
    + `\`${AT_TAP.join('`/`')}\` ở đó, trong khi ${allowed} chỗ bắn \`${AT_RESULT}\` và được để yên. `
    + 'Ranh giới ấy là của Apple: `selection`/`impact` là phản hồi cho cú chạm nên phải nổ lúc chạm, '
    + '`notification` báo kết quả nên nổ lúc có kết quả. Đo trước khi chọn phạm vi — 59 mutation, chỉ 8 '
    + 'lạc quan, nên một luật đòi `onMutate` ở mọi nơi sẽ kêu oan 51 lần; 32 chỗ rung sau mạng, 27 trong '
    + 'số đó đúng. Đây là lỗi về THỜI ĐIỂM, thứ mà ảnh chụp không có trục để đo và web thì không có haptic',
);
