import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Dumbbell, Plus, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { EmptyState } from '@/components/ascnd/empty-state';
import { Screen } from '@/components/ascnd/screen';
import { newestFirst, TemplateList } from '@/components/ascnd/template-list';
import { toast } from '@/lib/toast';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { weightLabel } from '@/lib/units';

/**
 * Every saved workout — where the Workouts tab's "See all" leads.
 *
 * ── why this is a screen and not just more rows on the tab ──
 *
 * The rows themselves would not justify it: the same component draws them here
 * and there, and pushing a screen to show three more of something is exactly
 * the cost this project has argued against elsewhere.
 *
 * What justifies it is the search. Past a dozen routines the question stops
 * being "what have I got" and becomes "where is the one called Legs B", and a
 * tab that is also showing a body-part grid, a log button and two weeks of
 * sessions has no room to answer that. It is the same relationship the exercise
 * library's "See all" has with its ten tiles — the link earns its place by
 * leading somewhere that does more, not somewhere that shows more.
 *
 * Order is newest first, the same as the tab, so the row that was at the top
 * there is the row at the top here. A list that reshuffles when you open it
 * makes you find your place twice.
 */
export default function TemplatesScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const { data: templates, isError: failed, refetch, isFetching } = useWorkoutTemplates();
  const del = useDeleteWorkoutTemplate();

  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return newestFirst(templates ?? []).filter(
      (t) => !q || t.name.toLowerCase().includes(q) || (t.type ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const confirmDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nDeleteTemplate, '', [
      { text: i18n.nCancel, style: 'cancel' },
      {
        text: i18n.nDeleteTemplate,
        style: 'destructive',
        onPress: () => del.mutate(id, { onError: (e: Error) => toast.fail(e) }),
      },
    ]);
  };

  return (
    <Screen refreshable title={vi ? 'Danh sách buổi tập' : 'Workout list'}>
      {/*
        The search box is only drawn once there is enough to search. On four
        routines it is a control that costs a tap to dismiss and finds nothing
        you could not already see.
      */}
      {(templates?.length ?? 0) > 6 ? (
        <View style={styles.searchBox}>
          <Icon icon={Search} size={16} color={c.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder={vi ? 'Tìm buổi tập…' : 'Search workouts…'}
            placeholderTextColor={c.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yClose}
              hitSlop={8}
              onPress={() => setSearch('')}>
              <Icon icon={X} size={15} color={c.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {shown.length > 0 ? (
        <TemplateList
          templates={shown}
          wUnit={wUnit}
          wl={wl}
          i18n={i18n}
          onDelete={confirmDelete}
        />
      ) : failed ? (
        <LoadFailed i18n={i18n} onRetry={() => refetch()} busy={isFetching} />
      ) : (
        /* Two different emptinesses. Nothing saved at all is an invitation to
           build one; nothing *matching* is a search that missed, and offering
           to create a workout there would answer a question nobody asked. */
        <EmptyState
          icon={Dumbbell}
          title={
            search.trim()
              ? vi
                ? `Không có buổi tập nào khớp “${search.trim()}”`
                : `No workout matches “${search.trim()}”`
              : i18n.workoutsNoTemplates
          }
          /* The distinction the comment above draws, expressed rather than
             described: a search that missed gets no button, because creating a
             workout is not the answer to "that word matched nothing". */
          action={
            search.trim()
              ? undefined
              : { label: i18n.workoutsCreateNew, onPress: () => nav.push('/workout-builder') }
          }
        />
      )}

      <PressScale
        accessibilityRole="button"
        style={styles.createBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          nav.push('/workout-builder');
        }}>
        <Icon icon={Plus} size={15} color={c.primaryForeground} strokeWidth={2.5} />
        <Text style={styles.createText}>{i18n.workoutsCreateNew}</Text>
      </PressScale>
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
  },
  searchInput: { flex: 1, color: c.foreground, fontSize: 16 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: c.primary,
  },
  createText: { ...type.headline, color: c.primaryForeground },
}));
