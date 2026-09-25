import { dayGap, shiftLocalDate } from '@/lib/local-date';

/**
 * Thử thách ĐÃ ĐẠT mà CHƯA NHẬN thưởng, sắp rơi khỏi mọi màn — #60.
 *
 * ── lỗ mà cái này lấp ──
 *
 * `community_challenges_overview` giữ một thử thách thêm 7 ngày sau hạn "để
 * người đã đạt vẫn kịp nhận". Nhưng thẻ ở Khám phá chỉ hiện thử thách CÒN MỞ,
 * nên suốt 7 ngày ấy thử thách đã đạt mà chưa nhận chỉ nằm sâu trong trang
 * Tất cả thử thách (#41) — và ngày thứ 8 nó biến khỏi cả đó. Nó không vào lịch
 * sử (lịch sử là thử thách ĐÃ nhận), và phần thưởng mất mà không một lời nào.
 *
 * ── vì sao tính ở client, lúc đọc ──
 *
 * Không có cron để sinh một dòng thông báo lúc thử thách kết thúc, và tổng
 * quan ĐÃ trả đủ những gì cần: đã tham gia, tiến độ, đã nhận, ngày kết thúc.
 * Một bảng thông báo thứ hai cho đúng thông tin ấy là hai nguồn phải khớp nhau.
 *
 * ── con số 7 ──
 *
 * `CLAIM_WINDOW_DAYS` phải bằng `current_date - 7` trong điều kiện của tổng
 * quan — sai một ngày thì "hôm nay là ngày cuối" nói dối. `tools/claim-window.mjs`
 * đọc cả hai và đòi chúng bằng nhau. Nhận thưởng SAU hạn vẫn được (hàm nhận
 * không xét ngày); test SQL R3 giữ điều ấy, vì lời nhắc này hứa đúng điều ấy.
 */
export const CLAIM_WINDOW_DAYS = 7;

export interface ClaimableChallenge {
  id: string;
  title: string;
  ends_on: string;
  target: number;
  progress: number;
  joined: boolean;
  claimed: boolean;
  reward_coins: number;
}

/**
 * Thử thách đã hết hạn, đã đạt, chưa nhận, còn trong cửa sổ — sắp hết hạn
 * nhận trước. `daysLeft` 0 là hôm nay là ngày cuối.
 */
export function pendingClaims<T extends ClaimableChallenge>(items: readonly T[], today: string): (T & { daysLeft: number })[] {
  return items
    .filter((x) => x.joined && !x.claimed && x.progress >= x.target && dayGap(today, x.ends_on) < 0)
    .map((x) => ({ ...x, daysLeft: dayGap(today, shiftLocalDate(x.ends_on, CLAIM_WINDOW_DAYS)) }))
    .filter((x) => x.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** "Nhận 100 xu · còn 4 ngày" / "… hôm nay là ngày cuối"; thử thách không thưởng thì không nhắc tới xu. */
export function claimLine(
  x: { reward_coins: number; daysLeft: number },
  t: { nRmLeft: string; nRmLast: string; nRmLeftPlain: string; nRmLastPlain: string },
): string {
  const last = x.daysLeft === 0;
  const tpl = x.reward_coins > 0 ? (last ? t.nRmLast : t.nRmLeft) : last ? t.nRmLastPlain : t.nRmLeftPlain;
  return tpl.replace('{c}', String(x.reward_coins)).replace('{n}', String(x.daysLeft));
}
