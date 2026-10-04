import { ChefHat, ChevronRight, Dumbbell, TrendingUp } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type UsefulPost, useUsefulThisWeek } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';
import { nav } from '@/lib/nav';
import { readRecipePayload } from '@/lib/recipe-post';

/**
 * "Hữu ích tuần này" ở đầu tab Khám phá (A 04/10, concept §19: feed không nên
 * chỉ dựa vào lượt thích).
 *
 * Tối đa ba bài của 7 ngày qua mà NGƯỜI KHÁC đã thử, lưu và bàn luận nhiều
 * nhất — điểm do server giữ (20261007230000), không tính hành động của chính
 * tác giả. Feed theo thời gian bên dưới giữ nguyên: khối này là lối tắt tới
 * thứ đáng xem, không thay feed.
 *
 * Mỗi hàng nói VÌ SAO bài có mặt ("4 người thử · 6 lượt lưu") thay vì một con
 * số điểm: điểm là chuyện của server, lý do là thứ người đọc dùng để quyết có
 * mở hay không. Chưa bài nào đủ ngưỡng thì không vẽ gì — một khối rỗng ở đầu
 * Khám phá chỉ đẩy feed xuống.
 */
export function UsefulThisWeek() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const q = useUsefulThisWeek();

  if (!q.data || q.data.length === 0) return null;

  const titleOf = (p: UsefulPost) => {
    const firstLine = p.caption.split('\n')[0]?.trim() ?? '';
    if (p.kind === 'workout') return p.payload.title?.trim() || firstLine || i18n.nSegTraining;
    if (p.kind === 'recipe') return readRecipePayload(p.raw).title || firstLine || i18n.nUpRecipe;
    return firstLine || i18n.nUpProgress;
  };
  /* Hai tín hiệu mạnh nhất, theo đúng thứ tự trọng số của server. */
  const whyOf = (p: UsefulPost) =>
    [
      p.tries > 0 ? fillCopy(i18n.nPgUsefulTries, { n: p.tries }) : null,
      p.save_count > 0 ? fillCopy(i18n.nPgUsefulSaves, { n: p.save_count }) : null,
      p.comment_count > 0 ? fillCopy(i18n.nPgUsefulComments, { n: p.comment_count }) : null,
      p.like_count > 0 ? fillCopy(i18n.nPgUsefulLikes, { n: p.like_count }) : null,
    ]
      .filter((x): x is string => !!x)
      .slice(0, 2)
      .join(' · ');

  return (
    <View testID="useful-this-week">
      <GlassCard style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          {i18n.nPgUsefulTitle}
        </Text>
        <Text style={styles.sub}>{i18n.nPgUsefulSub}</Text>
        <View style={styles.rows}>
          {q.data.map((p, i) => {
            const title = titleOf(p);
            const who = p.author ? `@${p.author.handle}` : '';
            const why = whyOf(p);
            const glyph = p.kind === 'recipe' ? ChefHat : p.kind === 'progress' ? TrendingUp : Dumbbell;
            return (
              <PressScale
                key={p.id}
                testID={`useful-${p.id}`}
                accessibilityRole="button"
                accessibilityLabel={[title, who, why].filter(Boolean).join(', ')}
                onPress={() => nav.push({ pathname: '/community-post', params: { id: p.id } })}
                style={[styles.row, i > 0 && styles.rowRule]}>
                <View style={styles.glyph}>
                  <Icon icon={glyph} size={18} color={c.mutedForeground} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  {/* Handle một dòng (cắt được — là nội dung); lý do xuống
                      dòng tự do — là câu của app, và là phần người đọc cần. */}
                  {who ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {who}
                    </Text>
                  ) : null}
                  <Text style={styles.why}>{why}</Text>
                </View>
                <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
              </PressScale>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.xs },
  title: { ...type.headline, color: c.foreground },
  sub: { ...type.footnote, color: c.mutedForeground },
  rows: { marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
  rowRule: { borderTopWidth: 1, borderTopColor: c.border },
  glyph: { width: 24, alignItems: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.body, color: c.foreground, fontWeight: '600' },
  meta: { ...type.footnote, color: c.mutedForeground },
  why: { ...type.footnote, color: c.foreground },
}));
