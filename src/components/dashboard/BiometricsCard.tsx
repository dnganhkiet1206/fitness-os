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
    { label: 'Heart Rate', value: m.hr_bpm, unit: 'bpm', icon: Heart, color: 'text-readiness-red' },
    { label: 'HRV (RMSSD)', value: m.hrv_rmssd_ms, unit: 'ms', icon: Activity, color: 'text-readiness-green' },
    { label: 'SpO₂', value: m.spo2_pct, unit: '%', icon: Droplets, color: 'text-metric-blue' },
    { label: 'VO₂max', value: m.vo2max_mlkgmin, unit: 'ml/kg/min', icon: Wind, color: 'text-metric-cyan', estimated: true },
    { label: 'Resp Rate', value: m.resp_rate_rpm, unit: 'rpm', icon: Wind, color: 'text-metric-purple' },
  ];

  return (
    <div className="metric-card space-y-5 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sinh Trắc Học</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {connectedDevice ? (
            <>
              <Wifi className="w-3 h-3 text-readiness-green" />
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.filter(m => m.value !== undefined).map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 + i * 0.06 }}
            className="flex items-start gap-2.5 bg-secondary/30 rounded-xl p-3.5"
          >
            <metric.icon className={`w-4 h-4 mt-0.5 ${metric.color} shrink-0`} />
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
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Nguồn: {sample.source === 'camera_rppg' ? 'Camera rPPG' : sample.source}</span>
        <span>·</span>
        <span>Độ tin cậy: {confidence}%</span>
        {sample.source === 'camera_rppg' && <span className="text-readiness-yellow">⚠ Dự phòng</span>}
      </div>
    </div>
  );
};

export default BiometricsCard;
