import { StyleSheet, Text, View } from 'react-native';

import { HeroPanel, HeroRing } from '@/components/ascnd/hero-panel';
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
      ring={
        <HeroRing
          pct={kcal / target}
          from={colors.readinessGreen}
          to={colors.metricOrange}
          value={String(Math.round(kcal))}
          /* Còn lại, không phải mục tiêu. Mục tiêu là con số bạn đã biết; số
             còn lại là con số quyết định bữa tới ăn gì. */
          caption={`${left} ${i18n.nKcalLeft}`}
          captionColor={colors.mutedForeground}
        />
      }>
      <View style={styles.macros}>
        <Macro label={i18n.nProtein} grams={protein} tint={colors.metricBlue} />
        <Macro label={i18n.nCarbs} grams={carbs} tint={colors.metricOrange} />
        <Macro label={i18n.nFat} grams={fat} tint={colors.metricPurple} />
      </View>
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
  ml,
  targetMl,
  detailOpen,
  onToggleDetail,
}: {
  ml: number;
  targetMl: number;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
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
      ring={
        <HeroRing
          pct={ml / target}
          from={colors.metricBlue}
          to={colors.metricCyan}
          value={`${displayVolume(ml, unit)}`}
          caption={volumeLabel(unit)}
          captionColor={colors.mutedForeground}
        />
      }>
      {/* Chỉ một dòng: đã uống, mục tiêu, phần trăm. Không dựng một hàng giả
          cho có ba dòng như trang dinh dưỡng — nước có ĐÚNG một phép đo, và
          bịa thêm hai ô rỗng để cho cân đối là nói rằng có thứ chưa đo được. */}
      <Text style={styles.waterLine}>
        {displayVolume(ml, unit)} / {displayVolume(targetMl, unit)} {volumeLabel(unit)} · {pct}%
      </Text>
    </HeroPanel>
  );
}

const styles = StyleSheet.create({
  macros: { gap: spacing.sm },
  macro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroLabel: { ...type.footnote, color: colors.mutedForeground, flex: 1 },
  macroValue: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  waterLine: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
});
