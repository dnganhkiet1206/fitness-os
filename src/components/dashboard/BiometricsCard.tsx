import { motion } from 'framer-motion';
import type { BiometricSample, WearableSource } from '@/lib/types';
import { Heart, Activity, Wind, Droplets, Wifi, WifiOff } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface BiometricsCardProps {
  sample: BiometricSample;
  wearables: WearableSource[];
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const BiometricsCard = ({ sample, wearables }: BiometricsCardProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const m = sample.metrics;
  const confidence = Math.round(sample.confidence_0_1 * 100);
  const connectedDevice = wearables.find(w => w.connected);

  const metrics = [
    { label: 'Heart Rate', value: m.hr_bpm, unit: 'bpm', icon: Heart, gradient: 'from-[hsl(0,72%,51%)] to-[hsl(340,80%,50%)]', iconColor: 'text-destructive' },
    { label: 'HRV', value: m.hrv_rmssd_ms, unit: 'ms', icon: Activity, gradient: 'from-[hsl(38,92%,50%)] to-[hsl(42,90%,62%)]', iconColor: 'text-gold' },
    { label: 'SpO₂', value: m.spo2_pct, unit: '%', icon: Droplets, gradient: 'from-[hsl(215,80%,58%)] to-[hsl(188,80%,48%)]', iconColor: 'text-metric-blue' },
    { label: 'VO₂max', value: m.vo2max_mlkgmin, unit: 'ml/kg/min', icon: Wind, gradient: 'from-[hsl(188,80%,48%)] to-[hsl(160,70%,42%)]', iconColor: 'text-metric-cyan', estimated: true },
    { label: 'Resp Rate', value: m.resp_rate_rpm, unit: 'rpm', icon: Wind, gradient: 'from-[hsl(265,70%,60%)] to-[hsl(215,80%,58%)]', iconColor: 'text-metric-purple' },
  ];

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at top left, hsl(38 92% 50%), transparent 50%)' }} />

      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{T.dcBioTitle}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connectedDevice ? (
            <>
              <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <Wifi className="w-3 h-3 text-readiness-green" />
              </motion.div>
              <span className="capitalize">{connectedDevice.provider.replace('_', ' ')}</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-readiness-red" />
              <span>{T.dcBioNotConnected}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 relative">
        {metrics.filter(m => m.value !== undefined).map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.1 + i * 0.06 }}
            className="group relative bg-secondary/20 rounded-xl p-3.5 border border-border/20 hover:border-border/40 transition-all duration-300 overflow-hidden"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${metric.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300 rounded-xl`} />
            
            <div className="relative flex items-start gap-2.5">
              <motion.div 
                className={`${metric.iconColor} mt-0.5`}
                animate={metric.label === 'Heart Rate' ? { scale: [1, 1.15, 1] } : {}}
                transition={metric.label === 'Heart Rate' ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : {}}
              >
                <metric.icon className="w-4 h-4" />
              </motion.div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-mono font-bold text-foreground">{metric.value}</span>
                  <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {metric.label}
                  {metric.estimated && (
                    <span className="ml-1 text-readiness-yellow">{T.dcBioEstimate}</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground relative">
        <span>{T.dcBioSource}: {sample.source === 'camera_rppg' ? 'Camera rPPG' : sample.source}</span>
        <span>·</span>
        <span>{T.dcBioConfidence}: <span className="font-mono text-foreground">{confidence}%</span></span>
        {sample.source === 'camera_rppg' && <span className="text-readiness-yellow">⚠ {T.dcBioFallback}</span>}
      </div>
    </div>
  );
};

export default BiometricsCard;
