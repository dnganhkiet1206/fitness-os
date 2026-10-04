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
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  type AppRole,
  type ModAction,
  type TargetDetail,
  type TargetType,
  useDecideAppeal,
  useModAction,
  useModTarget,
  useModRestrict,
  useModUnrestrict,
  useModUserRestriction,
} from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { timeAgo } from '@/lib/time-ago';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';
import { getLocale } from '@/lib/i18n';

/**
 * Một bài hoặc một bình luận, đủ để quyết định: nội dung, tác giả, từng báo
 * cáo (kể cả ai báo — một đợt báo cáo dồn từ một nhóm là thứ người kiểm duyệt
 * cần thấy), kháng nghị kèm lời nhắn, và lịch sử quyết định.
 *
 * Nút nào hiện tuỳ trạng thái, nhưng server mới là nơi quyết: bấm "khôi phục"
 * một bài đã gỡ khi không phải admin thì database trả 42501 dù nút có hiện
 * hay không. Mọi việc khó hoàn tác đều hỏi lại.
 */
export default function AdminTarget() {
  const i18n = useI18n();
  const { type: t, id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const kind: TargetType | undefined = t === 'post' || t === 'comment' ? t : undefined;
  return (
    <AdminShell back title={kind === 'comment' ? i18n.nPgAdComment : i18n.nPgAdPost}>
      {(role) => <Body type={kind} id={id} role={role} />}
    </AdminShell>
  );
}

function Body({ type: kind, id, role }: { type: TargetType | undefined; id: string | undefined; role: AppRole }) {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const q = useModTarget(kind, id);

  if (q.isError) return <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />;
  if (q.isPending) return <ActivityIndicator color={c.mutedForeground} style={a.loading} />;
  return <Detail d={q.data} role={role} />;
}

function Detail({ d, role }: { d: TargetDetail; role: AppRole }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const reasonLabel = useReasonLabel();
  const roleLabel = useRoleLabel();
  const act = useModAction();
  const decide = useDecideAppeal();
  const [reason, setReason] = useState('');

  const t = d.target;
  const removed = !!t.removed_at;
  const text = (d.type === 'post' ? t.caption : t.body) || i18n.nPgAdNoText;
  const openReports = d.reports.filter((r) => r.status === 'open').length;
  const openAppeal = d.appeals.find((p) => p.status === 'open');
  const busy = act.isPending || decide.isPending;

  const done = () => {
    setReason('');
    toast.success(i18n.nPgAdDone);
  };
  const fail = (e: unknown) => toast.error(decisionError(e, i18n));
  const run = (action: ModAction) =>
    act.mutate({ action, type: d.type, id: t.id, reason: reason.trim() }, { onSuccess: done, onError: fail });

  const onHide = () => confirmThen(i18n.nPgAdHideTitle, i18n.nPgAdHideBody, i18n.nPgAdHide, i18n.cancel, () => run('hide'));
  const onRemove = () => {
    if (!reason.trim()) {
      toast.error(i18n.nPgAdReasonRequired);
      return;
    }
    confirmThen(i18n.nPgAdRemoveTitle, i18n.nPgAdRemoveBody, i18n.nPgAdRemove, i18n.cancel, () => run('remove'));
  };
  const onDismiss = () =>
    confirmThen(i18n.nPgAdDismissTitle, i18n.nPgAdDismissBody, i18n.nPgAdDismiss, i18n.cancel, () => run('dismiss'));
  const onRestore = () => run('restore');
  const onApprove = (appealId: string) =>
    decide.mutate({ id: appealId, approve: true, reason: reason.trim() }, { onSuccess: done, onError: fail });
  const onReject = (appealId: string) =>
    confirmThen(i18n.nPgAdRejectTitle, i18n.nPgAdRejectBody, i18n.nPgAdReject, i18n.cancel, () =>
      decide.mutate({ id: appealId, approve: false, reason: reason.trim() }, { onSuccess: done, onError: fail }),
    );

  return (
    <>
      <View style={a.section}>
        <View style={a.rowHead}>
          <StateTag hidden={t.hidden} removed={removed} />
          <Text style={a.meta}>{timeAgo(t.created_at, i18n, lang)}</Text>
        </View>
        <Text style={styles.content} selectable>
          {text}
        </Text>
        {d.type === 'comment' && t.post_id ? (
          <PressScale
            style={[a.btn, styles.inlineBtn]}
            accessibilityRole="link"
            onPress={() => nav.push(`/admin/target?type=post&id=${t.post_id}` as never)}
          >
            <Text style={a.btnText}>{i18n.nPgAdPost}</Text>
          </PressScale>
        ) : null}
        {d.author ? (
          role === 'admin' ? (
            <PressScale
              style={styles.author}
              accessibilityRole="link"
              accessibilityLabel={`${i18n.nPgAdAuthor}: @${d.author.handle}`}
              onPress={() => nav.push(`/admin/user?id=${d.author!.user_id}` as never)}
            >
              <Text style={a.meta}>{i18n.nPgAdAuthor}</Text>
              <Text style={styles.authorName}>
                {d.author.display_name} · @{d.author.handle} · {roleLabel(d.author.role)}
              </Text>
            </PressScale>
          ) : (
            <View style={styles.author}>
              <Text style={a.meta}>{i18n.nPgAdAuthor}</Text>
              <Text style={styles.authorName}>
                {d.author.display_name} · @{d.author.handle} · {roleLabel(d.author.role)}
              </Text>
            </View>
          )
        ) : null}
      </View>

      <View style={[a.section, styles.decide]}>
        <ReasonField value={reason} onChange={setReason} />
        <View style={a.actions}>
          {!t.hidden ? (
            <Btn label={i18n.nPgAdHide} onPress={onHide} disabled={busy} />
          ) : !removed || role === 'admin' ? (
            <Btn label={i18n.nPgAdRestore} onPress={onRestore} disabled={busy} />
          ) : null}
          {!removed ? <Btn label={i18n.nPgAdRemove} onPress={onRemove} disabled={busy} danger /> : null}
          {!t.hidden && openReports > 0 ? <Btn label={i18n.nPgAdDismiss} onPress={onDismiss} disabled={busy} /> : null}
        </View>
        {removed && role !== 'admin' ? <Text style={a.meta}>{i18n.nPgAdAdminRestoreOnly}</Text> : null}
      </View>

      {d.author && d.author.role === 'user' ? (
        <AuthorRestriction user={d.author.user_id} handle={d.author.handle} reason={reason} onDone={() => setReason('')} />
      ) : null}

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdAppealsHeading}
        </Text>
        {d.appeals.length === 0 ? (
          <Empty text={i18n.nPgAdNoAppeals} />
        ) : (
          <View style={a.panel}>
            {d.appeals.map((p, i) => (
              <View key={p.id} style={[a.row, i > 0 && a.rule]}>
                <View style={a.rowHead}>
                  <Text style={a.strong}>
                    {p.status === 'open' ? i18n.nPgAdAppealOpen : p.status === 'restored' ? i18n.nPgAdAppealRestored : i18n.nPgAdAppealUpheld}
                  </Text>
                  <Text style={a.meta}>{timeAgo(p.created_at, i18n, lang)}</Text>
                </View>
                <Text style={styles.message} selectable>
                  {p.message || i18n.nPgAdNoMessage}
                </Text>
                {openAppeal?.id === p.id ? (
                  <View style={[a.actions, styles.appealActions]}>
                    <Btn label={i18n.nPgAdApprove} onPress={() => onApprove(p.id)} disabled={busy} primary />
                    <Btn label={i18n.nPgAdReject} onPress={() => onReject(p.id)} disabled={busy} danger />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={a.section}>
        <Text style={a.heading} accessibilityRole="header">
          {i18n.nPgAdReportsHeading}
        </Text>
        {/* Báo cáo của tài khoản chưa đủ điều kiện (#6) vẫn hiện — người
            kiểm duyệt cần thấy hết — nhưng nói rõ nó không đẩy bài tới ngưỡng. */}
        {d.reports.some((r) => r.counted === false) ? <Text style={a.meta}>{i18n.nPgAdNotCountedHint}</Text> : null}
        {d.reports.length === 0 ? (
          <Empty text={i18n.nPgAdNoReports} />
        ) : (
          <View style={a.panel}>
            {d.reports.map((r, i) => (
              <View key={r.id} style={[a.row, i > 0 && a.rule]}>
                <View style={a.rowHead}>
                  <Text style={a.strong}>{reasonLabel(r.reason)}</Text>
                  <Text style={a.meta}>
                    {r.status === 'open' ? i18n.nPgAdStatusOpen : r.status === 'actioned' ? i18n.nPgAdStatusActioned : i18n.nPgAdStatusDismissed}
                  </Text>
                  {r.counted === false ? <Text style={styles.notCounted}>{i18n.nPgAdNotCounted}</Text> : null}
                  <Text style={styles.when}>{timeAgo(r.created_at, i18n, lang)}</Text>
                </View>
                {r.note ? <Text style={a.excerpt}>{r.note}</Text> : null}
                <Text style={a.meta}>{r.reporter ? `@${r.reporter.handle}` : ''}</Text>
              </View>
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

function Btn({
  label,
  onPress,
  disabled,
  danger,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const c = usePalette();
  const a = adminStyles(c);
  return (
    <PressScale
      style={[a.btn, danger && a.btnDanger, primary && a.btnPrimary, disabled && a.btnOff]}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
    >
      <Text style={danger ? a.btnDangerText : primary ? a.btnPrimaryText : a.btnText}>{label}</Text>
    </PressScale>
  );
}

/**
 * Khoá đăng tác giả (20261007235000) — ngay dưới quyết định về bài, vì người
 * kiểm duyệt nhìn thấy kẻ rải bài ĐÚNG ở đây. Dùng chung ô lý do ở trên; khoá
 * bắt buộc có lý do (server cũng từ chối), và luôn hỏi lại trước.
 */
function AuthorRestriction({ user, handle, reason, onDone }: { user: string; handle: string; reason: string; onDone: () => void }) {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const q = useModUserRestriction(user);
  const restrict = useModRestrict();
  const unrestrict = useModUnrestrict();
  const busy = restrict.isPending || unrestrict.isPending;
  const fail = (e: unknown) => toast.error(decisionError(e, i18n));
  const done = () => {
    onDone();
    toast.success(i18n.nPgAdDone);
  };
  const ask = (hours: number) => {
    if (!reason.trim()) {
      toast.error(i18n.nPgAdRestrictNeedsReason);
      return;
    }
    confirmThen(
      fillCopy(i18n.nPgAdRestrictTitle, { h: handle }),
      i18n.nPgAdRestrictBody,
      hours === 24 ? i18n.nPgAdRestrict24 : i18n.nPgAdRestrict7d,
      i18n.cancel,
      () => restrict.mutate({ user, hours, reason: reason.trim() }, { onSuccess: done, onError: fail }),
    );
  };
  const r = q.data;
  return (
    <View style={a.section} testID="author-restriction">
      <Text style={a.heading} accessibilityRole="header">
        {i18n.nPgAdRestrictHeading}
      </Text>
      {q.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => q.refetch()} />
      ) : q.isPending ? null : r ? (
        <>
          <Text style={a.meta}>
            {fillCopy(i18n.nPgAdRestrictedUntil, {
              d: new Date(r.until).toLocaleDateString(getLocale(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
              r: r.reason,
            })}
          </Text>
          <View style={a.actions}>
            <Btn
              label={i18n.nPgAdUnrestrict}
              onPress={() => unrestrict.mutate({ user, reason: reason.trim() }, { onSuccess: done, onError: fail })}
              disabled={busy}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={a.meta}>{i18n.nPgAdNotRestricted}</Text>
          <View style={a.actions}>
            <Btn label={i18n.nPgAdRestrict24} onPress={() => ask(24)} disabled={busy} danger />
            <Btn label={i18n.nPgAdRestrict7d} onPress={() => ask(24 * 7)} disabled={busy} danger />
          </View>
        </>
      )}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  content: { ...type.body, color: c.foreground, lineHeight: 22, maxWidth: 680 },
  /* Chữ caption đậm như nhãn trạng thái của hàng đợi, màu trầm: một ghi chú cho
     người kiểm duyệt, không phải một cảnh báo. */
  notCounted: { ...type.caption, color: c.mutedForeground, fontWeight: '700' },
  inlineBtn: { alignSelf: 'flex-start' },
  author: { gap: 2, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  authorName: { ...type.body, color: c.foreground, fontWeight: '600' },
  decide: {
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  message: { ...type.body, color: c.foreground, fontStyle: 'italic' },
  appealActions: { marginTop: spacing.xs },
  when: { ...type.caption, color: c.mutedForeground, marginLeft: 'auto', paddingLeft: spacing.sm },
}));
