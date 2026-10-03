import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { AdminShell, AuditLine, Empty, adminStyles, useActionLabel } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, radius, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useAdminAudit } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';

const ACTIONS = [
  'HIDE_POST',
  'RESTORE_POST',
  'REMOVE_POST',
  'HIDE_COMMENT',
  'RESTORE_COMMENT',
  'REMOVE_COMMENT',
  'DISMISS_REPORT',
  'APPROVE_APPEAL',
  'REJECT_APPEAL',
  'ADD_IMAGE',
  'REMOVE_IMAGE',
  'RESTORE_IMAGE',
  'ROLE_CHANGE',
] as const;

/** Nhật ký kiểm toán (chỉ admin): đọc qua `admin_audit`, lọc theo hành động.
 *  Không có nút sửa hay xoá nào — và database cũng không cho, kể cả với chủ bảng. */
export default function AdminAudit() {
  const i18n = useI18n();
  return (
    <AdminShell title={i18n.nPgAdNavAudit} adminOnly>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const actionLabel = useActionLabel();
  const [action, setAction] = useState<string | null>(null);
  const q = useAdminAudit(action);
  const chips: { key: string | null; label: string }[] = [
    { key: null, label: i18n.nPgAdAllActions },
    ...ACTIONS.map((k) => ({ key: k, label: actionLabel(k) })),
  ];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chips.map((ch) => {
          const on = ch.key === action;
          return (
            <PressScale
              key={ch.key ?? 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setAction(ch.key)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{ch.label}</Text>
            </PressScale>
          );
        })}
      </ScrollView>
      {q.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={a.loading} />
      ) : q.data.length === 0 ? (
        <Empty text={i18n.nPgAdNoAudit} />
      ) : (
        <View style={a.panel}>
          {q.data.map((r, i) => (
            <AuditLine key={r.id} row={r} first={i === 0} />
          ))}
        </View>
      )}
    </>
  );
}

const stylesFor = makeStyles((c) => ({
  chips: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: c.foreground, borderColor: c.foreground },
  chipText: { ...type.footnote, color: c.foreground },
  chipTextOn: { color: c.background, fontWeight: '600' },
}));
