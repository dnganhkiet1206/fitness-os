import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Dashboard widget-group customization — port of the web useWidgetConfig
 * (localStorage → AsyncStorage). Groups and their widget order are
 * user-editable from the Today tab's edit mode and persist on device.
 */

export type WidgetKey =
  | 'readiness' | 'activity' | 'readiness-trend'
  | 'biometrics' | 'training' | 'nutrition' | 'sleep'
  | 'weight' | 'workout-status' | 'supplements'
  | 'ai-tips' | 'awards' | 'nudges'
  | 'water' | 'steps';

export interface WidgetGroup {
  id: string;
  title: { en: string; vi: string };
  icon: string;
  widgets: WidgetKey[];
}

export interface WidgetConfig {
  heroWidgets: WidgetKey[];
  groups: WidgetGroup[];
}

export const DEFAULT_CONFIG: WidgetConfig = {
  heroWidgets: ['readiness', 'activity'],
  groups: [
    {
      id: 'health',
      title: { en: 'Health', vi: 'Sức khỏe' },
      icon: '❤️',
      widgets: ['biometrics', 'sleep', 'steps'],
    },
    {
      id: 'nutrition',
      title: { en: 'Nutrition', vi: 'Dinh dưỡng' },
      icon: '🍎',
      widgets: ['nutrition', 'water', 'supplements'],
    },
    {
      id: 'fitness',
      title: { en: 'Fitness', vi: 'Tập luyện' },
      icon: '💪',
      widgets: ['training', 'workout-status', 'weight'],
    },
    {
      id: 'insights',
      title: { en: 'Insights', vi: 'Phân tích' },
      icon: '✨',
      widgets: ['readiness-trend', 'ai-tips', 'awards', 'nudges'],
    },
  ],
};

const STORAGE_KEY = 'ascnd-widget-config';

export const WIDGET_META: Record<WidgetKey, { label: { en: string; vi: string } }> = {
  readiness: { label: { en: 'Readiness', vi: 'Mức sẵn sàng' } },
  activity: { label: { en: 'Activity', vi: 'Hoạt động' } },
  'readiness-trend': { label: { en: 'Readiness Trend', vi: 'Xu hướng' } },
  biometrics: { label: { en: 'Biometrics', vi: 'Sinh trắc học' } },
  training: { label: { en: 'Training', vi: 'Tập luyện' } },
  nutrition: { label: { en: 'Nutrition', vi: 'Dinh dưỡng' } },
  sleep: { label: { en: 'Sleep', vi: 'Giấc ngủ' } },
  weight: { label: { en: 'Weight', vi: 'Cân nặng' } },
  'workout-status': { label: { en: 'Workout Status', vi: 'Trạng thái tập' } },
  supplements: { label: { en: 'Supplements', vi: 'Thực phẩm bổ sung' } },
  'ai-tips': { label: { en: 'AI Tips', vi: 'Gợi ý AI' } },
  awards: { label: { en: 'Awards', vi: 'Thành tích' } },
  nudges: { label: { en: 'Nudges', vi: 'Nhắc nhở' } },
  water: { label: { en: 'Water', vi: 'Nước uống' } },
  steps: { label: { en: 'Steps', vi: 'Bước đi' } },
};

/**
 * Widgets that shipped after this config was saved, put back where they belong.
 *
 * ── the bug this fixes ──
 *
 * The stored layout was used exactly as it came out of storage. That is right
 * for everything the user arranged and wrong for everything the app has learned
 * to draw since: `water` and `steps` were added to `DEFAULT_CONFIG` after this
 * feature shipped, so any account whose layout had already been saved — which
 * is every account that opened edit mode once — has a Today screen that cannot
 * show them.
 *
 * And there is no way back. Edit mode can move a widget, remove a group and add
 * a group; it has no "add widget" at all. The only route to a widget missing
 * from the stored config is `resetConfig`, which throws away every arrangement
 * the user made to get one card back.
 *
 * ── what the merge is allowed to do ──
 *
 * Add, and only add. Order, grouping, renamed groups and removed groups are all
 * the user's and are left exactly as found; a widget the user has arranged
 * somewhere unusual is *found* there and therefore not re-added.
 *
 * A new widget goes to the group it has in `DEFAULT_CONFIG` if that group still
 * exists, and to the last group if it does not — the same place `removeGroup`
 * already folds orphans into, so a user who deleted the Nutrition group does not
 * get it resurrected by an app update.
 *
 * Nothing is written back. The merge is cheap, idempotent and runs on every
 * load, so persisting it would only add a storage write nobody asked for — the
 * next real edit saves the merged shape anyway.
 */
