import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LockKeyhole, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { LanguageSwitcher } from '../../components/layout/LanguageSwitcher';

export function LoginPage() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const loading = useAuthStore((state) => state.loading);
  const { t, dir } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/admin/dashboard" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      const tooManyAttempts = error.status === 429;
      toast.error(error.message.includes('Invalid login credentials') ? t('invalidCredentials') : tooManyAttempts ? t('loginLockout') : t('loginError'));
      return;
    }
    toast.success(t('loginSuccess'));
    navigate('/admin/dashboard', { replace: true });
  }

  return <main dir={dir} className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
    <div className="fixed end-4 top-4"><LanguageSwitcher /></div>
    <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/60">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-rose-100 text-rose-700"><LockKeyhole /></div>
        <h1 className="text-2xl font-bold text-stone-900">{t('loginTitle')}</h1>
        <p className="mt-2 text-sm text-stone-500">{t('loginWelcome')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-start text-sm font-semibold text-stone-700">{t('email')}
          <span className="relative mt-2 block"><Mail className={`absolute top-3.5 size-4 text-stone-400 ${dir === 'rtl' ? 'end-3' : 'start-3'}`} /><input required autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('emailPlaceholder')} className={`w-full rounded-xl border border-stone-300 py-3 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${dir === 'rtl' ? 'pe-10 ps-3 text-start' : 'ps-10 pe-3 text-start'}`} dir="ltr" /></span>
        </label>
        <label className="block text-start text-sm font-semibold text-stone-700">{t('password')}
          <input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('passwordPlaceholder')} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-start outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100" />
        </label>
        <button disabled={submitting} className="w-full rounded-xl bg-stone-900 px-4 py-3 font-bold text-white transition hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60">{submitting ? t('loggingIn') : t('login')}</button>
      </form>
    </section>
  </main>;
}
