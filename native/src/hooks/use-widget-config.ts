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

export function useWidgetConfig() {
  const [config, setConfigState] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as WidgetConfig;
        if (parsed?.groups?.length) setConfigState(parsed);
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
