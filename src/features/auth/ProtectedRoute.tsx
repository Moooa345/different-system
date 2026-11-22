import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import { useStaffStore } from '../../store/staffStore';

export function ProtectedRoute({ children, ownerOnly = false }: { children: React.ReactNode; ownerOnly?: boolean }) {
  const { session, user, loading } = useAuthStore();
  const { t, dir } = useTranslation();
  const role = useStaffStore((state) => state.role);
  const roleLoading = useStaffStore((state) => state.loading);
  const roleUserId = useStaffStore((state) => state.userId);
  const loadRole = useStaffStore((state) => state.loadRole);
  useEffect(() => { void loadRole(user?.id ?? null); }, [loadRole, user?.id]);
  if (loading) return <div dir={dir} className="grid min-h-screen place-items-center text-stone-600">{t('authChecking')}</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (roleLoading || (user?.id && roleUserId !== user.id)) return <div dir={dir} className="grid min-h-screen place-items-center text-stone-600">{t('authChecking')}</div>;
  if (role !== 'owner' && role !== 'cashier') return <div dir={dir} className="grid min-h-screen place-items-center p-6 text-center text-stone-700">{t('unauthorized')}</div>;
  if (ownerOnly && role !== 'owner') return <Navigate to="/admin/pos" replace />;
  return <>{children}</>;
}
