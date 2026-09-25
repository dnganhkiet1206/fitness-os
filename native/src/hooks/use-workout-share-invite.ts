import { useI18n } from '@/hooks/use-app-settings';
import { useChallenges, useMyCommunityProfile } from '@/hooks/use-community';
import { dayGap, localDateStr } from '@/lib/local-date';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Lời mời "Chia sẻ buổi này" ngay sau khi lưu một buổi tập — #12, và #29 cho lối
 * lưu thứ hai.
 *
 * Hai chỗ lưu một buổi tập: sheet `log-workout` và lịch tuần `day-plan` (tick
 * xong set cuối là xong buổi). Cả hai gọi đúng hook này, nên lời mời không thể
 * có ở chỗ này mà vắng ở chỗ kia.
 *
 * ── một nút trên thanh toast, không phải hộp thoại ──
 *
 * Lúc vừa tập xong là lúc người ta muốn khoe nhất, nhưng cũng là lúc họ đang
 * cần đóng màn. Bỏ qua thì thanh tự tắt. Chỉ mời khi đã có hồ sơ cộng đồng: một
 * lời mời dẫn tới biểu mẫu tạo hồ sơ là lời mời sai. Không có `id` (đường
 * offline) thì không mời.
 *
 * ── con số thử thách: của server, đọc lại SAU khi lưu ──
 *
 * Không cộng +1 ở client: hai buổi cùng một ngày địa phương chỉ là một ngày.
 * Có trần 1,5 giây — màn không được treo vì một câu phụ trong toast; lỗi hay
 * chậm thì câu ấy chỉ đơn giản vắng mặt.
 */
export function useWorkoutShareInvite() {
  const i18n = useI18n();
  const me = useMyCommunityProfile();
  const challenges = useChallenges();

  const challengeLine = async (): Promise<string | null> => {
    try {
      const r = await Promise.race([
        challenges.refetch(),
        new Promise<null>((ok) => setTimeout(() => ok(null), 1500)),
      ]);
      const ch = r?.data?.find((x) => x.joined && !x.claimed && dayGap(localDateStr(), x.ends_on) >= 0);
      if (!ch) return null;
      return fillCopy(i18n.nShChallenge, { title: ch.title, a: String(Math.min(ch.progress, ch.target)), b: String(ch.target) });
    } catch {
      return null;
    }
  };

  const announce = (message: string, sessionId: string | null, line: string | null) => {
    const text = line ? `${message} · ${line}` : message;
    if (sessionId && me.data) {
      toast.next(text, i18n.nShShare, () => nav.push({ pathname: '/community-share', params: { session: sessionId } }));
    } else {
      toast.success(text);
    }
  };

  return { challengeLine, announce };
}
