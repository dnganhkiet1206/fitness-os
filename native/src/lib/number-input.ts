/**
 * Lọc cho ô nhập số.
 *
 * ── lỗi ──
 *
 * Hầu hết ô số trong app nối thẳng `onChangeText` vào `setState`, tức lưu
 * nguyên chuỗi bàn phím gõ ra. Gõ vào một ô đang rỗng rồi lỡ chạm 0 vài lần
 * thì được "00040", hoặc "000005" ở thẻ cân nặng — cả hai đều đã bị chụp lại.
 *
 * Nó không sai về GIÁ TRỊ (`Number('000005')` vẫn là 5) nhưng sai về THỨ NGƯỜI
 * DÙNG ĐỌC, và một ô số hiện ra số mà họ không gõ thì họ thôi tin ô đó.
 *
 * ── vì sao ở đây chứ không ở từng màn ──
 *
 * Lời giải này đã tồn tại, trong `food-editor.tsx`, dưới tên `digits` — và chỉ
 * bảo vệ bốn ô trong đúng tệp ấy. Quét cả app ra 25 ô số thì 20 ô hở. Một quy
 * tắc đúng nằm trong một tệp là một quy tắc mà mười tệp còn lại chưa nghe nói
 * tới; `tools/number-input.mjs` canh để ô mới không lại nối thẳng.
 *
 * ── vì sao rỗng vẫn là rỗng ──
 *
 * Không biến chuỗi rỗng thành "0". "0" là một câu trả lời, còn rỗng là chưa
 * trả lời, và chỗ lưu phân biệt hai thứ đó.
 */

/**
 * Số nguyên: chỉ chữ số, không giữ số 0 thừa ở đầu.
 *
 * Cho kcal, macro, số lần, số bước — những thứ mà một dấu thập phân là vô
 * nghĩa. Lọc cả ký tự không phải chữ số, vì `number-pad` trên iOS vẫn cho dán.
 */
export function intText(v: string): string {
  return v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
}

/**
 * Số thập phân: chữ số và ĐÚNG MỘT dấu phân cách.
 *
 * ── dấu phẩy hoá dấu chấm, và đây là lỗi thứ hai ──
 *
 * `decimal-pad` của iOS in ra dấu phân cách theo VÙNG của máy, nên máy đặt
 * tiếng Việt cho ra `,` chứ không phải `.`. Mà chỗ đọc lại luôn là
 * `parseFloat`, và `parseFloat('71,5')` trả về **71** — không phải NaN, không
 * báo lỗi gì cả. Người dùng gõ 71,5 kg và app lưu 71 kg.
 *
 * Đó tệ hơn hẳn số 0 thừa: số 0 thừa thì nhìn thấy được, còn cái này im lặng
 * và nửa lạng biến mất mỗi lần cân. Nên đổi `,` thành `.` ngay tại chỗ gõ,
 * để thứ hiển thị và thứ được lưu là cùng một con số.
 *
 * ── số 0 đứng trước dấu chấm thì giữ ──
 *
 * "0.5" phải gõ được, nên chỉ cắt số 0 khi còn CHỮ SỐ theo sau, không cắt khi
 * theo sau là dấu chấm. Và "." một mình thành "0." để ô không hiện một dấu
 * chấm mồ côi.
 */
export function decText(v: string): string {
  const dotted = v.replace(/,/g, '.');
  const cleaned = dotted.replace(/[^0-9.]/g, '');
  /* Dấu chấm thứ hai trở đi bị bỏ: giữ phần trước dấu đầu tiên và tất cả chữ
     số sau nó, chứ không cắt cụt cả đuôi — người sửa giữa chuỗi không bị mất
     phần đã gõ. */
  const first = cleaned.indexOf('.');
  const one =
    first === -1
      ? cleaned
      : cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, '');
  if (one === '.') return '0.';
  return one.replace(/^0+(?=\d)/, '');
}
