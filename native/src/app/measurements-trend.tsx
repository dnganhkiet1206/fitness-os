import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ruler } from 'lucide-react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { EmptyState } from '@/components/ascnd/empty-state';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { LineChart } from '@/components/ascnd/line-chart';
import { TrendDelta } from '@/components/ascnd/trend-delta';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMeasurementHistory } from '@/hooks/use-today-data';
import { getLocale } from '@/lib/i18n';
import { localDateStr } from '@/lib/local-date';

/*
  P1-6 (DE-XUAT-2): 12 body measurements were logged and never shown back.
  This is the read side — each field gets a sparkline plus the delta vs the
  oldest point in view, so a shrinking waist is visible instead of theoretical.
*/

const FIELDS = [
  { key: 'neck_cm', labelKey: 'measureNeck', unit: 'cm' },
  { key: 'shoulders_cm', labelKey: 'measureShoulders', unit: 'cm' },
  { key: 'chest_cm', labelKey: 'measureChest', unit: 'cm' },
  { key: 'waist_cm', labelKey: 'measureWaist', unit: 'cm' },
  { key: 'hips_cm', labelKey: 'measureHips', unit: 'cm' },
  { key: 'bicep_left_cm', labelKey: 'measureBicepL', unit: 'cm' },
  { key: 'bicep_right_cm', labelKey: 'measureBicepR', unit: 'cm' },
  { key: 'thigh_left_cm', labelKey: 'measureThighL', unit: 'cm' },
  { key: 'thigh_right_cm', labelKey: 'measureThighR', unit: 'cm' },
  { key: 'calf_left_cm', labelKey: 'measureCalfL', unit: 'cm' },
  { key: 'calf_right_cm', labelKey: 'measureCalfR', unit: 'cm' },
  { key: 'body_fat_pct', labelKey: 'measureBodyFat', unit: '%' },
] as const;

export default function MeasurementsTrendScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const locale = getLocale(lang);
  const vi = lang === 'vi';
  const { data: rows, isError, refetch, isRefetching } = useMeasurementHistory(24);

  const series = useMemo(() => {
    const list = rows ?? [];
    return FIELDS.map((f) => {
      const points = list
        .map((r) => {
          const v = Number((r as Record<string, unknown>)[f.key]);
          if (!Number.isFinite(v) || v <= 0) return null;
          return { t: new Date(String((r as Record<string, unknown>).measured_at)).getTime(), v };
        })
        .filter((p): p is { t: number; v: number } => p != null);
      if (points.length < 2) return null;
      const first = points[0].v;
      const last = points[points.length - 1].v;
      const delta = Math.round((last - first) * 10) / 10;
      return {
        ...f,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: (i18n as any)[f.labelKey] as string,
        points: points.map((p) => ({
          /* Local date: `toISOString()` is UTC — a measurement logged when
             local date != UTC date plots a day early. */
          date: localDateStr(new Date(p.t)),
          value: p.v,
        })),
        last,
        delta,
        dir: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
      } as const;
    }).filter((s): s is NonNullable<typeof s> => s != null);
  }, [rows, i18n]);

  return (
    <Screen refreshable back title={i18n.nCxBodyMeasurements}>
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : series.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title={i18n.nCxNoMeasurements}
          hint={i18n.nCxNoMeasurementsHint}
        />
      ) : (
        <View style={styles.body}>
          {series.map((s) => (
            <GlassCard key={s.key} style={styles.card}>
              <View style={styles.head}>
                <View>
                  <Text style={styles.label}>{s.label}</Text>
                  <Text style={styles.value}>
                    {s.last}
                    {s.unit}
                  </Text>
                </View>
                <TrendDelta dir={s.dir as 'up' | 'down' | 'flat'} color={c.foreground}>
                  {`${s.delta > 0 ? '+' : ''}${s.delta}${s.unit}`}
                </TrendDelta>
              </View>
              <LineChart
                points={s.points}
                height={64}
                labels={false}
                grid={false}
                locale={locale}
                emptyLabel=""
              />
            </GlassCard>
          ))}
        </View>
      )}
    </Screen>
  );
}

const stylesFor = makeStyles((c) =>
  StyleSheet.create({
    body: { gap: spacing.md, paddingBottom: spacing.xl },
    card: { padding: spacing.lg },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    label: { ...type.caption, color: c.glassMuted },
    value: { ...type.title2, color: c.foreground, fontVariant: ['tabular-nums'] },
  }),
);
