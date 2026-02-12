import { motion } from 'framer-motion';
import type { BiometricSample, WearableSource } from '@/lib/types';
import { Heart, Activity, Wind, Droplets, Wifi, WifiOff } from 'lucide-react';

interface BiometricsCardProps {
  sample: BiometricSample;
  wearables: WearableSource[];
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const BiometricsCard = ({ sample, wearables }: BiometricsCardProps) => {
  const m = sample.metrics;
  const confidence = Math.round(sample.confidence_0_1 * 100);
  const connectedDevice = wearables.find(w => w.connected);

  const metrics = [
    { label: 'Heart Rate', value: m.hr_bpm, unit: 'bpm', icon: Heart, gradient: 'from-[hsl(0,100%,60%)] to-[hsl(340,100%,55%)]', iconColor: 'text-destructive' },
    { label: 'HRV', value: m.hrv_rmssd_ms, unit: 'ms', icon: Activity, gradient: 'from-[hsl(160,84%,39%)] to-[hsl(120,100%,45%)]', iconColor: 'text-readiness-green' },
    { label: 'SpO₂', value: m.spo2_pct, unit: '%', icon: Droplets, gradient: 'from-[hsl(217,91%,60%)] to-[hsl(195,100%,50%)]', iconColor: 'text-metric-blue' },
    { label: 'VO₂max', value: m.vo2max_mlkgmin, unit: 'ml/kg/min', icon: Wind, gradient: 'from-[hsl(190,95%,50%)] to-[hsl(160,84%,39%)]', iconColor: 'text-metric-cyan', estimated: true },
    { label: 'Resp Rate', value: m.resp_rate_rpm, unit: 'rpm', icon: Wind, gradient: 'from-[hsl(265,90%,66%)] to-[hsl(217,91%,60%)]', iconColor: 'text-metric-purple' },
  ];

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at top left, hsl(0 100% 60%), transparent 50%)' }} />

      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sinh Trắc Học</h3>
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
              <span>Chưa kết nối</span>
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
            {/* Hover gradient */}
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
                    <span className="ml-1 text-readiness-yellow">est.</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground relative">
        <span>Nguồn: {sample.source === 'camera_rppg' ? 'Camera rPPG' : sample.source}</span>
        <span>·</span>
        <span>Độ tin cậy: <span className="font-mono text-foreground">{confidence}%</span></span>
        {sample.source === 'camera_rppg' && <span className="text-readiness-yellow">⚠ Dự phòng</span>}
      </div>
    </div>
  );
};

export default BiometricsCard;
