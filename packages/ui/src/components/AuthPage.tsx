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
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en';

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
            {/* Earth horizon: a dark planetary silhouette masks the glow beneath the rim. */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 720" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="ocean-rim-light" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f47e51" stopOpacity="0.48" />
                  <stop offset="25%" stopColor="#ffb17d" stopOpacity="0.98" />
                  <stop offset="43%" stopColor="#ffcfaa" stopOpacity="0.85" />
                  <stop offset="68%" stopColor="#d46b49" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#7a3c36" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="ocean-sunrise" cx="37%" cy="80%" r="58%" fx="37%" fy="80%">
                  <stop offset="0%" stopColor="#ffb17b" stopOpacity="0.64" />
                  <stop offset="25%" stopColor="#f68b60" stopOpacity="0.25" />
                  <stop offset="62%" stopColor="#a94d39" stopOpacity="0.045" />
                  <stop offset="100%" stopColor="#a94d39" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="ocean-planet-shade" cx="42%" cy="0%" r="100%">
                  <stop offset="0%" stopColor="#292123" />
                  <stop offset="55%" stopColor="#171619" />
                  <stop offset="100%" stopColor="#101116" />
                </radialGradient>
                <filter id="ocean-rim-soft-glow" x="-40%" y="-150%" width="180%" height="400%" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation="8" />
                </filter>
                <filter id="ocean-rim-wide-glow" x="-40%" y="-250%" width="180%" height="600%" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation="24" />
                </filter>
                <mask id="ocean-sky-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="720">
                  <rect width="600" height="720" fill="white" />
                  <ellipse cx="240" cy="910" rx="450" ry="340" fill="black" />
                </mask>
              </defs>
              {/* The same ellipse drives the silhouette and every atmospheric layer. */}
              <g mask="url(#ocean-sky-mask)">
                <rect width="600" height="720" fill="url(#ocean-sunrise)" />
                <ellipse cx="240" cy="910" rx="450" ry="340" fill="none" stroke="url(#ocean-rim-light)" strokeWidth="42" opacity="0.48" filter="url(#ocean-rim-wide-glow)" />
                <ellipse cx="240" cy="910" rx="450" ry="340" fill="none" stroke="url(#ocean-rim-light)" strokeWidth="14" filter="url(#ocean-rim-soft-glow)" />
              </g>
              <ellipse cx="240" cy="910" rx="450" ry="340" fill="url(#ocean-planet-shade)" />
              <ellipse cx="240" cy="910" rx="450" ry="340" fill="none" stroke="url(#ocean-rim-light)" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9561b] text-lg font-bold tracking-[-0.08em]" aria-hidden="true">O.</span>
              <span className="text-2xl font-semibold tracking-[-0.05em]">Ocean<span className="text-[#e9561b]">.</span></span>
            </div>

            <div className="mb-auto mt-auto max-w-md pb-24">
              <h1 className="text-5xl font-semibold leading-[1.13] tracking-[-0.06em]">
                Exploring what's next<br />
                <span className="text-[#e9784b]">in human-AI interaction.</span>
              </h1>

            </div>
          </div>
        </div>

        {/* ── Right Side: Auth Form ── */}
        <div className="relative flex flex-1 flex-col items-center px-4 py-6 sm:p-8 md:p-10 lg:items-center lg:flex-[0.8] lg:px-10 lg:py-12">
          <div className="mx-auto flex w-full max-w-[320px] flex-1 flex-col sm:max-w-[348px] lg:max-w-[380px] lg:justify-center">
          
          <div className="mb-7 w-full text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#1b1b1a] sm:text-[30px]">
              {mode === 'login' ? t('auth.login_title') : t('auth.register_title')}
            </h2>
            <p className="mt-2 text-sm font-normal leading-6 text-[#77716d]">
              {mode === 'login' 
                ? t('auth.login_desc') 
                : t('auth.register_desc')}
            </p>
          </div>

          <div className="w-full rounded-[26px] border border-[#e9e7e5] bg-white p-5 shadow-[0_12px_38px_rgba(28,24,22,0.035)] sm:p-6">
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-1.5"
                >
                  <label className="text-xs font-medium text-[#68635f]">{t('auth.name_label')}</label>
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
                      className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#d9d7d5] bg-[#f7f7f7] text-sm font-normal text-[#1b1b1a] outline-none transition-colors placeholder:text-[#99938e] focus:border-[#e9784b] focus:bg-white"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#68635f]">{t('auth.email_label')}</label>
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
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#d9d7d5] bg-[#f7f7f7] text-sm font-normal text-[#1b1b1a] outline-none transition-colors placeholder:text-[#99938e] focus:border-[#e9784b] focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-medium text-[#68635f]">{t('auth.password_label')}</label>
                {mode === 'login' && <button type="button" className="text-xs font-medium text-[#a74d2e] hover:underline">{t('auth.forgot_password')}</button>}
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
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-[#d9d7d5] bg-[#f7f7f7] text-sm font-normal text-[#1b1b1a] outline-none transition-colors placeholder:text-[#99938e] focus:border-[#e9784b] focus:bg-white"
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
              className="group h-12 w-full rounded-xl bg-[#1b1b1a] py-3 text-sm font-medium text-white transition-colors hover:bg-[#35302d] disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="mt-4 w-full">
            <div className="relative flex items-center py-3">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-xs font-normal text-[#89837f]">{t('auth.continue_with')}</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <div className="flex w-full flex-col gap-3">
               <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e3e1] bg-[#f5f5f5] px-4 text-sm font-medium text-[#26211e] transition-colors hover:bg-[#ebebeb]">
                 <Globe className="h-4 w-4 shrink-0 text-primary" />
                 <span className="whitespace-nowrap">{t('auth.sso_portal')}</span>
               </button>
               <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e3e1] bg-[#f5f5f5] px-4 text-sm font-medium text-[#26211e] transition-colors hover:bg-[#ebebeb]">
                 <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
                 <span className="whitespace-nowrap">{t('auth.bio_logic')}</span>
               </button>
            </div>
          </div>

          </div>
          <div className="w-full pt-6 text-center">
            <p className="text-xs font-normal text-[#77716d]">
              {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
              <button 
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-[#b65330] font-medium hover:underline"
              >
                {mode === 'login' ? t('auth.sign_up') : t('auth.sign_in')}
              </button>
            </p>
          </div>
          </div>
          <div className="mt-6 flex w-full justify-end lg:absolute lg:bottom-6 lg:right-7 lg:mt-0 lg:w-auto">
            <div className="inline-flex items-center gap-2 text-xs text-[#77716d]">
              <Globe className="h-4 w-4" aria-hidden="true" />
              <label htmlFor="auth-language" className="sr-only">{t('auth.language_label')}</label>
              <select
                id="auth-language"
                aria-label={t('auth.language_label')}
                value={currentLanguage}
                onChange={(event) => { void i18n.changeLanguage(event.target.value); }}
                className="cursor-pointer rounded-md border border-transparent bg-transparent px-1 py-1 text-xs text-[#55504c] outline-none focus-visible:border-[#e9784b]"
              >
                <option value="en">English</option>
                <option value="zh">简体中文</option>
              </select>
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
