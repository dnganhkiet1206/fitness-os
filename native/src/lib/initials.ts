/**
 * Chữ cái đầu để vẽ lên avatar khi không có ảnh.
 *
 * ── vì sao app này cần nó, và vì sao nó phải chịu được chuỗi rỗng ──
 *
 * `profiles` không có cột ảnh. Nó có `name TEXT NOT NULL DEFAULT ''` — nghĩa là
 * **mọi tài khoản mới đều có tên rỗng** cho tới khi người ta tự vào điền. Nên
 * "không có gì để vẽ" không phải một ca hiếm ở rìa; nó là trạng thái MẶC ĐỊNH,
 * và một hàm trả về `""` cho ca ấy sẽ cho ra một vòng tròn trống trên đúng màn
 * hình mà người dùng mới nhìn thấy đầu tiên.
 *
 * Vì thế hàm này trả `null` chứ không trả chuỗi rỗng: `null` là một câu trả lời
 * mà chỗ gọi BUỘC phải xử lý (vẽ một hình người), còn `""` thì lọt qua và biến
 * thành khoảng trắng.
 *
 * ── thứ tự nguồn ──
 *
 * Tên trước, rồi tới email. Email là thứ ai cũng có (đăng nhập bằng nó), nên nó
 * là cái lưới cuối cùng trước khi phải vẽ hình người — nhưng nó KHÔNG bao giờ
 * được ưu tiên hơn tên, vì "kiet@gmail.com" cho ra "K" trong khi tên thật có
 * thể cho ra "ĐK".
 *
 * ── vì sao lấy chữ đầu và chữ CUỐI ──
 *
 * Đó là cách Apple làm (Danh bạ, Mail, Tin nhắn) và nó đúng cho cả hai kiểu tên
 * mà app này gặp. Tên Việt xếp họ trước, tên riêng sau — "Đặng Anh Kiệt" ra
 * "ĐK", giữ được cả họ lẫn cái tên người ta thật sự được gọi. Tên phương Tây
 * "Anna Nguyen" ra "AN". Lấy hai chữ ĐẦU TIÊN sẽ cho "ĐA" — một cặp chữ không
 * nói lên ai cả.
 *
 * ── vì sao dò CHỮ CÁI chứ không cắt ký tự đầu ──
 *
 * `name` là ô người dùng tự gõ. Nó có thể bắt đầu bằng khoảng trắng, dấu chấm,
 * emoji, hay một chuỗi chỉ toàn dấu câu. `name[0]` trả về một nửa cặp surrogate
 * của emoji — thứ vẽ ra là một ô vuông rỗng — nên hàm đi tìm ký tự đầu tiên
 * THẬT SỰ là chữ, và nếu không có chữ nào thì đó cũng là `null`.
 */

/** Ký tự có phải chữ cái không — kể cả chữ có dấu và chữ không thuộc Latin. */
function letterAt(word: string): string | null {
  for (const ch of word) {
    /* `\p{L}` cần cờ `u`. Nó đúng với `Đ`, `Ệ`, và cả chữ Nhật/Hàn — nên một
       cái tên không thuộc Latin vẫn có chữ cái đầu thay vì rơi xuống hình
       người. */
    if (/\p{L}/u.test(ch)) return ch;
  }
  return null;
}

function fromName(name: string): string | null {
  const words = name.trim().split(/\s+/).map(letterAt).filter((c): c is string => c !== null);
  if (words.length === 0) return null;
  const first = words[0];
  const last = words[words.length - 1];
  return (words.length === 1 ? first : first + last).toUpperCase();
}

/**
 * Chữ cái đầu cho một người, hoặc `null` khi không có gì để vẽ.
 *
 * Trả về 1 hoặc 2 ký tự, đã viết hoa.
 */
export function initialsFor(name?: string | null, email?: string | null): string | null {
  const fromProfile = name ? fromName(name) : null;
  if (fromProfile) return fromProfile;
  /* Email: chỉ lấy phần trước `@`, và chỉ MỘT chữ. "kiet.dang@x.com" cho "K"
     chứ không phải "KD" — hai chữ suy ra từ một địa chỉ email là bịa ra một
     cái tên người dùng chưa từng nói. */
  const local = (email ?? '').split('@')[0];
  const ch = letterAt(local);
  return ch ? ch.toUpperCase() : null;
}
