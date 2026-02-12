import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.5 } },
};

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="max-w-5xl mx-auto px-4 py-5 space-y-5"
      >
        {/* Greeting skeleton */}
        <motion.div variants={fadeUp} className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40 rounded-lg" />
            <Skeleton className="h-7 w-56 rounded-lg" />
          </div>
          <Skeleton className="w-11 h-11 rounded-2xl" />
        </motion.div>

        {/* Quick actions skeleton */}
        <motion.div variants={fadeUp} className="flex gap-2.5">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-8 w-24 rounded-xl" />
          ))}
        </motion.div>

        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Skeleton className="h-52 w-full rounded-2xl" />
          </motion.div>
          <div className="lg:col-span-2 space-y-5">
            <motion.div variants={fadeUp}>
              <Skeleton className="h-24 w-full rounded-2xl" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <Skeleton className="h-24 w-full rounded-2xl" />
            </motion.div>
          </div>
        </div>

        {/* Second row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div variants={fadeUp}>
            <Skeleton className="h-36 w-full rounded-2xl" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <Skeleton className="h-36 w-full rounded-2xl" />
          </motion.div>
        </div>

        {/* Third row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div variants={fadeUp}>
            <Skeleton className="h-36 w-full rounded-2xl" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <Skeleton className="h-36 w-full rounded-2xl" />
          </motion.div>
        </div>

        {/* Fourth row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <motion.div key={i} variants={fadeUp}>
              <Skeleton className="h-28 w-full rounded-2xl" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
