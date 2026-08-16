import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useKoaContext } from '@/hooks/use-koa-context';
import { KOA_LINE_KEY, type KoaContext, type KoaDecision } from '@/lib/koa-decide';
import { comebackMagnitude, streakMagnitude, TIER_MAGNITUDE, type KoaEvent } from '@/lib/koa-event';
import { emitKoa, resetKoaStage, useKoaReaction } from '@/lib/koa-stage';
import { UNKNOWN_STATE, type Situation } from '@/lib/user-state';

/**
 * Koa's brain, made visible.
 *
 * ── why a screen and not a console log ──
 *
 * Because the interesting output is a *decision*, and the interesting decisions
 * are the ones where Koa does nothing. A log line that never prints is
 * indistinguishable from a log line that was never reached, so the silences —
 * the whole point of the engine — were the part nobody could see. Here every
 * press prints an answer, including "no, and here is why".
 *
 * It is also the only way to tune this. The magnitudes and thresholds are
 * judgements about how big a thing feels, and a judgement is checked by firing
 * the event and reading what came out, not by re-reading the arithmetic.
 *
 * Deliberately plain: this is a developer tool and time spent styling it is
 * time not spent on the character.
 */
const CASES: { label: string; event: Omit<KoaEvent, 'magnitude'> & { magnitude: number } }[] = [
  { label: 'PR', event: { kind: 'personal_record', magnitude: TIER_MAGNITUDE.gold } },
  { label: 'Huy hiệu nhỏ', event: { kind: 'award_earned', magnitude: TIER_MAGNITUDE.bronze } },
  { label: 'Huy hiệu lớn', event: { kind: 'award_earned', magnitude: TIER_MAGNITUDE.platinum } },
  { label: 'Lên cấp', event: { kind: 'level_up', magnitude: 0.7 } },
  { label: 'Chuỗi 30 ngày', event: { kind: 'award_earned', magnitude: streakMagnitude(30) } },
  { label: 'Bù chuỗi', event: { kind: 'streak_saved', magnitude: streakMagnitude(12), days: 12 } },
  { label: 'Quay lại (14 ngày)', event: { kind: 'comeback', magnitude: comebackMagnitude(14), days: 14 } },
  { label: 'Xong cả ngày', event: { kind: 'day_complete', magnitude: 0.6 } },
  { label: 'Xong buổi tập', event: { kind: 'quest_done', quest: 'workout', magnitude: 0.5 } },
  { label: 'Việc nhỏ (nước)', event: { kind: 'quest_done', quest: 'water', magnitude: 0.1 } },
  { label: 'Chuỗi sắp mất', event: { kind: 'streak_at_risk', magnitude: 0.8 } },
  { label: 'Chạm Koa', event: { kind: 'koa_greeted', magnitude: 0.3 } },
];

/**
 * The situations `decide` reads, forceable.
 *
 * ── why an override and not "just have a bad fortnight" ──
 *
 * `koa_greeted` now answers differently for somebody returning after an absence
 * and somebody in a load spike. Both are real, both are rare, and neither can be
 * produced on a development device without either waiting a fortnight or writing
 * fake rows. A branch that can only be seen by living it is a branch nobody will
 * ever look at — which is exactly how `koa_greeted` came to sit in the engine,
 * fully written, with nothing firing it.
 *
 * `null` means "use the real state", so the default is still the truth.
 */
const SITUATIONS: (Situation | null)[] = [
  null,
  'settling_in',
  'steady',
  'slipping',
  'returning',
  'overreaching',
];

