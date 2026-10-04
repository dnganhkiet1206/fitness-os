import { usePathname } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';

import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type AppRole, type AuditRow, useAppRole } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { fillCopy } from '@/lib/copy-fill';
import { timeAgo } from '@/lib/time-ago';

/**
 * Khung của bảng kiểm duyệt (A, 03/10): cửa vào, thanh điều hướng, bề rộng.
 *
 * ── ba cửa, theo thứ tự ──
 *
 *   1. Không phải web → một câu, không gì khác. Bảng điều khiển là việc ở bàn
 *      làm việc; app iPhone không có lối vào và không tải gì của nó.
 *   2. Vai trò chưa biết → chờ. Vai trò `user` (hoặc moderator trên trang chỉ
 *      admin) → "không có quyền", và mọi truy vấn quản trị TẮT (`useStaff` trong
 *      use-admin.ts): mở thẳng /admin không kéo về dữ liệu nào.
 *   3. Đủ vai trò → nội dung.
 *
 * Cửa này để VẼ cho đúng. Quyền thật nằm ở database — người dùng gọi thẳng RPC
 * vẫn nhận 403 (docs/ADMIN.md).
 */

type NavKey = 'dashboard' | 'reports' | 'appeals' | 'users' | 'images' | 'audit';

const NAV: { key: NavKey; path: string; adminOnly: boolean }[] = [
  { key: 'dashboard', path: '/admin', adminOnly: false },
  { key: 'reports', path: '/admin/reports', adminOnly: false },
  { key: 'appeals', path: '/admin/appeals', adminOnly: false },
  { key: 'users', path: '/admin/users', adminOnly: true },
  { key: 'images', path: '/admin/images', adminOnly: true },
  { key: 'audit', path: '/admin/audit', adminOnly: true },
];

export function useRoleLabel() {
  const i18n = useI18n();
  return (r: AppRole) => (r === 'admin' ? i18n.nPgAdRoleAdmin : r === 'moderator' ? i18n.nPgAdRoleModerator : i18n.nPgAdRoleUser);
}

