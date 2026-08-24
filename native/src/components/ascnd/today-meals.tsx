import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronDown, Minus, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { toast } from '@/lib/toast';
import {
  useDeleteMealItem,
  useUpdateMealItemServings,
  type LoggedItem,
  type LoggedMeal,
} from '@/hooks/use-nutrition';

/**
 * What was eaten today, meal by meal.
 *
 * The Nutrition tab used to open on a food *library* — search, my foods,
 * favourites, recents — which is a useful thing that answers a question nobody
 * arrives with. Coming from the dashboard's calorie ring you want to know what
 * you have eaten, and the page could not tell you. This is that answer, and it
 * is the first thing on the tab now.
 *
 * ── grouped by meal, not flattened into foods ──
 *
 * A flat list of every item eaten would be shorter to build and worse to read:
 * three eggs, a coffee and a slice of bread are *breakfast*, and losing that
 * loses the shape of the day. Each entry keeps its own totals on the right, so
 * "what did lunch cost me" is answerable without adding anything up.
 *
 * ── one card per meal, and closed until asked ──
 *
 * Every item was listed under its meal, always. Eight foods across the day is
 * an ordinary Tuesday and it turned the diary into a page of scrolling before
 * you could reach anything else on the tab. So a meal is now a **summary line**
 * — name, what it cost, how many items are inside — and the items appear when
 * you tap it. The day's shape stays readable at a glance, and the detail is one
 * tap away rather than always in the way.
 *
 * Meals of the same type are also **merged**: logging breakfast twice used to
 * draw two "Breakfast" cards that each told half the story. One card now, with
 * the totals added up and the entry count beside the item count, so `1,632
 * kcal · 2 meals · 8 items` is the whole of breakfast in one line.
 */

/** One duration and one curve for everything an opening card moves: its
 *  height, its chevron and its rows. Three timings would drift apart. */
const OPEN_MS = 260;
const OPEN_EASE = Easing.out(Easing.cubic);

/** the six `meal_type` values `log-meal.tsx` writes, in the order a day runs */
const ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'];

/** one meal type's whole day: totals, every item, and how many entries made it */
interface MealGroup {
  type: string;
  entries: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: LoggedItem[];
}

/**
 * Merge the day's logged meals by type, in the order a day runs.
 *
 * Rounding happens once, on the sum, rather than per entry — adding rounded
 * halves is how a card ends up disagreeing with the ring above it.
 */
function groupByType(meals: LoggedMeal[]): MealGroup[] {
  const by = new Map<string, MealGroup>();
  for (const m of meals) {
    const g = by.get(m.meal_type) ?? {
      type: m.meal_type,
      entries: 0,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      items: [],
    };
    g.entries += 1;
    g.kcal += m.kcal;
    g.protein_g += m.protein_g;
    g.carbs_g += m.carbs_g;
    g.fat_g += m.fat_g;
    g.items.push(...m.items);
    by.set(m.meal_type, g);
  }
  return [...by.values()]
    .map((g) => ({
      ...g,
      kcal: Math.round(g.kcal),
      protein_g: Math.round(g.protein_g),
      carbs_g: Math.round(g.carbs_g),
      fat_g: Math.round(g.fat_g),
    }))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

export function TodayMeals({
  meals,
  i18n,
  lang,
}: {
  meals: LoggedMeal[];
  i18n: ReturnType<typeof useI18n>;
  lang: 'vi' | 'en';
}) {
  const label: Record<string, string> = {
    breakfast: i18n.nBreakfast,
    lunch: i18n.nLunch,
    dinner: i18n.nDinner,
    snack: i18n.nSnack,
    preworkout: i18n.nPreWorkout,
    postworkout: i18n.nPostWorkout,
  };

  const groups = groupByType(meals);

  const del = useDeleteMealItem();
  const edit = useUpdateMealItemServings();
  const [editing, setEditing] = useState<LoggedItem | null>(null);

  /**
   * Deleting asks first, and asks with the food's name in the question.
   *
   * "Are you sure?" is a question nobody can answer wrongly *or* correctly —
   * it does not say what is about to go. Naming the row means a mistap on the
   * wrong line is caught by reading the alert rather than by noticing the ring
   * move afterwards.
   */
  const confirmDelete = (it: LoggedItem) => {
    Alert.alert(
      i18n.nItemDelete,
      i18n.nItemDeleteMsg.replace('{name}', it.food_name),
      [
        { text: i18n.cancel, style: 'cancel' },
        {
          text: i18n.delete,
          style: 'destructive',
          onPress: () =>
            del.mutate(
              { itemId: it.id, entryId: it.entry_id },
              {
                onSuccess: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  toast.success(i18n.deleted);
                },
                onError: (e: Error) => toast.fail(e),
              },
            ),
        },
      ],
    );
  };

  /*
    An empty list here always means an empty day.

    It did not used to. A failed read also left `meals` empty, so "Nothing
    logged today — tap to log a meal" was said about days the app simply could
    not read — and the person acts on it either way, logging a meal they already
    logged and leaving the ring to count it twice. The caller now decides: the
    Nutrition tab does not mount this component at all when its query failed,
    and shows one notice for the whole segment instead.
  */
  if (groups.length === 0) {
    return (
      <PressScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-meal');
        }}>
        <GlassCard style={styles.empty}>
          <Icon icon={UtensilsCrossed} size={20} />
          <Text style={styles.emptyText}>
            {lang === 'vi'
              ? 'Chưa ghi bữa nào hôm nay — nhấn để ghi'
              : 'Nothing logged today — tap to log a meal'}
          </Text>
        </GlassCard>
</PressScale>
    );
  }

  return (
    <View style={styles.list}>
      {/* No "log a meal" button down here any more — it was a full-width bar
          at the end of the longest list on the tab, and it offered only the
          manual form. The floating ⊕ (`LogMealFab`) costs no height and opens
          all four ways in. */}
      {groups.map((g) => (
        <MealCard
          key={g.type}
          g={g}
          label={label[g.type] ?? g.type}
          i18n={i18n}
          onEdit={setEditing}
          onDelete={confirmDelete}
        />
      ))}

      <EditServingsSheet
        item={editing}
        i18n={i18n}
        busy={edit.isPending}
        onClose={() => setEditing(null)}
        onSave={(servings) => {
          if (!editing) return;
          if (servings === editing.servings) {
            setEditing(null);
            return;
          }
          edit.mutate(
            { itemId: editing.id, entryId: editing.entry_id, servings },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.nItemUpdated);
                setEditing(null);
              },
              onError: (e: Error) => toast.fail(e),
            },
          );
        }}
      />
    </View>
  );
}

