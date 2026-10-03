import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { AdminShell, Empty, adminStyles, useRoleLabel } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type AdminUserRow, useAdminUsers } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { fillCopy } from '@/lib/copy-fill';

/** Người dùng (chỉ admin): tìm theo tên, @handle hoặc email; mỗi dòng nói vai
 *  trò và có gì đáng chú ý (báo cáo đang mở về họ). */
export default function AdminUsers() {
  const i18n = useI18n();
  return (
    <AdminShell title={i18n.nPgAdNavUsers} adminOnly>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  /* Đợi người gõ dừng một nhịp: mỗi phím một lượt quét auth.users là phí. */
  useEffect(() => {
    const h = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(h);
  }, [text]);
  const q = useAdminUsers(query);

  return (
    <>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={i18n.nPgAdSearchUsers}
        placeholderTextColor={c.mutedForeground}
        accessibilityLabel={i18n.nPgAdSearchUsers}
        autoCapitalize="none"
        autoCorrect={false}
        style={a.input}
      />
      {q.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={a.loading} />
      ) : q.data.length === 0 ? (
        <Empty text={i18n.nPgAdNoUsers} />
      ) : (
        <View style={a.panel}>
          {q.data.map((u, i) => (
            <UserRow key={u.user_id} u={u} first={i === 0} />
          ))}
        </View>
      )}
    </>
  );
}

function UserRow({ u, first }: { u: AdminUserRow; first: boolean }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const roleLabel = useRoleLabel();
  const name = u.display_name ?? i18n.nPgAdNoProfile;
  return (
    <PressScale
      style={[a.row, !first && a.rule]}
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${roleLabel(u.role)}`}
      onPress={() => router.push(`/admin/user?id=${u.user_id}` as never)}
    >
      <View style={a.rowHead}>
        <Text style={a.strong}>{name}</Text>
        {u.handle ? <Text style={a.meta}>@{u.handle}</Text> : null}
        {u.role !== 'user' ? <Text style={styles.role}>{roleLabel(u.role)}</Text> : null}
      </View>
      {u.email ? <Text style={a.meta}>{u.email}</Text> : null}
      <Text style={[a.meta, u.open_reports_against > 0 && styles.flag]}>
        {fillCopy(i18n.nPgAdUserLine, { p: u.posts, o: u.open_reports_against })}
      </Text>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  role: { ...type.caption, color: c.metricBlue, fontWeight: '700', paddingHorizontal: spacing.xs },
  flag: { color: c.foreground },
}));
