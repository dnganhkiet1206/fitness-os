/**
 * Ảnh của bài Cộng đồng, lấy từ thư viện do app cấp (#163).
 *
 * Chủ dự án, 27/09: người dùng KHÔNG tải ảnh lên. Mọi bài chia sẻ có một ảnh
 * của thư viện; app chọn sẵn một ảnh hợp nội dung, người dùng chỉ đổi PHONG
 * CÁCH nếu muốn; chỉ admin thêm ảnh (bảng `community_art`, bucket
 * `community-art`). Server kiểm ảnh đúng loại và còn dùng lúc đăng.
 *
 * Tệp này là phần thuần: chọn ảnh, liệt kê phong cách, đoán nhãn nội dung của
 * một buổi tập. Không import gì — `tools/community-art.mjs` biên dịch và chạy
 * nó một mình.
 */

export type ArtKind = 'workout' | 'recipe' | 'progress';

export interface CommunityArt {
  id: string;
  kind: string;
  style: string;
  tags: string[];
  path: string;
  alt_en: string;
  alt_vi: string;
  active: boolean;
  sort: number;
}

/**
 * Ảnh hợp nhất cho một bài.
 *
 * Chỉ ảnh CÒN DÙNG và ĐÚNG LOẠI — đúng hai điều server sẽ kiểm, nên ảnh app
 * chọn sẵn không bao giờ là ảnh server từ chối. Có `style` thì chỉ trong
 * phong cách ấy (phong cách không còn ảnh nào thì bỏ lọc, chứ không trả về
 * "không ảnh").
 *
 * Điểm theo nhãn: ảnh trùng nhãn của bài đứng đầu (càng trùng nhiều càng
 * trước); ảnh không nhãn (hợp mọi bài) đứng sau; ảnh mang nhãn KHÁC — ảnh chân
 * cho một buổi đẩy ngực — đứng cuối. Hoà thì theo `sort` rồi `id`, để cùng một
 * thư viện luôn cho cùng một lựa chọn.
 */
export function pickArt(
  library: readonly CommunityArt[],
  kind: ArtKind,
  opts: { tags?: readonly string[]; style?: string | null } = {},
): CommunityArt | null {
  const usable = library.filter((a) => a.active && a.kind === kind);
  const inStyle = opts.style ? usable.filter((a) => a.style === opts.style) : usable;
  const pool = inStyle.length ? inStyle : usable;
  if (!pool.length) return null;
  const want = new Set(opts.tags ?? []);
  const score = (a: CommunityArt) => {
    if (!a.tags.length) return 1;
    const hit = a.tags.filter((t) => want.has(t)).length;
    return hit > 0 ? 2 + hit : 0;
  };
  return [...pool].sort((a, b) => score(b) - score(a) || a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Các phong cách còn ảnh cho loại bài này, theo thứ tự admin xếp (`sort` nhỏ nhất). */
export function artStyles(library: readonly CommunityArt[], kind: ArtKind): string[] {
  const first = new Map<string, number>();
  for (const a of library) {
    if (!a.active || a.kind !== kind) continue;
    const s = first.get(a.style);
    if (s === undefined || a.sort < s) first.set(a.style, a.sort);
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([s]) => s);
}

/*
  Nhãn nội dung của một buổi tập, đọc từ TÊN bài tập (thứ duy nhất payload
  chắc chắn có). Từ khoá tiếng Anh và tiếng Việt, không phân biệt hoa thường.
  Hai nhóm trở lên → thêm `full`. Không nhận ra bài nào → không nhãn, và ảnh
  không nhãn của thư viện sẽ được chọn.
*/
const GROUPS: readonly [string, RegExp][] = [
  ['legs', /squat|lunge|leg press|leg curl|leg extension|calf|hip thrust|deadlift|step[- ]?up|chân|đùi|bắp chuối|mông/i],
  ['push', /bench|chest|press|push[- ]?up|dip|fly|tricep|ngực|đẩy|vai|tay sau/i],
  ['pull', /row|pull[- ]?up|chin[- ]?up|pulldown|curl|lat\b|face pull|shrug|kéo|lưng|xà|tay trước/i],
  ['cardio', /run|jog|bike|cycl|rowing machine|erg|treadmill|jump rope|elliptical|chạy|đạp xe|nhảy dây|cardio/i],
];

export function workoutTags(exerciseNames: readonly string[]): string[] {
  const found = new Set<string>();
  for (const n of exerciseNames) {
    /* "Leg Press" là chân, không phải đẩy: nhóm đầu khớp thì dừng. */
    for (const [tag, re] of GROUPS) {
      if (re.test(n)) {
        found.add(tag);
        break;
      }
    }
  }
  const tags = GROUPS.map(([t]) => t).filter((t) => found.has(t));
  if (tags.filter((t) => t !== 'cardio').length >= 2) tags.push('full');
  return tags;
}

/** Tên hiển thị của một phong cách. Khoá lạ (admin thêm sau) thì viết hoa chữ đầu. */
export function styleLabel(style: string, lang: 'en' | 'vi'): string {
  const known: Record<string, { en: string; vi: string; es: string }> = {
    mono: { en: 'Mono', vi: 'Đơn sắc', es: 'Mono' },
    neon: { en: 'Neon', vi: 'Neon', es: 'Neón' },
    paper: { en: 'Paper', vi: 'Giấy', es: 'Papel' },
    photo: { en: 'Photo', vi: 'Ảnh chụp', es: 'Foto' },
    line: { en: 'Line', vi: 'Nét vẽ', es: 'Línea' },
  };
  const k = known[style];
  if (k) return k[lang];
  const words = style.split('_').filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || style;
}
