import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { LANGUAGES } from '@/lib/i18n';
import { Globe } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const { lang, setLang } = useAppSettings();
  const i18n = t(lang);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">
        {i18n.loading}
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
      else toast.success(i18n.authCheckEmail);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Language selector */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
        <Globe className="w-4 h-4 text-muted-foreground" />
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${lang === l.code ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'}`}
          >
            {l.flag} {l.code.toUpperCase()}
          </button>
        ))}
      </div>

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
            {isLogin ? i18n.authLoginSubtitle : i18n.authSignupSubtitle}
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
                <Label htmlFor="name">{i18n.authName}</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={i18n.authYourName} required={!isLogin} className="rounded-xl bg-background/50" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="space-y-2">
            <Label htmlFor="email">{i18n.authEmail}</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required className="rounded-xl bg-background/50" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{i18n.authPassword}</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="rounded-xl bg-background/50" />
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}>
            <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={submitting}>
              {submitting ? i18n.authProcessing : isLogin ? i18n.authLogin : i18n.authSignup}
            </Button>
          </motion.div>
        </motion.form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? i18n.authNoAccount : i18n.authHasAccount}{' '}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-semibold transition-colors">
            {isLogin ? i18n.authSignup : i18n.authLogin}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
