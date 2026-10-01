import { useEffect, useRef } from 'react';

/** JSON với khoá object đã sắp xếp — hai object cùng nội dung ra cùng một chuỗi. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
      : x,
  );
}

/**
 * Điền một form từ dữ liệu truy vấn — và điền LẠI khi dữ liệu mới về, nhưng
 * CHỈ KHI người ta chưa sửa gì kể từ lần điền trước (#166).
 *
 * ── hai cách sai ──
 *
 * `useEffect(() => { setX(data.x); … }, [data])` điền lại MỖI lần `data` đổi
 * tham chiếu. Từ khi app trở lại từ nền là một lượt tải lại (`focusManager`
 * nghe `AppState`, #160) — cộng đồng bộ Health ghi cân nặng rồi làm hồ sơ cũ
 * đi — một lượt tải mang về dữ liệu KHÁC sẽ xoá sạch thứ người ta đang gõ dở
 * ở `edit-profile`, không một lời.
 *
 * "Điền một lần" (`community-profile.tsx`) chữa được cái ấy nhưng mở cái
 * ngược lại: thứ hiện ra đầu tiên có thể là bản CŨ trong cache trên máy. Bản
 * mới về khi người ta chưa chạm gì thì form vẫn giữ số cũ — và bấm Lưu là ghi
 * đè số mới trên server bằng số cũ.
 *
 * ── cách ở đây ──
 *
 * `apply` đặt state và TRẢ VỀ đúng thứ nó vừa đặt, cùng hình dạng với
 * `current` (state hiện tại của form). Lần sau dữ liệu đổi: nếu `current` vẫn
 * y hệt thứ đã điền lần trước thì chưa ai sửa — điền lại; khác thì người ta
 * đã sửa — để yên. So bằng JSON (khoá đã SẮP XẾP, để thứ tự khoá của hai
 * object không làm chúng khác nhau) vì mọi thứ trong một form là chuỗi, số,
 * cờ và mảng của chúng.
 */
export function useFormSeed<S>(source: S | null | undefined, current: unknown, apply: (s: S) => unknown): void {
  const last = useRef<string | null>(null);
  /* Đọc ở lần render mà `source` đổi — tức state của form ngay lúc ấy. */
  const now = stableJson(current);
  useEffect(() => {
    if (source == null) return;
    if (last.current !== null && last.current !== now) return;
    last.current = stableJson(apply(source));
    // `now` và `apply` cố ý không ở đây: điền chỉ khi DỮ LIỆU đổi, không khi người ta gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);
}
