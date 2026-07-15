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
  showBack?: boolean;
}

export default function PageHeader({ title, backTo = '/', gradient = false, children, sticky = true, showBack = true }: PageHeaderProps) {
  const navigate = useNavigate();

  const goBack = () => {
    // Real history pop gets the iOS pop transition; fall back to backTo when
    // this page was the entry point (deep link, reload).
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(backTo, { replace: true });
  };

  return (
    <header
      className={`${sticky ? 'sticky top-0 z-50' : ''}`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'hsl(var(--glass-bg))',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderBottom: '0.5px solid hsl(var(--glass-border))',
        boxShadow: 'var(--glass-inner-shadow), var(--glass-shadow)',
      }}
    >
      <div className="max-w-4xl mx-auto px-1 h-[44px] flex items-center">
        {showBack ? (
          <motion.button
            onClick={goBack}
            whileTap={{ scale: 0.88 }}
            transition={spring}
            className="flex items-center justify-center w-[44px] h-[44px] text-primary active:opacity-60 transition-opacity shrink-0"
          >
            <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2} />
          </motion.button>
        ) : (
          <div className="w-[44px] h-[44px] shrink-0" />
        )}
        <h1 className="text-[17px] font-semibold tracking-tight flex-1 min-w-0 text-center -ml-[44px]">
          {gradient ? <span className="text-gradient-gold">{title}</span> : title}
        </h1>
        <div className="flex items-center gap-0.5 pr-2 shrink-0">
          {children}
        </div>
      </div>
    </header>
  );
}