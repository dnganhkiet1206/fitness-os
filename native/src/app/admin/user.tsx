import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  AdminShell,
  AuditLine,
  Empty,
  ReasonField,
  StateTag,
  adminStyles,
  confirmThen,
  decisionError,
  useReasonLabel,
  useRoleLabel,
} from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented } from '@/components/ascnd/segmented';
import { type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { type AdminUserDetail, type AppRole, useAdminUser, useSetRole } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { fillCopy } from '@/lib/copy-fill';
import { timeAgo } from '@/lib/time-ago';
import { toast } from '@/lib/toast';

/**
 * Một người (chỉ admin): vai trò, bài, báo cáo về họ, lịch sử kiểm duyệt.
 *
 * Đổi vai trò hỏi lại và cần lý do cho nhật ký. Không tự đổi vai trò của mình
 * (server cũng chặn) và không hạ được admin cuối cùng (server chặn — kể cả khi
 * hai admin hạ nhau cùng lúc).
 */
export default function AdminUser() {
  const i18n = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <AdminShell back adminOnly title={i18n.nPgAdNavUsers}>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string | undefined }) {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const q = useAdminUser(id);
  if (q.isError) return <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />;
  if (q.isPending) return <ActivityIndicator color={c.mutedForeground} style={a.loading} />;
  return <Detail d={q.data} />;
}

function Detail({ d }: { d: AdminUserDetail }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { user } = useAuth();
  const roleLabel = useRoleLabel();
  const reasonLabel = useReasonLabel();
  const setRole = useSetRole();
  const [pick, setPick] = useState<AppRole>(d.role);
  const [reason, setReason] = useState('');
  const self = user?.id === d.user_id;

  const save = () =>
    confirmThen(
      fillCopy(i18n.nPgAdRoleTitle, { r: roleLabel(pick) }),
      i18n.nPgAdRoleBody,
      i18n.nPgAdRoleSave,
      i18n.cancel,
      () =>
        setRole.mutate(
          { userId: d.user_id, role: pick, reason: reason.trim() },
          {
            onSuccess: () => {
              setReason('');
              toast.success(i18n.nPgAdDone);
            },
            onError: (e) => toast.error(decisionError(e, i18n)),
          },
        ),
    );

  return (
    <>
      <View style={a.section}>
        <Text style={styles.name}>{d.profile?.display_name ?? i18n.nPgAdNoProfile}</Text>
        <Text style={a.meta}>
          {d.profile ? `@${d.profile.handle} · ` : ''}
          {d.email ?? ''}
        </Text>
        {d.profile?.bio ? <Text style={a.body}>{d.profile.bio}</Text> : null}
        <Text style={a.meta}>{fillCopy(i18n.nPgAdFiled, { n: d.reports_filed })}</Text>
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdRole}
        </Text>
        {self ? (
          <Text style={a.meta}>{i18n.nPgAdSelfRole}</Text>
        ) : (
          <>
            <Segmented
              value={pick}
              onChange={setPick}
              options={[
                { key: 'user', label: i18n.nPgAdRoleUser },
                { key: 'moderator', label: i18n.nPgAdRoleModerator },
                { key: 'admin', label: i18n.nPgAdRoleAdmin },
              ]}
            />
            <ReasonField value={reason} onChange={setReason} />
            <PressScale
              style={[a.btn, a.btnPrimary, styles.save, (pick === d.role || setRole.isPending) && a.btnOff]}
              disabled={pick === d.role || setRole.isPending}
              accessibilityState={{ disabled: pick === d.role || setRole.isPending }}
              onPress={save}
            >
              <Text style={a.btnPrimaryText}>{i18n.nPgAdRoleSave}</Text>
            </PressScale>
          </>
        )}
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdPosts}
        </Text>
        {d.posts.length === 0 ? (
          <Empty text={i18n.nPgAdNoPosts} />
        ) : (
          <View style={a.panel}>
            {d.posts.map((p, i) => (
              <PressScale
                key={p.id}
                style={[a.row, i > 0 && a.rule]}
                accessibilityRole="link"
                accessibilityLabel={p.caption || i18n.nPgAdNoText}
                onPress={() => nav.push(`/admin/target?type=post&id=${p.id}` as never)}
              >
                <View style={a.rowHead}>
                  <StateTag hidden={p.hidden} removed={p.removed} />
                  <Text style={a.meta}>{fillCopy(i18n.nPgAdReportsN, { n: p.reports })}</Text>
                  <Text style={a.meta}>{timeAgo(p.created_at, i18n, lang)}</Text>
                </View>
                <Text style={a.excerpt} numberOfLines={2}>
                  {p.caption || i18n.nPgAdNoText}
                </Text>
              </PressScale>
            ))}
          </View>
        )}
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdReportsAgainst}
        </Text>
        {d.reports_against.length === 0 ? (
          <Empty text={i18n.nPgAdNoReports} />
        ) : (
          <View style={a.panel}>
            {d.reports_against.map((r, i) => (
              <PressScale
                key={r.id}
                style={[a.row, i > 0 && a.rule]}
                accessibilityRole="link"
                accessibilityLabel={reasonLabel(r.reason)}
                onPress={() => nav.push(`/admin/target?type=${r.target_type}&id=${r.target_id}` as never)}
              >
                <View style={a.rowHead}>
                  <Text style={a.strong}>{reasonLabel(r.reason)}</Text>
                  <Text style={a.meta}>{r.target_type === 'post' ? i18n.nPgAdPost : i18n.nPgAdComment}</Text>
                  <Text style={a.meta}>{timeAgo(r.created_at, i18n, lang)}</Text>
                </View>
              </PressScale>
            ))}
          </View>
        )}
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdHistory}
        </Text>
        {d.history.length === 0 ? (
          <Empty text={i18n.nPgAdNoHistory} />
        ) : (
          <View style={a.panel}>
            {d.history.map((h, i) => (
              <AuditLine key={h.id} row={h} first={i === 0} />
            ))}
          </View>
        )}
      </View>
    </>
  );
}

const stylesFor = makeStyles((c) => ({
  name: { ...type.title, color: c.foreground },
  save: { alignSelf: 'flex-start' },
}));