export function AdminShell({
  title,
  adminOnly = false,
  back = false,
  children,
}: {
  title: string;
  adminOnly?: boolean;
  /** trang con (một bài, một người): nút lùi thay cho thanh điều hướng */
  back?: boolean;
  children: (role: AppRole) => React.ReactNode;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const role = useAppRole();
  const roleLabel = useRoleLabel();
  const path = usePathname();

  if (Platform.OS !== 'web') {
    return (
      <Screen back title={i18n.nPgAdConsole}>
        <Text style={styles.gateBody}>{i18n.nPgAdWebOnly}</Text>
      </Screen>
    );
  }
  if (role.isError) {
    return (
      <Screen back title={i18n.nPgAdConsole}>
        <LoadFailed i18n={i18n} onRetry={() => role.refetch()} />
      </Screen>
    );
  }
  if (role.isPending) {
    return (
      <Screen back title={i18n.nPgAdConsole}>
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      </Screen>
    );
  }
  const r = role.data;
  if (r === 'user' || (adminOnly && r !== 'admin')) {
    return (
      <Screen back title={i18n.nPgAdConsole}>
        <View style={styles.gate} testID="admin-no-access">
          <Text style={styles.gateTitle} accessibilityRole="header">
            {i18n.nPgAdNoAccess}
          </Text>
          <Text style={styles.gateBody}>{i18n.nPgAdNoAccessBody}</Text>
          <PressScale style={styles.gateBtn} accessibilityRole="link" onPress={() => nav.replace('/')}>
            <Text style={styles.gateBtnText}>{i18n.nPgAdBackToApp}</Text>
          </PressScale>
        </View>
      </Screen>
    );
  }

  const label: Record<NavKey, string> = {
    dashboard: i18n.nPgAdNavDashboard,
    reports: i18n.nPgAdNavReports,
    appeals: i18n.nPgAdNavAppeals,
    users: i18n.nPgAdNavUsers,
    images: i18n.nPgAdNavImages,
    audit: i18n.nPgAdNavAudit,
  };
  const items = NAV.filter((n) => !n.adminOnly || r === 'admin');

  return (
    <Screen back={back} title={title} keyboardAware>
      <View style={styles.frame}>
        {back ? null : (
          <View style={styles.navWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
              {items.map((n) => {
                const on = path === n.path;
                return (
                  <PressScale
                    key={n.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    aria-selected={on}
                    style={[styles.navItem, on && styles.navItemOn]}
                    onPress={() => (on ? undefined : nav.replace(n.path as never))}
                  >
                    <Text style={[styles.navText, on && styles.navTextOn]}>{label[n.key]}</Text>
                  </PressScale>
                );
              })}
            </ScrollView>
            <Text style={styles.whoami}>{fillCopy(i18n.nPgAdSignedInAs, { r: roleLabel(r) })}</Text>
          </View>
        )}
        {children(r)}
      </View>
    </Screen>
  );
}

/** Câu hỏi lại cho mọi việc khó hoàn tác. Trên web, `installWebAlert` biến nó
 *  thành `confirm()` nói rõ "OK" là làm gì. */
export function confirmThen(title: string, body: string, verb: string, cancel: string, run: () => void) {
  Alert.alert(title, body, [
    { text: cancel, style: 'cancel' },
    { text: verb, style: 'destructive', onPress: run },
  ]);
}

/** Lỗi của một quyết định, nói bằng ngôn ngữ của bảng điều khiển: 42501 là vai
 *  trò không đủ (vai trò có thể đã bị thu hồi giữa chừng), còn lại là lỗi thật. */
export function decisionError(e: unknown, i18n: ReturnType<typeof useI18n>): string {
  const code = (e as { code?: string })?.code;
  if (code === '42501') return i18n.nPgAdForbidden;
  return (e as Error)?.message ?? String(e);
}

export function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={i18n.nPgAdReason}
      placeholderTextColor={c.mutedForeground}
      accessibilityLabel={i18n.nPgAdReason}
      maxLength={500}
      multiline
      style={styles.reason}
    />
  );
}

export function StateTag({ hidden, removed }: { hidden: boolean; removed: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const text = removed ? i18n.nPgAdRemoved : hidden ? i18n.nPgAdHidden : i18n.nPgAdVisible;
  return (
    <View style={[styles.tag, removed ? styles.tagRemoved : hidden ? styles.tagHidden : styles.tagVisible]}>
      <Text style={[styles.tagText, removed ? styles.tagTextRemoved : hidden ? styles.tagTextHidden : null]}>{text}</Text>
    </View>
  );
}

export function useReasonLabel() {
  const i18n = useI18n();
  const map: Record<string, string> = {
    spam: i18n.nCmReasonSpam,
    harassment: i18n.nCmReasonHarass,
    inappropriate: i18n.nCmReasonInappropriate,
    misleading: i18n.nCmReasonMisleading,
    other: i18n.nCmReasonOther,
  };
  return (r: string) => map[r] ?? r;
}

export function useActionLabel() {
  const i18n = useI18n();
  const map: Record<string, string> = {
    HIDE_POST: i18n.nPgAdActHidePost,
    RESTORE_POST: i18n.nPgAdActRestorePost,
    REMOVE_POST: i18n.nPgAdActRemovePost,
    HIDE_COMMENT: i18n.nPgAdActHideComment,
    RESTORE_COMMENT: i18n.nPgAdActRestoreComment,
    REMOVE_COMMENT: i18n.nPgAdActRemoveComment,
    DISMISS_REPORT: i18n.nPgAdActDismiss,
    APPROVE_APPEAL: i18n.nPgAdActApprove,
    REJECT_APPEAL: i18n.nPgAdActReject,
    ADD_IMAGE: i18n.nPgAdActAddImage,
    REMOVE_IMAGE: i18n.nPgAdActRemoveImage,
    RESTORE_IMAGE: i18n.nPgAdActRestoreImage,
    ROLE_CHANGE: i18n.nPgAdActRole,
    RESTRICT_USER: i18n.nPgAdActRestrict,
    UNRESTRICT_USER: i18n.nPgAdActUnrestrict,
  };
  return (a: string) => map[a] ?? a;
}

/** Một dòng nhật ký: ai, làm gì, lúc nào, vì sao. Đích bấm được khi nó là một
 *  bài hoặc bình luận. */
export function AuditLine({ row, first }: { row: AuditRow; first: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const actionLabel = useActionLabel();
  const roleLabel = useRoleLabel();
  const who = row.actor ? `@${row.actor.handle}` : i18n.nPgAdSystem;
  const role = row.actor_role === 'system' ? '' : ` · ${roleLabel(row.actor_role)}`;
  const opens = row.target_type === 'post' || row.target_type === 'comment';
  const body = (
    <>
      <View style={styles.auditHead}>
        <Text style={styles.auditAction}>{actionLabel(row.action)}</Text>
        <Text style={styles.auditWhen}>{timeAgo(row.created_at, i18n, lang)}</Text>
      </View>
      <Text style={styles.meta}>
        {who}
        {role}
      </Text>
      {row.reason ? <Text style={styles.auditReason}>{row.reason}</Text> : null}
    </>
  );
  return opens ? (
    <PressScale
      style={[styles.auditRow, !first && styles.rule]}
      accessibilityRole="link"
      accessibilityLabel={`${actionLabel(row.action)}, ${who}`}
      onPress={() => nav.push(`/admin/target?type=${row.target_type}&id=${row.target_id}` as never)}
    >
      {body}
    </PressScale>
  ) : (
    <View style={[styles.auditRow, !first && styles.rule]}>{body}</View>
  );
}

export function Empty({ text }: { text: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return <Text style={styles.empty}>{text}</Text>;
}

export const adminStyles = makeStyles((c) => ({
  section: { gap: spacing.sm },
  heading: { ...type.headline, color: c.foreground },
  meta: { ...type.footnote, color: c.mutedForeground },
  body: { ...type.body, color: c.foreground, lineHeight: 22 },
  panel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, gap: 4 },
  rule: { borderTopWidth: 1, borderTopColor: c.border },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  strong: { ...type.body, color: c.foreground, fontWeight: '600' },
  excerpt: { ...type.body, color: c.foreground },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* 44 cao: sàn vùng chạm của app, cả trên web (chuột không cần, bàn phím và
     màn cảm ứng cần). */
  btn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
  btnDanger: { backgroundColor: c.secondary },
  btnDangerText: { ...type.footnote, color: c.readinessRed, fontWeight: '700' },
  btnPrimary: { backgroundColor: c.foreground },
  btnPrimaryText: { ...type.footnote, color: c.background, fontWeight: '700' },
  btnOff: { opacity: 0.45 },
  input: {
    ...type.body,
    color: c.foreground,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  loading: { marginVertical: spacing.lg },
}));

const stylesFor = makeStyles((c) => ({
  frame: { gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  navWrap: { gap: spacing.xs },
  nav: { gap: spacing.xs, paddingVertical: 2 },
  navItem: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemOn: { backgroundColor: c.foreground },
  navText: { ...type.footnote, color: c.mutedForeground, fontWeight: '600' },
  navTextOn: { color: c.background },
  whoami: { ...type.caption, color: c.mutedForeground, paddingHorizontal: spacing.md },
  loading: { marginVertical: spacing.xl },
  gate: { gap: spacing.md, paddingTop: spacing.lg, maxWidth: 520 },
  gateTitle: { ...type.title, color: c.foreground },
  gateBody: { ...type.body, color: c.mutedForeground, lineHeight: 22 },
  gateBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateBtnText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
  reason: {
    ...type.body,
    color: c.foreground,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    textAlignVertical: 'top',
  },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  tagVisible: { borderColor: c.border },
  tagHidden: { borderColor: c.readinessYellow },
  tagRemoved: { borderColor: c.readinessRed },
  tagText: { ...type.caption, color: c.mutedForeground, fontWeight: '600' },
  tagTextHidden: { color: c.foreground },
  tagTextRemoved: { color: c.readinessRed },
  meta: { ...type.footnote, color: c.mutedForeground },
  rule: { borderTopWidth: 1, borderTopColor: c.border },
  auditRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: 2 },
  auditHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  auditAction: { ...type.body, color: c.foreground, fontWeight: '600', flex: 1 },
  auditWhen: { ...type.caption, color: c.mutedForeground },
  auditReason: { ...type.footnote, color: c.foreground },
  empty: { ...type.body, color: c.mutedForeground, paddingVertical: spacing.md },
}));