/**
 * One meal, closed by default.
 *
 * The header alone answers "what did breakfast cost me"; the items are behind
 * the chevron. Open state is local to the card, so opening lunch does not close
 * breakfast, and nothing above it re-renders when you tap.
 */
function MealCard({
  g,
  label,
  i18n,
  onEdit,
  onDelete,
}: {
  g: MealGroup;
  label: string;
  i18n: ReturnType<typeof useI18n>;
  onEdit: (it: LoggedItem) => void;
  onDelete: (it: LoggedItem) => void;
}) {
  const [open, setOpen] = useState(false);

  /**
   * The chevron turns; it does not get swapped.
   *
   * It was two icons, `ChevronDown` and `ChevronUp`, exchanged on tap — which
   * is a cut, and a cut between two glyphs that differ only in which way they
   * point reads as a flicker. One glyph rotating through 180° is the same
   * information and it shows the card doing the thing rather than reporting
   * that it is done.
   */
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  /**
   * The card opens by animating a real height, not by animating its layout.
   *
   * The obvious build is Reanimated's `LinearTransition` on the card, and it
   * looks right until you watch what is under it. Measured on an open: the card
   * below jumped straight to its final position on the first frame while this
   * one grew over a quarter second, so a 94px hole opened between them and
   * slowly closed. `layout` animates the view it is on; it did not carry the
   * sibling with it.
   *
   * Animating a height does, because a height is a layout value — whatever is
   * below is pushed down by exactly as much as this card has grown, on every
   * frame, for free.
   *
   * The cost is that the rows stay mounted while closed, clipped by a zero-high
   * box, so there is something to measure. Three or four rows of text per meal
   * is a cheap thing to keep around, and it buys a measurement that is always
   * current — a card whose content changed while closed (a row deleted from
   * another screen) opens to the right height rather than to the height it had
   * last time it was open.
   */
  const [bodyH, setBodyH] = useState(0);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, grow]);
  const body = useAnimatedStyle(() => ({ height: grow.value * bodyH }));

  const count = g.items.length;
  const countText =
    count === 1 ? i18n.nDiaryItemsOne : i18n.nDiaryItems.replace('{n}', String(count));
  // only worth saying when breakfast was logged more than once
  const entriesText =
    g.entries > 1 ? `${i18n.nDiaryEntries.replace('{n}', String(g.entries))} · ` : '';

  return (
    <GlassCard style={styles.meal}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((v) => !v);
        }}
        style={styles.mealHead}>
        <View style={styles.mealHeadText}>
          <Text style={styles.mealName}>{label}</Text>
          <Text style={styles.mealSub}>
            {entriesText}
            {countText} · P{g.protein_g} · C{g.carbs_g} · F{g.fat_g}
          </Text>
        </View>
        <Text style={styles.mealKcal}>
          {g.kcal.toLocaleString()} <Text style={styles.unit}>kcal</Text>
        </Text>
        <Animated.View style={chevron}>
          <Icon icon={ChevronDown} size={18} color={colors.mutedForeground} />
        </Animated.View>
      </PressScale>

      {/*
        Always mounted, clipped to an animated height. The inner View is what
        gets measured, and it lays out at its natural size however short the box
        around it currently is.
      */}
      <Animated.View style={[styles.body, body]} pointerEvents={open ? 'auto' : 'none'}>
        <View onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
          {g.items.map((it, i) => (
            <MealRow
              key={it.id}
              it={it}
              grow={grow}
              index={i}
              count={g.items.length}
              i18n={i18n}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </View>
      </Animated.View>
    </GlassCard>
  );
}

/**
 * One food in an open meal.
 *
 * Its own component because it needs its own animated style, and a hook cannot
 * be called from inside a `map`.
 *
 * ── the stagger comes off the card's own progress ──
 *
 * `entering` would be the shorter way to write this and it does not work here:
 * the rows never unmount, so an entering animation fires once, on first render,
 * and never again. Instead each row reads the same `grow` the card's height
 * reads, through a window of its own — row `i` starts at `i × step` and takes
 * the next 0.55 of the card's travel to arrive.
 *
 * `step` shrinks as the list grows so the last row always lands with the card
 * rather than after it. Four items step by 0.12; a twelve-item lunch steps by
 * 0.04 and still finishes on time.
 *
 * Only on the way open. Closing runs the same numbers backwards, which fades
 * the rows out in reverse — and that is right: the last row to arrive is the
 * first to go, so the list rolls back up the way it rolled down.
 */
function MealRow({
  it,
  grow,
  index,
  count,
  i18n,
  onEdit,
  onDelete,
}: {
  it: LoggedItem;
  grow: SharedValue<number>;
  index: number;
  count: number;
  i18n: ReturnType<typeof useI18n>;
  onEdit: (it: LoggedItem) => void;
  onDelete: (it: LoggedItem) => void;
}) {
  const step = Math.min(0.12, 0.45 / Math.max(1, count - 1));
  const from = index * step;

  const style = useAnimatedStyle(() => {
    const t = Math.min(Math.max((grow.value - from) / 0.55, 0), 1);
    return { opacity: t, transform: [{ translateY: (1 - t) * 10 }] };
  });

  return (
    <Animated.View style={[styles.item, style]}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {it.food_name}
          {/* Only when it is not one portion. "×1" on every line is
              noise that makes the one line that says ×2 harder to see. */}
          {/* `0.30000000000000004` is a real thing a float can be; two decimals
              is finer than any portion anyone sets and never shows it. */}
          {it.servings !== 1 ? (
            <Text style={styles.serving}>  ×{Math.round(it.servings * 100) / 100}</Text>
          ) : null}
        </Text>
        <Text style={styles.itemMacros}>
          {/* Rounded here rather than in storage: the stored figure is exact
              so re-scaling a portion stays reversible, and a diary line has no
              use for a tenth of a gram. */}
          P{Math.round(it.protein_g)} · C{Math.round(it.carbs_g)} · F{Math.round(it.fat_g)}
        </Text>
      </View>
      <Text style={styles.itemKcal}>{Math.round(it.kcal)}</Text>
      {/*
        Edit and remove, on the row itself.

        Not a swipe and not a long-press. Both are invisible until guessed, and
        this list is already behind a tap to expand the meal — a gesture hidden
        inside something hidden is a feature only its author finds. The two
        buttons cost a little width on a row that had spare, and they say what
        is possible without being tried.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nItemEdit}
        hitSlop={10}
        onPress={() => {
          Haptics.selectionAsync();
          onEdit(it);
        }}
        style={styles.rowBtn}>
        <Icon icon={Pencil} size={15} color={colors.mutedForeground} />
      </PressScale>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nItemDelete}
        hitSlop={10}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDelete(it);
        }}
        style={styles.rowBtn}>
        {/* Muted, not red. A destructive glyph on every row of a list that is
            not about deleting makes deletion the loudest thing on the card —
            three foods drew three red marks and the eye went to them before the
            food. The two actions are already told apart by their shapes, and
            the red belongs on the confirm dialog's button, where it is about to
            mean something. */}
        <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
      </PressScale>
    </Animated.View>
  );
}

/**
 * How many servings of one logged food — a small sheet over the diary.
 *
 * Servings and not the macros themselves. The numbers on a logged row are the
 * food's own figures multiplied by a count, so editing them directly would let
 * a portion of rice carry a protein figure no portion of rice has, and the
 * next thing that reads it (the recent-foods list, which divides back out to
 * one serving) would spread that fiction to every future log of the same food.
 * The count is the thing that was actually a guess, and correcting it rescales
 * everything consistently.
 *
 * Steppers rather than a text field: the realistic range is a few halves
 * either side of one, the keyboard would cover the sheet, and there is no
 * partially-typed state to guard against. `0.5` steps because half a portion is
 * a thing people eat and a third is not something anyone measures.
 */
function EditServingsSheet({
  item,
  i18n,
  onClose,
  onSave,
  busy,
}: {
  item: LoggedItem | null;
  i18n: ReturnType<typeof useI18n>;
  onClose: () => void;
  onSave: (servings: number) => void;
  busy: boolean;
}) {
  const [servings, setServings] = useState(1);

  // Re-seed each time a different row opens the sheet. Without this the
  // stepper keeps whatever the last row left in it.
  useEffect(() => {
    if (item) setServings(item.servings || 1);
  }, [item]);

  if (!item) return null;

  // What the row will say once saved — the same ratio the mutation applies, so
  // the preview and the result cannot disagree.
  const k = servings / (item.servings || 1);
  const step = (d: number) => {
    const next = Math.round((servings + d) * 2) / 2;
    if (next < 0.5 || next > 20) return;
    Haptics.selectionAsync();
    setServings(next);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* The card swallows taps so pressing inside it does not dismiss */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {item.food_name}
          </Text>
          <Text style={styles.sheetSub}>{i18n.nItemServings}</Text>

          <View style={styles.stepper}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.nServingsLess}
              onPress={() => step(-0.5)}
              style={styles.stepBtn}>
              <Icon icon={Minus} size={18} color={colors.foreground} />
            </PressScale>
            <Text style={styles.stepValue}>{servings % 1 === 0 ? servings : servings.toFixed(1)}</Text>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.nServingsMore}
              onPress={() => step(0.5)}
              style={styles.stepBtn}>
              <Icon icon={Plus} size={18} color={colors.foreground} />
            </PressScale>
          </View>

          <Text style={styles.sheetPreview}>
            {Math.round(item.kcal * k)} kcal · P{Math.round(item.protein_g * k)} · C
            {Math.round(item.carbs_g * k)} · F{Math.round(item.fat_g * k)}
          </Text>

          <View style={styles.sheetActions}>
            <PressScale
              accessibilityRole="button"
              onPress={onClose}
              style={styles.sheetBtn}>
              <Text style={styles.sheetBtnText}>{i18n.cancel}</Text>
            </PressScale>
            <PressScale
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onSave(servings)}
              style={[styles.sheetBtn, styles.sheetBtnPrimary, busy && styles.pressed]}>
              <Text style={[styles.sheetBtnText, styles.sheetBtnTextPrimary]}>{i18n.save}</Text>
            </PressScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  meal: { gap: 2, paddingVertical: spacing.md },
  // clipped, so the rows inside can lay out at full height while the box around
  // them is still opening
  body: { overflow: 'hidden' },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealHeadText: { flex: 1, minWidth: 0, gap: 2 },
  mealName: { ...type.headline, color: colors.foreground },
  mealSub: { ...type.caption, color: colors.mutedForeground },
  mealKcal: { ...type.headline, color: colors.foreground, fontVariant: ['tabular-nums'] },
  unit: { ...type.caption, color: colors.mutedForeground },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemInfo: { flex: 1 },
  itemName: { ...type.footnote, color: colors.foreground },
  serving: { ...type.caption, color: colors.mutedForeground },
  itemMacros: { ...type.caption, color: colors.mutedForeground },
  itemKcal: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  emptyText: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  // ── per-row edit / delete ──
  rowBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // ── the servings sheet ──
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#1b1b1f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sheetTitle: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  sheetSub: { ...type.caption, color: colors.mutedForeground },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xs },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  stepValue: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  sheetPreview: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.xs },
  sheetBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  sheetBtnPrimary: { backgroundColor: colors.primary },
  sheetBtnText: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  sheetBtnTextPrimary: { color: '#111' },
});