export function withNewWidgets(stored: WidgetConfig): WidgetConfig {
  const groups = stored.groups.map((g) => ({ ...g, widgets: [...g.widgets] }));
  const heroWidgets = [...stored.heroWidgets];
  const have = new Set<WidgetKey>([...heroWidgets, ...groups.flatMap((g) => g.widgets)]);
  let added = false;

  for (const key of DEFAULT_CONFIG.heroWidgets) {
    if (have.has(key)) continue;
    heroWidgets.push(key);
    have.add(key);
    added = true;
  }

  for (const def of DEFAULT_CONFIG.groups) {
    for (const key of def.widgets) {
      if (have.has(key)) continue;
      have.add(key);
      added = true;
      const home = groups.find((g) => g.id === def.id) ?? groups[groups.length - 1];
      // No groups at all is not a shape the loader accepts, but a merge that
      // drops a widget on the floor when it happens would be worse than one
      // that rebuilds the group it came from.
      if (home) home.widgets.push(key);
      else groups.push({ ...def, widgets: [key] });
    }
  }

  // The same object back when there is nothing to add, so a caller comparing
  // by identity can tell an untouched config from a repaired one
  return added ? { heroWidgets, groups } : stored;
}

export function useWidgetConfig() {
  const [config, setConfigState] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as WidgetConfig;
        if (parsed?.groups?.length) setConfigState(withNewWidgets(parsed));
      } catch {
        // corrupted config — keep defaults
      }
    });
  }, []);

  const setConfig = useCallback((updater: (prev: WidgetConfig) => WidgetConfig) => {
    setConfigState((prev) => {
      const next = updater(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /** Move a widget up/down within its group */
  const moveWidget = useCallback(
    (groupId: string, index: number, dir: -1 | 1) => {
      setConfig((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => {
          if (g.id !== groupId) return g;
          const target = index + dir;
          if (target < 0 || target >= g.widgets.length) return g;
          const widgets = [...g.widgets];
          [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
          return { ...g, widgets };
        }),
      }));
    },
    [setConfig],
  );

  /** Move a whole group up/down */
  const moveGroup = useCallback(
    (index: number, dir: -1 | 1) => {
      setConfig((prev) => {
        const target = index + dir;
        if (target < 0 || target >= prev.groups.length) return prev;
        const groups = [...prev.groups];
        [groups[index], groups[target]] = [groups[target], groups[index]];
        return { ...prev, groups };
      });
    },
    [setConfig],
  );

  /** Remove a group; its widgets fold into the last remaining group (web behavior) */
  const removeGroup = useCallback(
    (groupId: string) => {
      setConfig((prev) => {
        const group = prev.groups.find((g) => g.id === groupId);
        const orphans = group?.widgets ?? [];
        const remaining = prev.groups.filter((g) => g.id !== groupId).map((g) => ({ ...g }));
        if (remaining.length > 0 && orphans.length > 0) {
          remaining[remaining.length - 1].widgets = [
            ...remaining[remaining.length - 1].widgets,
            ...orphans,
          ];
        }
        return { ...prev, groups: remaining };
      });
    },
    [setConfig],
  );

  const addGroup = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setConfig((prev) => ({
        ...prev,
        groups: [
          ...prev.groups,
          { id: `grp-${Date.now()}`, title: { en: trimmed, vi: trimmed }, icon: '📌', widgets: [] },
        ],
      }));
    },
    [setConfig],
  );

  const resetConfig = useCallback(() => {
    AsyncStorage.removeItem(STORAGE_KEY);
    setConfigState(DEFAULT_CONFIG);
  }, []);

  return { config, editMode, setEditMode, moveWidget, moveGroup, removeGroup, addGroup, resetConfig };
}
