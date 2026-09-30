import { Check, EyeOff } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type ReportReason, useHiddenReasons, useRequestReview } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';
import { toast } from '@/lib/toast';

type I18n = ReturnType<typeof useI18n>;
const REASON: Record<ReportReason, (i: I18n) => string> = {
  spam: (i) => i.nCmReasonSpam,
  harassment: (i) => i.nCmReasonHarass,
  inappropriate: (i) => i.nCmReasonInappropriate,
  misleading: (i) => i.nCmReasonMisleading,
  other: (i) => i.nCmReasonOther,
};

/**
 * "Đang ẩn" trên bài hay bình luận của CHÍNH MÌNH (#26): vì sao, và bước tiếp.
 *
 * Trước đây chỉ có một dòng đỏ "đang ẩn vì bị báo cáo" — không biết vì sao,
 * không có gì để làm. Với người bị một nhóm nhỏ báo cáo oan, đó là ngõ cụt.
 *
 * Nói con số và LOẠI lý do ("3 người báo cáo · phần lớn: nội dung rác"), không
 * nói ai: server không trả id người báo hay ghi chú của họ. Nút "Yêu cầu xem
 * lại" gửi một lần; sau đó nó thành một dòng trạng thái, không phải một nút
 * bấm được mãi. Không tự bỏ ẩn — người xem lại là chủ dự án trên dashboard.
 *
 * Chỉ dựng cho thứ `hidden && mine`, nên truy vấn lý do chỉ chạy ở đó.
 */
export function HiddenNotice({ postId, commentId, compact = false }: { postId?: string; commentId?: string; compact?: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const reasons = useHiddenReasons(true);
  const ask = useRequestReview();
  const r = reasons.data?.find((x) => (postId ? x.post_id === postId : x.comment_id === commentId));
  const sent = !!r?.review_requested || ask.isSuccess;

  const why =
    r && r.reporters > 0
      ? fillCopy(r.top_reason ? i18n.nCmHiddenWhy : i18n.nCmHiddenWhyN, {
          n: r.reporters,
          reason: r.top_reason ? REASON[r.top_reason](i18n).toLocaleLowerCase() : '',
        })
      : null;

  return (
    <View style={[styles.box, compact && styles.boxCompact]}>
      <View style={styles.row}>
        <Icon icon={EyeOff} size={14} color={c.readinessRed} />
        <Text style={styles.title}>{i18n.nCmHiddenNotice}</Text>
      </View>
      {why ? <Text style={styles.why}>{why}</Text> : null}
      {!r ? null : sent ? (
        <View style={styles.row} accessibilityRole="text">
          <Icon icon={Check} size={14} color={c.mutedForeground} />
          <Text style={styles.why}>{i18n.nCmReviewSent}</Text>
        </View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ busy: ask.isPending }}
          aria-busy={ask.isPending}
          disabled={ask.isPending}
          hitSlop={4}
          onPress={() =>
            ask.mutate(
              { postId, commentId },
              { onSuccess: () => toast.success(i18n.nCmReviewSentToast), onError: (e: Error) => toast.fail(e) },
            )
          }
          style={styles.btn}>
          {ask.isPending ? <ActivityIndicator size="small" color={c.foreground} /> : null}
          <Text style={[styles.btnText, ask.isPending && styles.btnTextBusy]}>{i18n.nCmReviewAsk}</Text>
        </PressScale>
      )}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  box: {
    gap: spacing.xs + 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: alpha(c.readinessRed, 0.08),
    alignItems: 'flex-start',
  },
  boxCompact: { padding: spacing.sm, marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  title: { ...type.footnote, color: c.readinessRed, flexShrink: 1 },
  why: { ...type.footnote, fontWeight: '400', color: c.mutedForeground, flexShrink: 1 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: alpha(m.ink, 0.08),
    marginTop: 2,
  },
  btnText: { ...type.footnote, fontWeight: '600', color: c.foreground },
  btnTextBusy: { opacity: 0.6 },
}));
