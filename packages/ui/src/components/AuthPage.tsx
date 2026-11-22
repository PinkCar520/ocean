import React, { useState } from 'react';
import { 
  Mail, Lock, User, 
  ArrowRight, Globe, CheckCircle2, 
  AlertCircle, Fingerprint
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';

interface AuthPageProps {
  onLoginSuccess: (token: string, user: any) => void;
  authenticate?: (input: {
    mode: 'login' | 'register';
    email: string;
    password: string;
    name?: string;
  }) => Promise<{ user?: any; error?: string }>;
}

export function AuthPage({ onLoginSuccess, authenticate }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login' 
      ? { email, password } 
      : { email, password, name };

    try {
      if (authenticate) {
        const result = await authenticate({ mode, email, password, name });
        if (result.error || !result.user) throw new Error(result.error || 'Authentication failed');
        onLoginSuccess('', result.user);
        return;
      }
      const data = await api.post<any>(endpoint, body);
      onLoginSuccess(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#faf9f8]">
      
      {/* ── Background Aesthetics ── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Animated Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px]" />
        
        {/* Subtle Grid */}
        <div className="absolute inset-0 opacity-[0.03] grayscale invert" 
             style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      <div className="flex min-h-full items-start justify-center px-3 py-4 sm:items-center sm:p-4">
        <div className="relative flex w-full max-w-[1100px] flex-col overflow-hidden rounded-[28px] border border-white/60 bg-card/40 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] backdrop-blur-3xl lg:h-[720px] lg:flex-row lg:rounded-[40px]">
        
        {/* ── Left Side: Ocean Code brand, aligned with the current product ── */}
        <div className="relative hidden flex-1 overflow-hidden bg-[#1b1b1a] p-12 text-white lg:flex lg:flex-col">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -bottom-[380px] -left-[210px] h-[680px] w-[900px] rounded-[50%] border border-[#ed744b]/50 bg-[radial-gradient(ellipse_at_50%_0%,rgba(233,86,27,0.16),transparent_58%)] shadow-[0_-18px_70px_-48px_rgba(233,86,27,0.7)]" />
            <div className="absolute -bottom-[395px] -left-[195px] h-[680px] w-[900px] rounded-[50%] border border-white/5" />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9561b] text-lg font-bold tracking-[-0.08em]" aria-hidden="true">O.</span>
              <span className="text-2xl font-semibold tracking-[-0.05em]">Ocean<span className="text-[#e9561b]">.</span></span>
            </div>

            <div className="mb-auto mt-auto max-w-md pb-24">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#e9784b]">Ocean Code</p>
              <h1 className="text-5xl font-semibold leading-[1.13] tracking-[-0.06em]">
                One Agent Core.<br />
                <span className="text-[#e9784b]">Multiple Hosts.</span>
              </h1>
              <p className="mt-7 max-w-sm text-base leading-8 text-white/60">
                Persistent sessions across CLI and Web. Your agent, context, and work in one place.
              </p>

            </div>
            <p className="relative z-10 text-xs text-white/35">One Agent Core. Multiple Hosts. Persistent Sessions.</p>
          </div>
        </div>

        {/* ── Right Side: Auth Form ── */}
        <div className="relative flex flex-1 flex-col items-center px-4 py-6 sm:p-8 md:p-10 lg:items-stretch lg:flex-[0.8] lg:p-16">
          <div className="mx-auto flex w-full max-w-[320px] flex-1 flex-col sm:max-w-[348px] lg:mx-0 lg:max-w-none">
          
          <div className="mb-8 w-full text-center lg:mb-10 lg:text-left">
            <h2 className="text-2xl font-display font-black text-foreground sm:text-3xl">
              {mode === 'login' ? t('auth.login_title') : t('auth.register_title')}
            </h2>
            <p className="mt-2 text-base font-medium text-muted-foreground sm:text-lg">
              {mode === 'login' 
                ? t('auth.login_desc') 
                : t('auth.register_desc')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-4 sm:space-y-5">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-1.5"
                >
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{t('auth.name_label')}</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <input 
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('auth.name_placeholder')}
                      className="w-full h-14 pl-12 pr-4 rounded-2xl bg-muted border-2 border-transparent focus:bg-card focus:border-primary/20 outline-none transition-all font-bold text-foreground"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{t('auth.email_label')}</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input 
                  type="text"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.email_placeholder')}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-muted border-2 border-transparent focus:bg-card focus:border-primary/20 outline-none transition-all font-bold text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('auth.password_label')}</label>
                {mode === 'login' && <button type="button" className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">{t('auth.forgot_password')}</button>}
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input 
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.password_placeholder')}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-muted border-2 border-transparent focus:bg-card focus:border-primary/20 outline-none transition-all font-bold text-foreground"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="group h-14 w-full rounded-2xl bg-foreground py-3 font-bold text-white shadow-[0_12px_24px_rgba(0,0,0,0.15)] transition-all active:scale-[0.98] hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'login' ? t('auth.sign_in_button') : t('auth.create_account_button')}</span>
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </div>
            </button>
          </form>

          <div className="mt-6 w-full sm:mt-8">
            <div className="relative flex items-center py-4 sm:py-5">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('auth.continue_with')}</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <div className="flex w-full flex-col gap-3">
               <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted">
                 <Globe className="h-4 w-4 shrink-0 text-primary" />
                 <span className="whitespace-nowrap">{t('auth.sso_portal')}</span>
               </button>
               <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted">
                 <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
                 <span className="whitespace-nowrap">{t('auth.bio_logic')}</span>
               </button>
            </div>
          </div>

          <div className="w-full pt-8 text-center lg:mt-auto">
            <p className="text-sm font-medium text-muted-foreground">
              {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
              <button 
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-primary font-bold hover:underline"
              >
                {mode === 'login' ? t('auth.sign_up') : t('auth.sign_in')}
              </button>
            </p>
          </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
