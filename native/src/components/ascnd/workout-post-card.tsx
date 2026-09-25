import { ChevronRight, Clock, Copy, Dumbbell, Trophy } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PostShell } from '@/components/ascnd/post-parts';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type FeedPost, workoutFromPost } from '@/hooks/use-community';
import { useAddWorkoutTemplate } from '@/hooks/use-library';
import { usePalette } from '@/hooks/use-palette';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';
import { fillCopy } from '@/lib/copy-fill';

/** Thẻ gọn trên feed hiện ba bài tập; trang chi tiết hiện hết. */
const PREVIEW = 3;

/**
 * Một bài Workout — thẻ dựng từ dữ liệu buổi tập thật (server dựng, xem
 * `share_workout`), không có ảnh.
 *
 * ── thứ tự từ trên xuống, và vì sao ──
 *
 *   ai · khi nào      người ta đọc bài của AI trước khi đọc bài gì
 *                     (`PostShell`, chung cho mọi loại bài).
 *   tên buổi + số     "Push Day", ~45 phút, 12.840 kg, PR — ba con số một
 *                     người tập hỏi đầu tiên về một buổi của người khác.
 *   các bài tập       mỗi bài một dòng với set nặng nhất, trong một mặt lõm
 *                     (`m.inset`) để nó đọc ra là DỮ LIỆU của thẻ chứ không
 *                     phải thêm một thẻ lồng.
 *   Thử workout       hành động làm Community khác một feed để lướt (concept
 *                     mục 4). Viên trầm, không đặc: ba mươi bài là ba mươi nút,
 *                     và ba mươi nút đặc là một bức tường.
 *   chú thích         phần người kể — sau dữ liệu, để thẻ nào cũng có cùng
 *                     một khung dù người đăng viết một chữ hay viết một đoạn.
 *   thích · bình luận · lưu · chia sẻ
 *
 * Không có số "Nx PRs": bảng buổi tập chỉ lưu CỜ `pr_detected`, không lưu số
 * kỷ lục. Thẻ nói đúng thứ dữ liệu có.
 */
export function WorkoutPostCard({
  post,
  full = false,
  preview = false,
}: {
  post: FeedPost;
  full?: boolean;
  /** Màn chia sẻ: đúng cái thẻ sẽ được đăng, nhưng chưa có gì để thích,
      lưu, báo cáo hay thử — nên không vẽ hàng hành động, menu, hay nút Thử. */
  preview?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const addTemplate = useAddWorkoutTemplate();

  const p = post.payload;
  const title = p.title ?? i18n.nCmWorkout;
  const lines = full ? p.exercises : p.exercises.slice(0, PREVIEW);
  const more = p.exercises.length - lines.length;
  const locale = getLocale(lang);
  const volume = p.volumeKg > 0 ? Math.round(displayWeight(p.volumeKg, wUnit)).toLocaleString(locale) : null;

  const openPost = () => nav.push({ pathname: '/community-post', params: { id: post.id } });

  const tryIt = async () => {
    const w = workoutFromPost(p, title);
    if (w.exercises.length === 0) {
      toast.fail(new Error(i18n.nCmTryNone));
      return;
    }
    try {
      await addTemplate.mutateAsync({ name: w.name, type: 'community', exercises: w.exercises });
      toast.success(
        w.skipped > 0
          ? `${i18n.nCmTried} · ${i18n.nCmTriedSkipped.replace('{n}', String(w.skipped))}`
          : i18n.nCmTried,
      );
    } catch (e) {
      toast.fail(e as Error);
    }
  };

  const shareText = () => {
    const head = fillCopy(i18n.nCmShareText, { title, n: String(p.exerciseCount) });
    const body = p.exercises
      .map((e) => `• ${e.exerciseName}${e.weight > 0 ? ` — ${displayWeight(e.weight, wUnit)} ${wl} × ${e.reps}` : ` — ${e.sets} × ${e.reps}`}`)
      .join('\n');
    return `${head}\n\n${body}`;
  };

  return (
    <PostShell post={post} full={full} preview={preview} shareText={shareText}>
      {/* ── tên buổi + số ── */}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.stats}>
        {p.minutes ? <Stat icon={Clock} text={i18n.nCmMinutes.replace('{n}', String(p.minutes))} /> : null}
        {volume ? <Stat icon={Dumbbell} text={`${volume} ${wl}`} /> : null}
        {p.pr ? <Stat icon={Trophy} text="PR" tone={c.readinessYellow} /> : null}
      </View>

      {/* ── các bài tập ── */}
      <View style={styles.panel}>
        {lines.map((e, i) => (
          <View key={`${e.exerciseName}-${i}`} style={[styles.line, i > 0 && styles.lineRule]}>
            <Text style={styles.lineName} numberOfLines={1}>
              {e.exerciseName}
            </Text>
            <Text style={styles.lineValue}>
              {e.weight > 0 ? `${displayWeight(e.weight, wUnit)} ${wl} × ${e.reps}` : `${e.sets} × ${e.reps}`}
            </Text>
          </View>
        ))}
        {more > 0 ? (
          <Pressable accessibilityRole="button" onPress={openPost} style={[styles.line, styles.lineRule]}>
            <Text style={styles.moreText}>{fillCopy(i18n.nCmMoreExercises, { n: String(more) })}</Text>
            <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {!post.mine && !preview ? (
        <PressScale accessibilityRole="button" onPress={tryIt} disabled={addTemplate.isPending} style={styles.tryBtn}>
          <Icon icon={Copy} size={16} color={c.foreground} />
          <Text style={styles.tryText}>{i18n.nCmTry}</Text>
        </PressScale>
      ) : null}
    </PostShell>
  );
}

function Stat({ icon, text, tone }: { icon: typeof Clock; text: string; tone?: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.stat}>
      <Icon icon={icon} size={15} color={tone ?? c.mutedForeground} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  title: { ...type.title, color: c.foreground },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  /* Mặt lõm cho dữ liệu của thẻ — không phải thẻ lồng thẻ. */
  panel: {
    backgroundColor: m.inset.bg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
    paddingHorizontal: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  lineRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: m.inset.border },
  lineName: { ...type.body, color: c.foreground, flex: 1 },
  lineValue: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  moreText: { ...type.body, color: c.mutedForeground, flex: 1 },
  /* Viền mảnh: ở bản tối `secondary` (#18181b) gần trùng mặt thẻ, và đo trên
     bản dựng viên này trông như chữ trôi giữa thẻ. */
  tryBtn: {
    height: 44,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tryText: { ...type.headline, color: c.foreground },
}));
