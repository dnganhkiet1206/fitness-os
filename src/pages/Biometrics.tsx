import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Activity, Wind, Droplets, Flame, Camera, PenLine, TrendingUp, TrendingDown, Minus, AlertCircle, Watch, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBiometricHistory, useLatestBiometrics } from '@/hooks/useBiometrics';
import { useHealthSync } from '@/hooks/useHealthSync';

import LogBiometricsDialog from '@/components/logging/LogBiometricsDialog';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

interface MetricConfig {
  key: string;
  labelKey: 'biometricsHeartRate' | 'biometricsBreathRate';
  label: string;
  unit: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  normalRange: [number, number];
  extract: (s: any) => number | null;
}

function getMetrics(i18n: ReturnType<typeof t>): MetricConfig[] {
  return [
    {
      key: 'hr', labelKey: 'biometricsHeartRate', label: i18n.biometricsHeartRate, unit: 'bpm', icon: Heart,
      color: 'hsl(350, 89%, 60%)', gradient: 'from-[hsl(350,89%,60%)] to-[hsl(350,89%,40%)]',
      normalRange: [50, 100], extract: s => s.hr_bpm,
    },
    {
      key: 'hrv', labelKey: 'biometricsHeartRate', label: 'HRV', unit: 'ms', icon: Activity,
      color: 'hsl(160, 84%, 39%)', gradient: 'from-[hsl(160,84%,39%)] to-[hsl(160,84%,25%)]',
      normalRange: [20, 100], extract: s => s.hrv_rmssd_ms,
    },
    {
      key: 'spo2', labelKey: 'biometricsHeartRate', label: 'SpO₂', unit: '%', icon: Droplets,
      color: 'hsl(217, 91%, 60%)', gradient: 'from-[hsl(217,91%,60%)] to-[hsl(217,91%,40%)]',
      normalRange: [95, 100], extract: s => s.spo2_pct,
    },
    {
      key: 'vo2max', labelKey: 'biometricsHeartRate', label: 'VO₂max', unit: 'ml/kg/min', icon: Flame,
      color: 'hsl(25, 95%, 58%)', gradient: 'from-[hsl(25,95%,58%)] to-[hsl(25,95%,40%)]',
      normalRange: [30, 60], extract: s => s.vo2max_mlkgmin,
    },
    {
      key: 'resp', labelKey: 'biometricsBreathRate', label: i18n.biometricsBreathRate, unit: 'rpm', icon: Wind,
      color: 'hsl(265, 90%, 66%)', gradient: 'from-[hsl(265,90%,66%)] to-[hsl(265,90%,46%)]',
      normalRange: [12, 20], extract: s => s.resp_rate_rpm,
    },
  ];
}

function getStatus(value: number, range: [number, number]): 'good' | 'warn' | 'bad' {
  if (value >= range[0] && value <= range[1]) return 'good';
  const margin = (range[1] - range[0]) * 0.15;
  if (value >= range[0] - margin && value <= range[1] + margin) return 'warn';
  return 'bad';
}

function StatusDot({ status }: { status: 'good' | 'warn' | 'bad' }) {
  const colors = { good: 'bg-readiness-green', warn: 'bg-readiness-yellow', bad: 'bg-readiness-red' };
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

function TrendIcon({ data, extractor }: { data: any[]; extractor: (s: any) => number | null }) {
  if (data.length < 2) return <Minus className="w-3 h-3 text-muted-foreground" />;
  const recent = data.slice(-3).map(extractor).filter((v): v is number => v != null);
  const older = data.slice(-6, -3).map(extractor).filter((v): v is number => v != null);
  if (recent.length === 0 || older.length === 0) return <Minus className="w-3 h-3 text-muted-foreground" />;
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const diff = avgRecent - avgOlder;
  if (Math.abs(diff) < 1) return <Minus className="w-3 h-3 text-muted-foreground" />;
  return diff > 0
    ? <TrendingUp className="w-3 h-3 text-readiness-green" />
    : <TrendingDown className="w-3 h-3 text-readiness-red" />;
}

function MetricCard({ metric, latest, history, index, i18n, locale }: { metric: MetricConfig; latest: any; history: any[]; index: number; i18n: ReturnType<typeof t>; locale: string }) {
  const Icon = metric.icon;
  const value = latest ? metric.extract(latest) : null;
  const status = value != null ? getStatus(value, metric.normalRange) : null;

  const chartData = history
    .map(s => ({ date: new Date(s.date_time).toLocaleDateString(locale, { day: 'numeric', month: 'short' }), value: metric.extract(s) }))
    .filter(d => d.value != null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.06 * index }}
      className="metric-card card-shimmer space-y-3 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: `radial-gradient(circle at 30% 20%, ${metric.color}, transparent 60%)` }} />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${metric.gradient} flex items-center justify-center`} style={{ boxShadow: `0 0 12px ${metric.color}40` }}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{metric.label}</p>
            {value != null ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold font-mono">{Math.round(value)}</span>
                <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
                {status && <StatusDot status={status} />}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">{i18n.noData}</span>
            )}
          </div>
        </div>
        <TrendIcon data={history} extractor={metric.extract} />
      </div>

      {chartData.length > 1 && (
        <div className="h-16 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`grad-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metric.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={metric.color} strokeWidth={1.5} fill={`url(#grad-${metric.key})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {latest && (
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
          <AlertCircle className="w-2.5 h-2.5" />
          <span>
            {latest.source === 'camera_rppg' ? i18n.biometricsSourceCamera : latest.source === 'wearable' ? i18n.biometricsSourceWearable : i18n.biometricsSourceManual}
            {latest.confidence != null && ` · ${Math.round(latest.confidence * 100)}% ${i18n.biometricsConfidence}`}
          </span>
        </div>
      )}
    </motion.div>
  );
}

