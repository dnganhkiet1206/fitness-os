import { getLocale } from '@/lib/i18n';

type Strings = { nCmJustNow: string; nCmMinAgo: string; nCmHourAgo: string; nCmDayAgo: string };

/**
 * "3 giờ trước" cho bài và bình luận cộng đồng.
 *
 * Viết tay bằng bốn chuỗi i18n chứ không bằng `Intl.RelativeTimeFormat`: Hermes
 * không bảo đảm có API ấy trên mọi bản iOS app hỗ trợ, và một feed hiện
 * "Invalid" ở chỗ thời gian là lỗi người ta thấy ngay. Quá bảy ngày thì ghi
 * ngày tháng — "43 ngày trước" bắt người đọc tự tính ngược.
 */
export function timeAgo(iso: string, i18n: Strings, lang: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 1) return i18n.nCmJustNow;
  if (min < 60) return i18n.nCmMinAgo.replace('{n}', String(min));
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.nCmHourAgo.replace('{n}', String(h));
  const d = Math.floor(h / 24);
  if (d <= 7) return i18n.nCmDayAgo.replace('{n}', String(d));
  return new Date(t).toLocaleDateString(getLocale(lang as 'vi' | 'en'), { day: 'numeric', month: 'short' });
}
