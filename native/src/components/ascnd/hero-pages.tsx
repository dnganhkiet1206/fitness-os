import { Droplets, Flame, Moon, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { HeroPanel, HeroRing, HeroTiles } from '@/components/ascnd/hero-panel';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { displayVolume, volumeLabel } from '@/lib/units';

/**
 * Nutrition and water, as pages of the hero deck.
 *
 * ── why they are not the cards that already exist ──
 *
 * `NutritionCard` and `WaterWidget` are LIST cards: a small ring beside a row
 * of text, sized to sit among a dozen others. Dropped into the deck they were
 * two pages of a different shape, and — because `card-deck.tsx` makes the stage
 * as tall as its tallest page — the taller one left a hole under the readiness
 * ring. Measured on the shipped build: 115pt of empty between the chevron and
 * the pips.
 *
 * They still exist and are still right where they are: somebody who moves
 * nutrition back into a group in edit mode gets the list card again. These are
 * the same numbers wearing the hero's shell.
 *
 * ── one number in the ring, the rest behind the chevron ──
 *
 * The same rule the other two pages follow, and the reason the deck works at
 * all: the top half of Today answers ONE question per page. Macros matter, and
 * they are one tap away — but a ring with four numbers around it is a card, and
 * a card is what this stopped being.
 */
export function NutritionHero({
  onOpenDetail,
  kcal,
  calorieTarget,
  protein,
  carbs,
  fat,
  detailOpen,
  onToggleDetail,
}: {
  kcal: number;
  calorieTarget: number;
  protein: number;
  carbs: number;
  fat: number;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const i18n = useI18n();
  const target = calorieTarget > 0 ? calorieTarget : 1;
  const left = Math.max(0, Math.round(target - kcal));

  return (
    <HeroPanel
      title={i18n.nKcalToday}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      a11yDetail={i18n.nKcalToday}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={kcal / target}
          from={colors.readinessGreen}
          to={colors.metricOrange}
          /* Ngọn lửa cam — đúng biểu tượng và đúng màu mà thẻ dinh dưỡng cũ
             dùng, để cùng một phép đo không đổi mặt khi nó đổi chỗ. */
          icon={Flame}
          iconColor={colors.metricOrange}
          value={Math.round(kcal)}
          /* Còn lại, không phải mục tiêu. Mục tiêu là con số bạn đã biết; số
             còn lại là con số quyết định bữa tới ăn gì. */
          caption={`${left} ${i18n.nKcalLeft}`}
          captionColor={colors.mutedForeground}
        />
      }>
      <HeroTiles
        tiles={[
          { label: i18n.nProtein, value: String(Math.round(protein)), unit: 'g', color: colors.metricBlue },
          { label: i18n.nCarbs, value: String(Math.round(carbs)), unit: 'g', color: colors.metricOrange },
          { label: i18n.nFat, value: String(Math.round(fat)), unit: 'g', color: colors.metricPurple },
          { label: i18n.nKcalToday, value: String(Math.round(kcal)), unit: `/ ${Math.round(target)}` },
        ]}
      />
    </HeroPanel>
  );
}

function Macro({ label, grams, tint }: { label: string; grams: number; tint: string }) {
  return (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: tint }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{Math.round(grams)}g</Text>
    </View>
  );
}

export function WaterHero({
  onOpenDetail,
  ml,
  targetMl,
  detailOpen,
  onToggleDetail,
}: {
  ml: number;
  targetMl: number;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const i18n = useI18n();
  const { unit } = useVolumeUnit();
  const target = targetMl > 0 ? targetMl : 1;
  const pct = Math.round((ml / target) * 100);

  return (
    <HeroPanel
      title={i18n.nWater}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      a11yDetail={i18n.nWater}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={ml / target}
          from={colors.metricBlue}
          to={colors.metricCyan}
          /* Giọt nước xanh #3ba6ff — cùng icon và cùng màu thẻ nước cũ. */
          icon={Droplets}
          iconColor={colors.metricBlue}
          value={displayVolume(ml, unit)}
          /* `displayVolume` làm tròn ml về số nguyên và oz về một chữ số thập
             phân — nên số lẻ chỉ tồn tại ở oz. */
          decimals={unit === 'oz' ? 1 : 0}
          caption={volumeLabel(unit)}
          captionColor={colors.mutedForeground}
        />
      }>
      {/*
        Hai ô, không phải bốn.

        Nước có đúng một phép đo và một mục tiêu. Bịa thêm hai ô cho cân đối với
        trang dinh dưỡng là nói rằng có thứ chưa đo được — lưới này co theo số
        phép đo có thật, và hàng lẻ nằm bên trái chứ không bị kéo giãn.
      */}
      <HeroTiles
        tiles={[
          {
            label: i18n.nWater,
            value: String(displayVolume(ml, unit)),
            unit: `/ ${displayVolume(targetMl, unit)} ${volumeLabel(unit)}`,
            color: colors.metricBlue,
          },
          { label: '%', value: String(pct), unit: `/ 100`, color: colors.metricCyan },
        ]}
      />
    </HeroPanel>
  );
}