export default function Biometrics() {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const { data: history, isLoading } = useBiometricHistory(14);
  const { data: latest } = useLatestBiometrics();
  const { available: healthAvailable, checking: healthChecking, syncing, sync } = useHealthSync();
  const METRICS = getMetrics(i18n);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="space-y-1"
      >
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Heart className="w-5 h-5 text-[hsl(350,89%,60%)]" />
          {i18n.biometricsTitle}
        </h2>
        <p className="text-xs text-muted-foreground">{i18n.biometricsSubtitle}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        className="flex gap-2 flex-wrap"
      >
        
        <LogBiometricsDialog>
          <Button variant="outline" size="sm" className="rounded-xl border-border/40 bg-secondary/20 hover:bg-secondary/50 backdrop-blur-xl haptic-press">
            <PenLine className="w-3.5 h-3.5 mr-1.5" /> {i18n.biometricsManual}
          </Button>
        </LogBiometricsDialog>
        {!healthChecking && healthAvailable && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/40 bg-secondary/20 hover:bg-secondary/50 backdrop-blur-xl haptic-press"
            onClick={sync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Watch className="w-3.5 h-3.5 mr-1.5" />}
            {syncing ? i18n.biometricsSyncing : i18n.biometricsSyncWearable}
          </Button>
        )}
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-card/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {METRICS.map((m, i) => (
            <MetricCard key={m.key} metric={m} latest={latest} history={history ?? []} index={i} i18n={i18n} locale={locale} />
          ))}
        </div>
      )}

      {history && history.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.3 }}
          className="metric-card overflow-hidden"
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">{i18n.biometricsRecentHistory}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20">
                  <th className="text-left py-2 text-muted-foreground font-medium">{i18n.biometricsTime}</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">HR</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">HRV</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">SpO₂</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">VO₂</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">{i18n.biometricsSource}</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 10).map(s => (
                  <tr key={s.id} className="border-b border-border/10">
                    <td className="py-2 font-mono text-muted-foreground">
                      {new Date(s.date_time).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                      {' '}
                      {new Date(s.date_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="text-right py-2 font-mono">{s.hr_bpm ?? '—'}</td>
                    <td className="text-right py-2 font-mono">{s.hrv_rmssd_ms ?? '—'}</td>
                    <td className="text-right py-2 font-mono">{s.spo2_pct ?? '—'}</td>
                    <td className="text-right py-2 font-mono">{s.vo2max_mlkgmin ?? '—'}</td>
                    <td className="text-right py-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        s.source === 'camera_rppg' ? 'bg-metric-orange/10 text-metric-orange' :
                        s.source === 'wearable' ? 'bg-primary/10 text-primary' :
                        'bg-secondary/30 text-muted-foreground'
                      }`}>
                        {s.source === 'camera_rppg' ? 'Camera' : s.source === 'wearable' ? 'Wearable' : 'Manual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {(!history || history.length === 0) && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 space-y-3"
        >
          <Heart className="w-12 h-12 mx-auto text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">{i18n.biometricsNoData}</p>
          <p className="text-xs text-muted-foreground/60">{i18n.biometricsNoDataMsg}</p>
        </motion.div>
      )}

      {/* Health Safety Disclaimer */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.35 }}
        className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
          <h3 className="text-xs font-bold text-destructive">{i18n.biometricsDisclaimerTitle}</h3>
        </div>
        <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 text-destructive/70 shrink-0 mt-0.5" />
            <p>{i18n.biometricsDisclaimer1}</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 text-destructive/70 shrink-0 mt-0.5" />
            <p>{i18n.biometricsDisclaimer2}</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 text-destructive/70 shrink-0 mt-0.5" />
            <p>{i18n.biometricsDisclaimer3}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
