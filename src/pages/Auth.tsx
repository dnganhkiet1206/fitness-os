import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">
        Đang tải...
      </motion.div>
    </div>
  );
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) toast.error(error.message);
    } else {
      const { error } = await signUp(email, password, name);
      if (error) toast.error(error.message);
      else toast.success('Kiểm tra email để xác nhận tài khoản!');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] left-[30%] w-[40%] h-[40%] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ ...spring, duration: 0.7 }}
        className="w-full max-w-sm space-y-8 relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...spring }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-gradient-green">Fitness</span>
            <span className="text-foreground"> OS</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3">
            {isLogin ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản mới'}
          </p>
        </motion.div>

        <motion.form
          onSubmit={handleSubmit}
          className="space-y-5 metric-card relative"
          layout
          transition={{ layout: { ...spring, duration: 0.4 } }}
        >
          <AnimatePresence mode="popLayout">
            {!isLogin && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ ...spring, duration: 0.3 }}
                className="space-y-2 overflow-hidden"
              >
                <Label htmlFor="name">Tên</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Tên của bạn" required={!isLogin} className="rounded-xl bg-background/50" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required className="rounded-xl bg-background/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="rounded-xl bg-background/50" />
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}>
            <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={submitting}>
              {submitting ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Đăng ký'}
            </Button>
          </motion.div>
        </motion.form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-semibold transition-colors">
            {isLogin ? 'Đăng ký' : 'Đăng nhập'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
