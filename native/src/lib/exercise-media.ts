/**
 * Media của một bài tập, dưới dạng một MÔ HÌNH — không phải một chuỗi URL.
 *
 * Tệp này thuần: không import React, không import Supabase, không đọc theme.
 * Đó là điều kiện để `tools/exercise-media.mjs` biên dịch rồi CHẠY THẬT nó,
 * thay vì dò mã bằng regex — cùng lý do `lib/guide-content.ts` thuần.
 *
 * ════════════════════════════════════════════════════════════════════════
 *
 * ── bốn trạng thái, và giao diện là HỆ QUẢ của chúng ──
 *
 *     NONE            không nút, không thời lượng, không chấm trang
 *     IMAGE_SINGLE    một ảnh · mở toàn màn · KHÔNG thời lượng, KHÔNG chấm
 *     IMAGE_GALLERY   nhiều ảnh · chấm trang · vuốt ngang khi toàn màn
 *     VIDEO           poster + nút phát + thời lượng THẬT
 *
 * Đặt hàng nói thẳng về chiều phụ thuộc: *"The visual UI must be a consequence
 * of the media model."* Nên màn hình không bao giờ được hỏi "bài này tên gì"
 * hay "có phải ảnh demo không" để quyết định vẽ gì — nó hỏi `resolve()`.
 *
 * ── vì sao KIỂU được LƯU chứ không được đoán ──
 *
 * Bản trước đoán ảnh-hay-video bằng regex đuôi tệp, vì cột `exercises.video_url`
 * là một URL trần và đó là tín hiệu duy nhất tồn tại. Phép đoán ấy sai ngay ở
 * trường hợp thường gặp nhất mà sản phẩm này sẽ có: một URL ký sẵn của Supabase
 * Storage (`…/object/sign/…?token=…`) không mang đuôi nào.
 *
 * `exercise_media.kind` là chỗ kiểu được lưu. Đường mới KHÔNG đoán.
 */

/** Đúng hai kiểu, và chúng đến từ `CHECK (kind IN ('image','video'))`. */
export type MediaKind = 'image' | 'video';

/** Một hàng `exercise_media`, đã được làm sạch. */
export interface MediaItem {
  kind: MediaKind;
  uri: string;
  /**
   * Giây, CHỈ có ở video và chỉ khi đã biết.
   *
   * `null` nghĩa là CHƯA BIẾT — một trạng thái có thật: video vừa được thêm mà
   * chưa ai đọc metadata. Màn hình phải im lặng ở đó. Đặt hàng nói rõ: *"If
   * duration is temporarily unknown… do not show a fake number."*
   */
  durationS: number | null;
  posterUri: string | null;
  alt: string | null;
}

export type MediaState =
  | { type: 'none'; items: [] }
  | { type: 'image_single'; items: MediaItem[] }
  | { type: 'image_gallery'; items: MediaItem[] }
  | { type: 'video'; items: MediaItem[] };

/** Hàng thô từ `exercise_media`, đúng hình dạng PostgREST trả về. */
export interface MediaRow {
  kind: string | null;
  uri: string | null;
  position: number | null;
  duration_s: number | string | null;
  poster_uri: string | null;
  alt: string | null;
}

const NONE: MediaState = { type: 'none', items: [] };

const text = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/**
 * `duration_s` là `NUMERIC`, và PostgREST trả numeric dưới dạng CHUỖI.
 *
 * `Number('')` là 0 và `Number(null)` cũng là 0, nên một phép ép thẳng biến
 * "chưa biết" thành "0 giây" — đúng con số mà cột này có `CHECK (> 0)` để cấm.
 * Nên chỉ số dương hữu hạn mới đi qua; mọi thứ khác là `null`.
 */
const seconds = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * ── ĐƯỜNG LUI cho cột cũ, và chỉ ở đây mới được đoán ──
 *
 * `exercises.video_url` không mang kiểu. Một bài chưa có hàng `exercise_media`
 * nào mà vẫn có URL ở cột ấy thì hoặc đoán, hoặc vứt media của họ đi.
 *
 * Nên phép đoán bằng đuôi tệp sống SÓT ở đúng một chỗ: đường lui. Đường mới
 * không bao giờ gọi tới nó. Khi mọi dòng đã chuyển sang bảng media, cả hàm này
 * lẫn cột kia cùng biến mất.
 */
