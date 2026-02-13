import { useState } from 'react';
import logoAscnd from '@/assets/logo-ascnd.png';
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
import { lovable } from '@/integrations/lovable/index';

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

  const handleGoogleSignIn = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(error.message);
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
          <h1 className="text-3xl font-bold tracking-[0.15em] text-gradient-green" style={{ filter: 'drop-shadow(0 0 12px hsl(174 32% 43% / 0.4)) drop-shadow(0 0 24px hsl(174 32% 43% / 0.15))' }}>
            ASCND
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

        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl h-11 font-semibold gap-2"
            onClick={handleGoogleSignIn}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
        </motion.div>

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
