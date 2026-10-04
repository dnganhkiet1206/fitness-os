import { Dumbbell, Ruler } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { spacing, type } from '@/constants/ascnd';
import { BodyScale } from '@/constants/app-icons';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useProgressJourney } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { useUnits } from '@/hooks/use-units';
import { fillCopy } from '@/lib/copy-fill';
import { getLocale } from '@/lib/i18n';
import type { JourneyLine } from '@/lib/progress-journey';
import { displayLength, displayWeight, lengthLabel, weightLabel } from '@/lib/units';

/**
 * Thẻ "Hành trình" trên hồ sơ cộng đồng (đề xuất 3): mỗi chỉ số một dòng, từ số
 * đầu của lần chia sẻ đầu tiên tới số cuối của lần mới nhất, kèm chênh lệch.
 *
 * Chênh lệch không mang màu tốt/xấu: tăng cân là mục tiêu của người này và là
 * lo ngại của người kia, và app không biết mục tiêu của người được xem. Màu
 * thuộc về chỉ số (cùng màu với ô của thẻ bài Progress), không thuộc về chiều.
 *
 * Không có gì để gộp (dưới hai lần chia sẻ cùng một chỉ số) thì không vẽ gì: bài
 * Progress bên dưới đã tự nói đầu/cuối của nó.
 */
export function ProgressJourney({ userId }: { userId: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit, height: lUnit } = useUnits();
  const j = useProgressJourney(userId);

  if (!j.data || j.data.lines.length === 0 || !j.data.firstAt || !j.data.lastAt) return null;

  const locale = getLocale(lang);
  /* Năm chỉ hiện khi khoảng không nằm gọn trong năm nay — ở 320 chữ thừa là
     dòng thừa. */
  const thisYear = new Date().getFullYear();
  const sameYear = new Date(j.data.firstAt).getFullYear() === thisYear && new Date(j.data.lastAt).getFullYear() === thisYear;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString(locale);

  const row = (l: JourneyLine) => {
    const isLen = l.key === 'waist';
    const fmt = (v: number) => (isLen ? displayLength(v, lUnit) : displayWeight(v, wUnit));
    const unit = isLen ? lengthLabel(lUnit) : weightLabel(wUnit);
    const a = fmt(l.start);
    const b = fmt(l.end);
    const d = Math.round((b - a) * 10) / 10;
    const delta = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${num(Math.abs(d))} ${unit}`;
    const label = l.key === 'weight' ? i18n.nPgWeight : l.key === 'waist' ? i18n.nPgWaist : (l.name ?? '');
    const color = l.key === 'weight' ? c.metricBeige : l.key === 'waist' ? c.readinessYellowGraphic : c.metricOrange;
    const icon = l.key === 'weight' ? BodyScale : l.key === 'waist' ? Ruler : Dumbbell;
    return (
      <View key={l.key} style={styles.row} accessible accessibilityLabel={`${label}: ${num(a)} → ${num(b)} ${unit}, ${delta}`}>
        {/* Hai tầng: tên chỉ số (có thể dài — tên bài tập) một dòng riêng, số
            liệu và chênh lệch một dòng. Ở 320 bản một-dòng cắt tên thành
            "Cân …" và đẩy đơn vị xuống dòng (ảnh dựng đầu tiên). */}
        <View style={styles.icon}>
          <Icon icon={icon} size={16} color={color} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          <View style={styles.figures}>
            <Text style={styles.values}>
              {num(a)} → {num(b)} {unit}
            </Text>
            <Text style={styles.delta}>{delta}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View testID="progress-journey">
    <GlassCard style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {i18n.nPgJourneyTitle}
      </Text>
      <Text style={styles.sub}>
        {fillCopy(i18n.nPgJourneySub, { n: j.data.posts, from: day(j.data.firstAt), to: day(j.data.lastAt) })}
      </Text>
      <View style={styles.rows}>{j.data.lines.map(row)}</View>
    </GlassCard>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.xs },
  title: { ...type.headline, color: c.foreground },
  sub: { ...type.footnote, color: c.mutedForeground },
  rows: { gap: spacing.md, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  icon: { paddingTop: 2 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...type.footnote, color: c.mutedForeground },
  figures: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  values: { ...type.headline, ...type.mono, color: c.foreground },
  delta: { ...type.footnote, ...type.mono, color: c.mutedForeground },
}));