const LEGACY_IMAGE_EXT = /\.(gif|webp|png|jpe?g|avif|heic|bmp)(\?|#|$)/i;

/**
 * Bộ media của một bài, từ hàng bảng + cột cũ.
 *
 * @param rows   hàng `exercise_media`, thứ tự bất kỳ — hàm tự sắp theo `position`
 * @param legacy `exercises.video_url`, đường lui khi chưa có hàng nào
 */
export function resolveExerciseMedia(
  rows: readonly MediaRow[] | null | undefined,
  legacy: string | null | undefined,
): MediaState {
  const clean: MediaItem[] = (rows ?? [])
    .filter((r): r is MediaRow & { kind: MediaKind; uri: string } => {
      const k = r.kind;
      return (k === 'image' || k === 'video') && !!text(r.uri);
    })
    .map((r) => ({
      row: r,
      pos: typeof r.position === 'number' && Number.isFinite(r.position) ? r.position : 0,
    }))
    /* Sắp theo `position`, và `uri` phá hoà — hai hàng cùng vị trí bị
       `UNIQUE (exercise_id, position)` cấm ở cơ sở dữ liệu, nhưng một bộ đọc
       không được phép trả về thứ tự khác nhau giữa hai lần chạy chỉ vì máy chủ
       trả hàng theo thứ tự khác. */
    .sort((a, b) => a.pos - b.pos || (a.row.uri! < b.row.uri! ? -1 : 1))
    .map(({ row: r }) => ({
      kind: r.kind as MediaKind,
      uri: text(r.uri)!,
      durationS: r.kind === 'video' ? seconds(r.duration_s) : null,
      posterUri: r.kind === 'video' ? text(r.poster_uri) : null,
      alt: text(r.alt),
    }));

  if (clean.length) {
    /*
      ── MỘT BỘ LÀ MỘT KIỂU ──

      Schema cho phép một bài có cả hàng ảnh lẫn hàng video; sản phẩm thì không
      có hình dạng nào để vẽ ra chuyện đó. Nên hàng ĐẦU TIÊN theo `position`
      quyết định kiểu của cả bộ, và hàng khác kiểu bị bỏ.

      Đó là một LUẬT, không phải một phỏng đoán: nó tất định, nó không phụ thuộc
      thứ tự máy chủ trả về, và nó được viết ra đây để người thêm dữ liệu biết
      trước điều gì sẽ xảy ra. Cái thay thế — cố vẽ cả hai — là bịa ra một hình
      dạng giao diện mà không ai đặt hàng.
    */
    const kind = clean[0].kind;
    const items = clean.filter((m) => m.kind === kind);
    if (kind === 'video') {
      /* Video là một khái niệm ĐƠN ở sản phẩm này: một bài có một đoạn minh
         hoạ. Hàng video thứ hai không có chỗ nào để hiện. */
      return { type: 'video', items: [items[0]] };
    }
    return items.length > 1
      ? { type: 'image_gallery', items }
      : { type: 'image_single', items };
  }

  const url = text(legacy);
  if (!url) return NONE;
  return LEGACY_IMAGE_EXT.test(url)
    ? { type: 'image_single', items: [{ kind: 'image', uri: url, durationS: null, posterUri: null, alt: null }] }
    : { type: 'video', items: [{ kind: 'video', uri: url, durationS: null, posterUri: null, alt: null }] };
}

/** Có gì để mở toàn màn không. `none` là trạng thái duy nhất không có. */
export const hasMedia = (m: MediaState): boolean => m.type !== 'none';

/**
 * Chấm phân trang CHỈ ở thư viện ảnh.
 *
 * Một ảnh đơn có chấm là nói rằng còn ảnh nữa; một video có chấm cũng vậy.
 */
export const showsDots = (m: MediaState): boolean => m.type === 'image_gallery';

/**
 * Thời lượng để HIỆN, hoặc `null`.
 *
 * Ba lần `null` ở đây là ba sự thật khác nhau, và không cái nào được thay bằng
 * một con số: không có media, media là ảnh (ảnh không có thời lượng), và video
 * mà chưa ai đọc được metadata.
 */
export const displayDuration = (m: MediaState): number | null =>
  m.type === 'video' ? m.items[0].durationS : null;

/** `m:ss`, và chỉ gọi được khi đã có một con số thật. */
export function clockLabel(seconds: number): string {
  const t = Math.max(1, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
