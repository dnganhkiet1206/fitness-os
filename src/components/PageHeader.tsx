import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 400, damping: 34, mass: 0.8 };

interface PageHeaderProps {
  title: string;
  backTo?: string;
  gradient?: boolean;
  children?: React.ReactNode;
  sticky?: boolean;
}

export default function PageHeader({ title, backTo = '/', gradient = false, children, sticky = true }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Spacer to prevent content from hiding behind fixed header */}
      {sticky && <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }} />}
      <header
        className={`${sticky ? 'fixed top-0 left-0 right-0 z-50' : ''} border-b border-border/40`}
        style={{
          background: 'hsl(var(--card) / 0.55)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          boxShadow: '0 1px 0 hsl(0 0% 100% / 0.04) inset, 0 4px 20px hsl(0 0% 0% / 0.15)',
        }}
      >
        <div className="pt-safe">
          <div className="max-w-4xl mx-auto px-4 h-11 flex items-center gap-2.5">
            <motion.button
              onClick={() => navigate(backTo)}
              whileTap={{ scale: 0.82 }}
              transition={spring}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-foreground active:bg-secondary/60 transition-colors shrink-0 touch-target"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            <h1 className="text-lg font-bold tracking-tight flex-1 min-w-0">
              {gradient ? <span className="text-gradient-green">{title}</span> : title}
            </h1>
            {children}
          </div>
        </div>
      </header>
    </>
  );
}
