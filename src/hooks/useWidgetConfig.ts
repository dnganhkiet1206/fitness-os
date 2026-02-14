import { useState, useCallback } from 'react';

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

const DEFAULT_CONFIG: WidgetConfig = {
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

function loadConfig(): WidgetConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_CONFIG;
}

export function useWidgetConfig() {
  const [config, setConfigState] = useState<WidgetConfig>(loadConfig);
  const [editMode, setEditMode] = useState(false);

  const setConfig = useCallback((next: WidgetConfig | ((prev: WidgetConfig) => WidgetConfig)) => {
    setConfigState(prev => {
      const val = typeof next === 'function' ? next(prev) : next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
      return val;
    });
  }, []);

  const resetConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigState(DEFAULT_CONFIG);
  }, []);

  const moveWidget = useCallback((widgetKey: WidgetKey, fromGroupId: string, toGroupId: string) => {
    setConfig(prev => {
      const groups = prev.groups.map(g => ({
        ...g,
        widgets: g.widgets.filter(w => w !== widgetKey),
      }));
      const targetIdx = groups.findIndex(g => g.id === toGroupId);
      if (targetIdx >= 0) groups[targetIdx].widgets.push(widgetKey);
      return { ...prev, groups };
    });
  }, [setConfig]);

  const reorderGroupWidgets = useCallback((groupId: string, newOrder: WidgetKey[]) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, widgets: newOrder } : g),
    }));
  }, [setConfig]);

  const addGroup = useCallback((title: { en: string; vi: string }, icon: string) => {
    setConfig(prev => ({
      ...prev,
      groups: [...prev.groups, { id: `grp-${Date.now()}`, title, icon, widgets: [] }],
    }));
  }, [setConfig]);

  const removeGroup = useCallback((groupId: string) => {
    setConfig(prev => {
      const group = prev.groups.find(g => g.id === groupId);
      const orphans = group?.widgets || [];
      const remaining = prev.groups.filter(g => g.id !== groupId);
      if (remaining.length > 0 && orphans.length > 0) {
        remaining[remaining.length - 1].widgets.push(...orphans);
      }
      return { ...prev, groups: remaining };
    });
  }, [setConfig]);

  const renameGroup = useCallback((groupId: string, title: { en: string; vi: string }, icon?: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === groupId ? { ...g, title, ...(icon ? { icon } : {}) } : g
      ),
    }));
  }, [setConfig]);

  const reorderGroups = useCallback((newOrder: WidgetGroup[]) => {
    setConfig(prev => ({ ...prev, groups: newOrder }));
  }, [setConfig]);

  return {
    config,
    editMode,
    setEditMode,
    moveWidget,
    reorderGroupWidgets,
    addGroup,
    removeGroup,
    renameGroup,
    reorderGroups,
    resetConfig,
  };
}

export const WIDGET_META: Record<WidgetKey, { label: { en: string; vi: string }; icon: string }> = {
  readiness: { label: { en: 'Readiness', vi: 'Mức sẵn sàng' }, icon: '🎯' },
  activity: { label: { en: 'Activity', vi: 'Hoạt động' }, icon: '🏃' },
  'readiness-trend': { label: { en: 'Readiness Trend', vi: 'Xu hướng' }, icon: '📈' },
  biometrics: { label: { en: 'Biometrics', vi: 'Sinh trắc học' }, icon: '❤️' },
  training: { label: { en: 'Training', vi: 'Tập luyện' }, icon: '🏋️' },
  nutrition: { label: { en: 'Nutrition', vi: 'Dinh dưỡng' }, icon: '🍽️' },
  sleep: { label: { en: 'Sleep', vi: 'Giấc ngủ' }, icon: '🌙' },
  weight: { label: { en: 'Weight', vi: 'Cân nặng' }, icon: '⚖️' },
  'workout-status': { label: { en: 'Workout Status', vi: 'Trạng thái tập' }, icon: '✅' },
  supplements: { label: { en: 'Supplements', vi: 'Thực phẩm bổ sung' }, icon: '💊' },
  'ai-tips': { label: { en: 'AI Tips', vi: 'Gợi ý AI' }, icon: '✨' },
  awards: { label: { en: 'Awards', vi: 'Thành tích' }, icon: '🏆' },
  nudges: { label: { en: 'Nudges', vi: 'Nhắc nhở' }, icon: '🔔' },
  water: { label: { en: 'Water', vi: 'Nước uống' }, icon: '💧' },
  steps: { label: { en: 'Steps', vi: 'Bước đi' }, icon: '👣' },
};