const styles = StyleSheet.create({
  emptyLine: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', lineHeight: 19 },
  macro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroLabel: { ...type.footnote, color: colors.mutedForeground, flex: 1 },
  macroValue: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
});


/**
 * Giấc ngủ, dạng hero.
 *
 * Vòng tròn là GIỜ NGỦ so với mục tiêu — không phải điểm chất lượng. Hai con số
 * đều thật, nhưng chỉ một cái là thứ bạn tác động được tối nay: điểm là hệ quả,
 * giờ là quyết định. Điểm nằm ở phần chi tiết, cạnh giờ đi ngủ và giờ dậy đã
 * tạo ra nó.
 */
export function SleepHero({
  totalMin,
  targetHours,
  quality,
  bedtime,
  waketime,
  detailOpen,
  onToggleDetail,
  onOpenDetail,
}: {
  totalMin: number;
  targetHours: number;
  quality: number | null;
  bedtime?: string | null;
  waketime?: string | null;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const i18n = useI18n();
  const targetMin = targetHours > 0 ? targetHours * 60 : 1;
  const hours = Math.round((totalMin / 60) * 10) / 10;
  const clock = (v?: string | null) => (v ? String(v).slice(11, 16) : '—');

  return (
    <HeroPanel
      title={i18n.nSleep}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      a11yDetail={i18n.nSleep}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={totalMin / targetMin}
          from={colors.metricPurple}
          to={colors.metricBlue}
          value={hours}
          decimals={1}
          caption="h"
          captionColor={colors.mutedForeground}
          icon={Moon}
          iconColor={colors.metricPurple}
        />
      }>
      <HeroTiles
        tiles={[
          { label: i18n.nSleep, value: String(hours), unit: `/ ${targetHours} h`, color: colors.metricPurple },
          ...(quality != null
            ? [{ label: i18n.nQuality, value: String(Math.round(quality)), unit: '/100', color: colors.metricBlue }]
            : []),
          { label: i18n.nBedtime, value: clock(bedtime), unit: '' },
          { label: i18n.nWaketime, value: clock(waketime), unit: '' },
        ]}
      />
    </HeroPanel>
  );
}


/**
 * Một trang hero chưa có số.
 *
 * ── lỗi nó sửa ──
 *
 * Trang sẵn sàng khi chưa đủ dữ liệu vẽ ra một `GlassCard` ngắn, trong khi bốn
 * trang kia là vỏ hero cao ~400pt. `card-deck.tsx` cho sân khấu cao bằng trang
 * CAO NHẤT, nên trang ngắn để lại một khoảng đen — đo trên máy: khoảng 250pt
 * giữa dòng chữ và hàng pip.
 *
 * Trạng thái rỗng phải mang đúng hình dạng của trạng thái đầy. Nếu không thì
 * "chưa có dữ liệu" trông giống hệt "màn hình bị hỏng", và đó là câu người dùng
 * đọc được đầu tiên khi mở app lần đầu.
 *
 * ── vòng tròn vẫn vẽ, chỉ là rỗng ──
 *
 * Không phải một khối skeleton nhấp nháy: vòng tròn ở đây KHÔNG chờ dữ liệu về
 * trong vài giây, nó chờ ba ngày ghi chép. Một hiệu ứng "đang tải" cho một thứ
 * cần ba ngày là một lời hứa sai. Nên nó là một vòng tròn thật, rỗng, với dấu
 * gạch ở giữa và câu giải thích ngay bên dưới — hình dạng của thứ sắp có, cộng
 * lý do nó chưa có.
 */
export function EmptyHero({
  title,
  message,
  tint,
  icon,
  detailOpen,
  onToggleDetail,
  onOpenDetail,
}: {
  title: string;
  message: string;
  tint: string;
  icon?: LucideIcon;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  onOpenDetail?: () => void;
}) {
  const i18n = useI18n();
  return (
    <HeroPanel
      title={title}
      detailOpen={detailOpen}
      onToggleDetail={onToggleDetail}
      a11yDetail={title}
      more={onOpenDetail ? { label: i18n.nHeroMore, onPress: onOpenDetail } : undefined}
      ring={
        <HeroRing
          pct={0}
          from={tint}
          to={tint}
          value={0}
          caption="—"
          captionColor={colors.mutedForeground}
          icon={icon}
          iconColor={colors.mutedForeground}
        />
      }>
      <Text style={styles.emptyLine}>{message}</Text>
    </HeroPanel>
  );
}
