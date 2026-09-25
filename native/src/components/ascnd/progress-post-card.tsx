import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { PostShell } from '@/components/ascnd/post-parts';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type FeedPost, type ProgressMetric, readProgressPayload } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { useUnits } from '@/hooks/use-units';
import { displayLength, displayWeight, lengthLabel, weightLabel } from '@/lib/units';

/**
 * Một bài Progress — "đây là hành trình của tôi" (concept mục 5, mockup màn 4).
 *
 * ── dựng từ đâu ──
 *
 * Payload do `build_progress_payload` dựng PHÍA SERVER từ dữ liệu của người
 * đăng, và chỉ gồm những chỉ số họ BẬT. Thẻ này vẽ đúng những gì có: không
 * có khoá `waist` thì không có ô vòng eo — không phải một ô "—".
 *
 * ── thứ tự ──
 *
 *   Tiến trình · N tuần   tên của hành trình.
 *   Từ a → b              chỉ số chính (cân nặng nếu được chia sẻ) — con
 *                         số một người đọc tìm đầu tiên.
 *   các ô thay đổi        mỗi chỉ số một ô: nhãn, chênh lệch, đường xu hướng
 *                         vẽ từ CHUỖI TUẦN THẬT, không phải một đường trang trí.
 *
 * Không ảnh trước/sau: chủ dự án chọn không tải ảnh ở MVP, và ảnh cơ thể là
 * loại dữ liệu nhạy cảm nhất.
 *
 * ── màu ──
 *
 * Mỗi chỉ số mang đúng màu nó ĐÃ có trong app: cân nặng là `metricBeige`
 * (đường cân nặng ở segment Cơ thể), vòng eo là `readinessYellowGraphic`
 * (đường Eo trong biểu đồ xu hướng số đo), sức mạnh là `metricOrange` (sắc
 * của hoạt động). Người xem không phải học lại màu nào. Chênh lệch KHÔNG tô
 * xanh/đỏ: tăng cân là tốt với người đang bulk và xấu với người đang cut, và
 * người xem không biết mục tiêu của người đăng.
 */
export function ProgressPostCard({ post, full, preview }: { post: FeedPost; full?: boolean; preview?: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { weight: wUnit, height: lUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const ll = lengthLabel(lUnit);
  const p = readProgressPayload(post.raw);

  const kg = (v: number) => displayWeight(v, wUnit);
  const cm = (v: number) => displayLength(v, lUnit);
  const tiles: { key: string; label: string; m: ProgressMetric; fmt: (v: number) => number; unit: string; color: string }[] = [];
  if (p.weight) tiles.push({ key: 'w', label: i18n.nPgWeight, m: p.weight, fmt: kg, unit: wl, color: c.metricBeige });
  if (p.waist) tiles.push({ key: 'waist', label: i18n.nPgWaist, m: p.waist, fmt: cm, unit: ll, color: c.readinessYellowGraphic });
  if (p.lift) tiles.push({ key: 'lift', label: p.lift.name, m: p.lift, fmt: kg, unit: wl, color: c.metricOrange });

  const lead = tiles[0];
  const title = i18n.nPgTitle.replace('{n}', String(p.weeks));

  const shareText = () =>
    [
      i18n.nPgShareText.replace('{n}', String(p.weeks)),
      ...tiles.map((t) => `• ${t.label}: ${t.fmt(t.m.start)} → ${t.fmt(t.m.end)} ${t.unit}`),
    ].join('\n');

  return (
    <PostShell post={post} full={full} preview={preview} shareText={shareText}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {lead ? (
          <Text style={styles.lead}>
            {i18n.nPgFromTo
              .replace('{a}', `${lead.fmt(lead.m.start)} ${lead.unit}`)
              .replace('{b}', `${lead.fmt(lead.m.end)} ${lead.unit}`)}
          </Text>
        ) : null}
      </View>

      <View style={styles.tiles}>
        {tiles.map((t) => {
          const d = Math.round((t.fmt(t.m.end) - t.fmt(t.m.start)) * 10) / 10;
          return (
            <View
              key={t.key}
              style={styles.tile}
              accessible
              accessibilityLabel={`${t.label}: ${t.fmt(t.m.start)} → ${t.fmt(t.m.end)} ${t.unit}`}>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {t.label}
              </Text>
              <Text style={styles.tileValue} numberOfLines={1}>
                {d > 0 ? '+' : ''}
                {d} {t.unit}
              </Text>
              <Spark values={t.m.series.map(t.fmt)} color={t.color} />
            </View>
          );
        })}
      </View>
    </PostShell>
  );
}

/** Đường xu hướng từ chuỗi tuần thật. Một điểm thì không vẽ (không có hướng). */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <View style={{ height: SPARK_H }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 100;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${SPARK_H - 3 - ((v - min) / span) * (SPARK_H - 6)}`)
    .join(' ');
  return (
    <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${W} ${SPARK_H}`} preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

const SPARK_H = 28;

const stylesFor = makeStyles((c, m) => ({
  head: { gap: 2 },
  title: { ...type.title, color: c.foreground },
  lead: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /*
    Xuống hàng thay vì bóp (#48). `flex: 1` chia ba ô đều nhau ở MỌI bề
    ngang, và ở 320 mỗi ô còn 51px cho chữ: "+3.3 kg" cần 57, nên bài đăng
    để khoe tiến bộ hiện "+3.3…", "-2.1 …", "+15 …" — cắt đúng con số. Đo
    bằng lượt quét hẹp của `live.mjs`.

    `flexBasis` 92: vùng ô rộng (bề ngang − 74). Ở 375 là 301 → ba ô 95px,
    vẫn một hàng; ở 402 là 104px. Ở 320 là 246 → không đủ ba ô 92, nên hai
    ô một hàng và ô thứ ba trải hết hàng dưới. Ô hẹp nhất còn 92 − 24 = 68px
    cho chữ — đủ "+12.5 kg".
  */
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Mặt lõm cho dữ liệu của thẻ, như bảng bài tập của thẻ Workout. */
  tile: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 0,
    gap: 4,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: m.inset.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
  },
  tileLabel: { ...type.footnote, color: c.mutedForeground },
  tileValue: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
}));
