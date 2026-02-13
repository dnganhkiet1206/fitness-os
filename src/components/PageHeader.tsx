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
      {sticky && <div className="shrink-0" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }} />}
      <header
        className={`${sticky ? 'fixed top-0 left-0 right-0 z-50' : ''}`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'hsl(var(--background) / 0.72)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          borderBottom: '0.5px solid hsl(var(--border) / 0.6)',
        }}
      >
        <div className="max-w-4xl mx-auto px-1 h-[44px] flex items-center">
          <motion.button
            onClick={() => navigate(backTo)}
            whileTap={{ scale: 0.88 }}
            transition={spring}
            className="flex items-center gap-0 px-2 h-[44px] text-primary active:opacity-60 transition-opacity shrink-0"
          >
            <ChevronLeft className="w-[22px] h-[22px] -mr-0.5" strokeWidth={2.5} />
            <span className="text-[17px] font-normal">Back</span>
          </motion.button>
          <h1 className="text-[17px] font-semibold tracking-tight flex-1 min-w-0 text-center -ml-16">
            {gradient ? <span className="text-gradient-green">{title}</span> : title}
          </h1>
          <div className="flex items-center gap-0.5 pr-2 shrink-0">
            {children}
          </div>
        </div>
      </header>
    </>
  );
}