import { useState, useEffect } from 'react';
import logoAscnd from '@/assets/logo-ascnd.png';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { LANGUAGES } from '@/lib/i18n';
import { Globe, ArrowLeft } from 'lucide-react';
import { lovableSafe } from '@/lib/lovable-auth-safe';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

type AuthMode = 'login' | 'signup' | 'forgot' | 'recovery';

const Auth = () => {
  const { user, loading, signIn, signUp, resetPassword, updatePassword } = useAuth();
  const { lang, setLang } = useAppSettings();
  const i18n = t(lang);
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check if user arrived via recovery link
  useEffect(() => {
    if (searchParams.get('type') === 'recovery') {
      setMode('recovery');
    }
  }, [searchParams]);

  if (loading) return (
    <div className="bg-background flex items-center justify-center" style={{ height: '100dvh' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">
        {i18n.loading}
      </motion.div>
    </div>
  );
  if (user && mode !== 'recovery') return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message);
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password, name);
        if (error) toast.error(error.message);
        else toast.success(i18n.authCheckEmail);
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(email);
        if (error) toast.error(error.message);
        else toast.success(i18n.authResetSent);
      } else if (mode === 'recovery') {
        const { error } = await updatePassword(password);
        if (error) toast.error(error.message);
        else {
          toast.success(i18n.authPasswordUpdated);
          setMode('login');
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'An error occurred');
    }
    setSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await lovableSafe.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) toast.error(error.message);
    } catch (e: any) {
      toast.error(e?.message || 'Google sign-in failed');
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const { error } = await lovableSafe.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });
      if (error) toast.error(error.message);
    } catch (e: any) {
      toast.error(e?.message || 'Apple sign-in failed');
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'login': return i18n.authLoginSubtitle;
      case 'signup': return i18n.authSignupSubtitle;
      case 'forgot': return lang === 'vi' ? 'Nhập email để nhận link đặt lại mật khẩu' : 'Enter your email to receive a reset link';
      case 'recovery': return lang === 'vi' ? 'Nhập mật khẩu mới của bạn' : 'Enter your new password';
    }
  };

  return (
    <div className="bg-background flex items-center justify-center px-4 relative overflow-hidden" style={{ height: '100dvh' }}>
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
            {getSubtitle()}
          </p>
        </motion.div>

        {/* Back button for forgot/recovery */}
        <AnimatePresence>
          {(mode === 'forgot' || mode === 'recovery') && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={spring}
              onClick={() => setMode('login')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {i18n.authBackToLogin}
            </motion.button>
          )}
        </AnimatePresence>

        <motion.form
          onSubmit={handleSubmit}
          className="space-y-5 metric-card relative"
          layout
          transition={{ layout: { ...spring, duration: 0.4 } }}
        >
          <AnimatePresence mode="popLayout">
            {mode === 'signup' && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ ...spring, duration: 0.3 }}
                className="space-y-2 overflow-hidden"
              >
                <Label htmlFor="name">{i18n.authName}</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={i18n.authYourName} required className="rounded-xl bg-background/50" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email field — shown for login, signup, forgot */}
          {mode !== 'recovery' && (
            <div className="space-y-2">
              <Label htmlFor="email">{i18n.authEmail}</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required className="rounded-xl bg-background/50" />
            </div>
          )}

          {/* Password field — shown for login, signup, recovery */}
          {mode !== 'forgot' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{mode === 'recovery' ? i18n.authNewPassword : i18n.authPassword}</Label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs text-primary hover:underline transition-colors"
                  >
                    {i18n.authForgotPassword}
                  </button>
                )}
              </div>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="rounded-xl bg-background/50" />
            </div>
          )}

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}>
            <Button type="submit" className="w-full rounded-xl h-11 font-semibold" disabled={submitting}>
              {submitting
                ? i18n.authProcessing
                : mode === 'login'
                  ? i18n.authLogin
                  : mode === 'signup'
                    ? i18n.authSignup
                    : mode === 'forgot'
                      ? i18n.authResetPassword
                      : i18n.authUpdatePassword
              }
            </Button>
          </motion.div>
        </motion.form>

        {/* OAuth buttons — only show on login/signup */}
        {(mode === 'login' || mode === 'signup') && (
          <>
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

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={spring}>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl h-11 font-semibold gap-2"
                onClick={handleAppleSignIn}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Continue with Apple
              </Button>
            </motion.div>
          </>
        )}

        {/* Toggle login/signup */}
        {(mode === 'login' || mode === 'signup') && (
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? i18n.authNoAccount : i18n.authHasAccount}{' '}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary hover:underline font-semibold transition-colors">
              {mode === 'login' ? i18n.authSignup : i18n.authLogin}
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default Auth;