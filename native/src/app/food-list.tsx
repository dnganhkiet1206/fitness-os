import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FoodCard, foodListStyles, RecentFoodCard } from '@/components/ascnd/food-cards';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMyFoods, useMyFoodsSorted, useRecentFoods } from '@/hooks/use-nutrition';

type Segment = 'mine' | 'recent';

/**
 * Every food you have, on one page.
 *
 * ── why this was rebuilt ──
 *
 * It was three stacked sections — My Foods, Yêu thích, Gần đây — written when
 * a food row was a bordered card, and it was left behind twice.
 *
 * First by the rows themselves. `FoodCard` stopped drawing its own border and
 * fill when the Nutrition tab moved to inset groups, because a row's frame
 * belongs to the group it sits in. This screen never got a group, so its foods
 * became bare lines of text floating on the page with an 8pt gap between them
 * and nothing to say where one ended.
 *
 * Second by the merge. Favourites are a *subset* of your foods, so listing them
 * as their own section drew the same food twice — the duplication that was
 * fixed on the tab, still live one tap away, on the screen that shows the most
 * rows and where it therefore costs the most.
 *
 * ── two segments, not three sections ──
 *
 * What is left is two genuinely different lists: foods you *saved*, and foods
 * you *logged*. Stacked, the second one lives below a list of up to two hundred
 * rows, which is not somewhere anybody scrolls to — and "Xem thêm" under Recent
 * on the tab landed at the top of My Foods, a link that answers a different
 * question than the one it was under. Segments make both one tap from the top,
 * and the `tab` param means each "Xem thêm" arrives where it was pointing.
 *
 * ── and a search box ──
 *
 * My Foods holds up to 200. A list that long with no way to narrow it is a
 * scroll, not a list. The filter is local — these rows are already here, and
 * the tab's search box is the one that queries the database.
 */
export default function FoodListScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [seg, setSeg] = useState<Segment>(tab === 'recent' ? 'recent' : 'mine');
  const [q, setQ] = useState('');

  const { data: myFoods } = useMyFoods();
  const mine = useMyFoodsSorted();
  const { data: recents } = useRecentFoods();

  // Names already saved — a recent row that is one hides its +
  const savedNames = useMemo(
    () => new Set((myFoods ?? []).map((f) => f.name.toLowerCase())),
    [myFoods],
  );

  const needle = q.trim().toLowerCase();
  const mineShown = useMemo(
    () =>
      needle.length === 0
        ? mine
        : mine.filter(
            (f) =>
              f.name.toLowerCase().includes(needle) ||
              (f.brand ?? '').toLowerCase().includes(needle),
          ),
    [mine, needle],
  );
  const recentsShown = useMemo(
    () =>
      needle.length === 0
        ? (recents ?? [])
        : (recents ?? []).filter((r) => r.food_name.toLowerCase().includes(needle)),
    [recents, needle],
  );

  const empty =
    needle.length > 0
      ? vi ? 'Không tìm thấy món nào' : 'No matches'
      : seg === 'mine'
        ? vi ? 'Chưa có thực phẩm nào được lưu' : 'No saved foods yet'
        : vi ? 'Chưa ghi món nào' : 'Nothing logged yet';

  const segments: { key: Segment; label: string; count: number }[] = [
    { key: 'mine', label: vi ? 'Của tôi' : 'Mine', count: mine.length },
    { key: 'recent', label: i18n.nutritionRecent, count: recents?.length ?? 0 },
  ];

  return (
    <Screen back title={vi ? 'Thực phẩm' : 'Foods'}>
      <View style={styles.segBar}>
        {segments.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ selected: seg === s.key }}
            style={[styles.seg, seg === s.key && styles.segActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setSeg(s.key);
            }}>
            <Text style={[styles.segText, seg === s.key && styles.segTextActive]}>{s.label}</Text>
            {/* The size of the list, before you switch to it. */}
            <Text style={[styles.segCount, seg === s.key && styles.segCountActive]}>{s.count}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tools}>
        <View style={styles.searchWrap}>
          <Icon icon={Search} size={15} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder={vi ? 'Lọc trong danh sách' : 'Filter this list'}
            placeholderTextColor={colors.mutedForeground}
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        {/* Only on the list it would add to. Nothing you press here can put a
            row into Recent — that list is written by logging a meal. */}
        {seg === 'mine' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.foodAddCustom}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/food-editor');
            }}>
            <Icon icon={Plus} size={16} color={colors.primaryForeground} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>

      {/*
        Keyed by segment so the swap is a 140ms fade rather than the new list
        appearing already scrolled into the old one's position. `FadeIn` and not
        a rise: nothing is arriving from off-screen, the page is already here.
      */}
      <Animated.View key={seg} entering={FadeIn.duration(140)}>
        {seg === 'mine' ? (
          mineShown.length > 0 ? (
            <View style={foodListStyles.group}>
              {mineShown.map((f, i) => (
                <View key={f.id}>
                  {i > 0 ? <View style={foodListStyles.sep} /> : null}
                  <FoodCard f={f} />
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>{empty}</Text>
          )
        ) : recentsShown.length > 0 ? (
          <View style={foodListStyles.group}>
            {recentsShown.map((r, i) => (
              <View key={`${r.food_name}-${i}`}>
                {i > 0 ? <View style={foodListStyles.sep} /> : null}
                <RecentFoodCard r={r} saved={savedNames.has(r.food_name.toLowerCase())} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{empty}</Text>
        )}
      </Animated.View>

      {/* What the + on a recent row does, said once under the list instead of
          on every row. */}
      {seg === 'recent' && recentsShown.length > 0 ? (
        <Text style={styles.hint}>
          {vi ? 'Bấm + để lưu món đã ghi vào danh sách của bạn.' : 'Tap + to save a logged food to your list.'}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,24,27,0.6)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  seg: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm - 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segActive: { backgroundColor: colors.accent },
  segText: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground },
  segTextActive: { color: colors.foreground, fontWeight: '600' },
  segCount: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  segCountActive: { color: colors.mutedForeground },

  tools: { flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.3)',
    paddingHorizontal: spacing.md - 4,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 15, height: '100%' },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },

  empty: {
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: glass.bg,
  },
  hint: { fontSize: 12, color: colors.mutedForeground, marginTop: -spacing.sm },
});