export default function KoaDebugScreen() {
  const real = useKoaContext();
  const live = useKoaReaction();
  const [last, setLast] = useState<{ label: string; d: KoaDecision } | null>(null);
  const [forced, setForced] = useState<Situation | null>(null);

  /* The override replaces only the situation. Confidence is forced to `high`
     with it, because every branch downstream is gated on confidence and an
     override that left it at `none` would silently do nothing — a debug control
     that appears to work and does not is worse than no control. */
  const ctx: KoaContext =
    forced == null
      ? real
      : { ...real, state: { ...(real.state ?? UNKNOWN_STATE), situation: forced, confidence: 'high' } };

  const fire = (label: string, event: KoaEvent) => {
    /* A fresh id every press: dedup is a production rule, and a debug button
       that only worked once would be a worse tool than no button. */
    const d = emitKoa({ ...event, id: `debug:${label}:${Date.now()}` }, ctx);
    setLast({ label, d });
  };

  return (
    <Screen title="Koa debug">
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h}>CONTEXT</Text>
        <Text style={styles.mono}>
          {`giờ ${ctx.hour}  ·  chuỗi ${ctx.streak}  ·  ` +
            `${ctx.state?.situation ?? '?'}/${ctx.state?.confidence ?? '?'}${forced ? ' (ÉP)' : ''}  ·  ` +
            `hôm nay trống: ${ctx.emptyToday ? 'có' : 'không'}  ·  nhìn thấy: ${ctx.visible ? 'có' : 'không'}\n` +
            `tuần này ${((ctx.state?.recent ?? 0) * 100) | 0}%  ·  nền ${((ctx.state?.baseline ?? 0) * 100) | 0}%  ·  ` +
            `${ctx.state?.because ?? '—'}`}
        </Text>

        <Text style={styles.h}>ÉP TRẠNG THÁI</Text>
        <View style={styles.grid}>
          {SITUATIONS.map((sit) => (
            <PressScale
              key={sit ?? 'that'}
              accessibilityRole="button"
              accessibilityLabel={sit ?? 'thật'}
              style={[styles.btn, forced === sit && styles.btnOn]}
              onPress={() => setForced(sit)}>
              <Text style={styles.btnText}>{sit ?? 'thật'}</Text>
            </PressScale>
          ))}
        </View>

        <Text style={styles.h}>SỰ KIỆN</Text>
        <View style={styles.grid}>
          {CASES.map((c) => (
            <PressScale
              key={c.label}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              style={styles.btn}
              onPress={() => fire(c.label, c.event as KoaEvent)}>
              <Text style={styles.btnText}>{c.label}</Text>
            </PressScale>
          ))}
        </View>

        <Text style={styles.h}>QUYẾT ĐỊNH</Text>
        {last ? (
          <View style={styles.card}>
            <Row k="EVENT" v={last.label} />
            <Row k="SHOULD REACT" v={last.d.shouldReact ? 'CÓ' : 'KHÔNG'} />
            <Row k="LÝ DO" v={last.d.because} />
            {/* The silence path prints as much as the reaction path — a
                decision engine you can only inspect when it says yes is one you
                cannot debug at all. */}
            {last.d.shouldReact ? (
              <>
                <Row k="EMOTION" v={last.d.emotion} />
                <Row k="INTENSITY" v={last.d.intensity.toFixed(2)} />
                <Row k="GAZE" v={last.d.gaze} />
                <Row k="HOLD" v={`${last.d.hold} ms`} />
                <Row k="DIALOGUE" v={last.d.say ? KOA_LINE_KEY[last.d.say] : '— (không lời)'} />
              </>
            ) : null}
          </View>
        ) : (
          <Text style={styles.mono}>chưa bắn sự kiện nào</Text>
        )}

        <Text style={styles.h}>ĐANG DIỄN</Text>
        <Text style={styles.mono}>
          {live
            ? `#${live.n} ${live.event.kind} · ${live.decision.emotion} · ${live.decision.intensity.toFixed(2)}`
            : '— trống'}
        </Text>

        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Xoá trạng thái"
          style={[styles.btn, styles.wide]}
          onPress={() => {
            resetKoaStage();
            setLast(null);
          }}>
          <Text style={styles.btnText}>Xoá trạng thái (dedup + sân khấu)</Text>
        </PressScale>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Mở phòng Koa"
          style={[styles.btn, styles.wide]}
          onPress={() => router.push('/mascot-room')}>
          <Text style={styles.btnText}>Xem Koa phản ứng trong phòng</Text>
        </PressScale>
      </ScrollView>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  h: { ...type.caption, fontWeight: '800', color: colors.mutedForeground, marginTop: spacing.sm },
  mono: { ...type.caption, color: colors.foreground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  btn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  /* The forced situation has to be visible at a glance, or the whole screen
     starts lying about which context produced the decision below it. */
  btnOn: { backgroundColor: colors.primary },
  wide: { alignItems: 'center', marginTop: spacing.xs },
  btnText: { ...type.caption, fontWeight: '600', color: colors.foreground },
  card: { gap: 4, padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)' },
  row: { flexDirection: 'row', gap: spacing.sm },
  k: { ...type.caption, color: colors.mutedForeground, width: 118 },
  v: { ...type.caption, color: colors.foreground, flex: 1, minWidth: 0 },
});
