import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, user, loading } = useAuthStore();
  const { t, dir } = useTranslation();
  if (loading) return <div dir={dir} className="grid min-h-screen place-items-center text-stone-600">{t('authChecking')}</div>;
  if (!session) return <Navigate to="/login" replace />;
  const role = user?.app_metadata?.role;
  if (role !== 'admin' && role !== 'cashier') return <div dir={dir} className="grid min-h-screen place-items-center p-6 text-center text-stone-700">{t('unauthorized')}</div>;
  return <>{children}</>;
}
