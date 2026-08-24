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
  | 'ai-tips' | 'awards'
  | 'water' | 'steps';

/**
 * Widgets that used to exist and no longer do.
 *
 * ── why removing a card is not enough ──
 *
 * The stored layout is the user's, and `withNewWidgets` is deliberately
 * add-only, so a key written into somebody's config years ago stays there
 * forever. When `nudges` was deleted — its table had no writer, so the card
 * returned `null` on every render — every account that had ever opened edit
 * mode kept the entry, and the entry is not silent:
 *
 *   · the group renders it as a zero-height child, and the group has `gap`, so
 *     the Insights section grows one blank slot's worth of space;
 *   · edit mode falls back to `?? key`, so the chip reads literally **"nudges"**
 *     — an English identifier, on a Vietnamese screen, for a card that cannot
 *     appear;
 *   · and the only way out is `resetConfig`, which throws away every
 *     arrangement the user made.
 *
 * So retirement is explicit and the merge prunes it. The list is typed
 * `string[]`, not `WidgetKey[]` — these keys are gone from the union, which is
 * the whole point.
 */
export const RETIRED_WIDGETS: string[] = ['nudges'];

/**
 * Thẻ đã được CHUYỂN LÊN hero, và vì sao chuyện đó cần một cơ chế riêng.
 *
 * `withNewWidgets` cố ý chỉ-thêm: nó không bao giờ di chuyển thứ gì, vì bố cục
 * là của người dùng. Nhưng hero không còn là "hai thẻ đầu danh sách" nữa — nó
 * là cả phần trên cùng của Today, một deck vuốt ngang, và một thẻ vòng tròn
 * nằm lẫn trong nhóm bên dưới thì không bao giờ tới được đó.
 *
 * Nên chỉ những khoá trong danh sách này mới được dời, đúng một lần cho mỗi bố
 * cục đã lưu: gỡ khỏi nhóm, thêm vào hero, giữ nguyên thứ tự tương đối của mọi
 * thứ khác. Sau lần đó nó là một khoá hero bình thường và người dùng vẫn tự sắp
 * lại được ở chế độ sửa.
 *
 * Danh sách này KHÔNG phải là "hero mặc định" — `DEFAULT_CONFIG.heroWidgets` là
 * cái đó, và nó chỉ áp cho bản cài mới. Đây là việc dời của những bố cục đã tồn
 * tại từ trước.
 */
export const PROMOTED_TO_HERO: WidgetKey[] = ['nutrition', 'water'];

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
  heroWidgets: ['readiness', 'activity', 'nutrition', 'water'],
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
      /* `nutrition` và `water` không còn ở đây — chúng nằm trong hero deck. Để
         lại thì phép thăng hạng sẽ dời chúng đi ngay ở lần merge đầu tiên, tức
         DEFAULT_CONFIG tự sửa chính mình mỗi lần mở app và không bao giờ được
         trả về nguyên vẹn. */
      widgets: ['supplements'],
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
      widgets: ['readiness-trend', 'ai-tips', 'awards'],
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
  /* Retired keys are dropped on the way in — see `RETIRED_WIDGETS`. This is the
     one thing the merge takes away, and it only takes away cards that no longer
     exist to draw. */
  const live = (list: WidgetKey[]) => list.filter((k) => !RETIRED_WIDGETS.includes(k));
  const groups = stored.groups.map((g) => ({ ...g, widgets: live(g.widgets) }));
  const heroWidgets = live(stored.heroWidgets);
  const have = new Set<WidgetKey>([...heroWidgets, ...groups.flatMap((g) => g.widgets)]);
  let changed =
    heroWidgets.length !== stored.heroWidgets.length ||
    groups.some((g, i) => g.widgets.length !== stored.groups[i].widgets.length);

  for (const key of DEFAULT_CONFIG.heroWidgets) {
    if (have.has(key)) continue;
    heroWidgets.push(key);
    have.add(key);
    changed = true;
  }

  /* Dời — thứ duy nhất trong hàm này KHÔNG phải là thêm.

     Idempotent: chạy lại trên một bố cục đã dời thì không tìm thấy gì trong
     nhóm để gỡ và không thêm gì vào hero, nên `changed` giữ nguyên và caller so
     sánh bằng identity vẫn thấy một bố cục chưa bị đụng tới. */
  for (const key of PROMOTED_TO_HERO) {
    let moved = false;
    for (const g of groups) {
      const at = g.widgets.indexOf(key);
      if (at >= 0) {
        g.widgets.splice(at, 1);
        moved = true;
      }
    }
    if (!heroWidgets.includes(key)) {
      heroWidgets.push(key);
      have.add(key);
      moved = true;
    }
    if (moved) changed = true;
  }

  for (const def of DEFAULT_CONFIG.groups) {
    for (const key of def.widgets) {
      if (have.has(key)) continue;
      have.add(key);
      changed = true;
      const home = groups.find((g) => g.id === def.id) ?? groups[groups.length - 1];
      // No groups at all is not a shape the loader accepts, but a merge that
      // drops a widget on the floor when it happens would be worse than one
      // that rebuilds the group it came from.
      if (home) home.widgets.push(key);
      else groups.push({ ...def, widgets: [key] });
    }
  }

  // The same object back when nothing was added or retired, so a caller
  // comparing by identity can tell an untouched config from a repaired one
  return changed ? { heroWidgets, groups } : stored;
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
