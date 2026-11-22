import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, ClipboardList, Clock3, ExternalLink, LogOut, Menu, ShoppingBasket } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n/translations';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { BrandLogo } from './BrandLogo';
import { useStaffStore } from '../../store/staffStore';

const links: { to: string; key: TranslationKey; icon: typeof BarChart3 }[] = [
  { to: '/admin/dashboard', key: 'dashboard', icon: BarChart3 },
  { to: '/admin/pos', key: 'pos', icon: ShoppingBasket },
  { to: '/admin/inventory', key: 'inventory', icon: Boxes },
  { to: '/admin/orders', key: 'orders', icon: ClipboardList },
  { to: '/admin/shifts', key: 'shifts', icon: Clock3 },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = useStaffStore((state) => state.role);
  const signOut = useAuthStore((state) => state.signOut);
  const { t, dir, lang } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
      toast.success(t('logoutSuccess'));
      navigate('/login', { replace: true });
    } catch {
      toast.error(t('logoutError'));
    }
  }

  function toggleSidebar() {
    if (window.matchMedia('(min-width: 1024px)').matches) setCollapsed((value) => !value);
    else setSidebarOpen((value) => !value);
  }

  const sidebarWidth = collapsed ? 'lg:w-20' : 'lg:w-72';
  return <div dir={dir} className="flex min-h-screen w-full bg-stone-50">
    {sidebarOpen && <button className="fixed inset-0 z-40 bg-stone-950/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={t('closeMenu')} />}
    <aside className={`fixed inset-y-0 start-0 z-50 flex h-screen w-72 shrink-0 flex-col border-e border-stone-200 bg-white transition-all duration-200 ${sidebarOpen ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full'} lg:sticky lg:top-0 lg:!translate-x-0 ${sidebarWidth}`}>
      <div className={`flex h-20 shrink-0 items-center border-b border-stone-200 px-4 ${collapsed ? 'lg:justify-center' : 'justify-start'}`}>
        {(!collapsed || sidebarOpen) && <a href="/admin/dashboard" aria-label={t('brand')}><BrandLogo size="sm" /></a>}
        {collapsed && !sidebarOpen && <a href="/admin/dashboard" aria-label={t('brand')}><BrandLogo size="sm" showWordmark={false} /></a>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {links.filter((link) => role === 'owner' || ['/admin/pos', '/admin/inventory'].includes(link.to)).map(({ to, key, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setSidebarOpen(false)} title={collapsed ? t(key) : undefined} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-semibold transition ${collapsed ? 'lg:justify-center' : ''} ${isActive ? 'bg-rose-50 text-rose-700' : 'text-stone-600 hover:bg-stone-100'}`}><Icon className="size-5 shrink-0" />{(!collapsed || sidebarOpen) && <span className="truncate">{t(key)}</span>}</NavLink>)}
        <a href="/" title={collapsed ? t('storefront') : undefined} className={`mt-4 flex items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-semibold text-stone-600 transition hover:bg-stone-100 ${collapsed ? 'lg:justify-center' : ''}`}><ExternalLink className="size-5 shrink-0" />{(!collapsed || sidebarOpen) && <span>{t('storefront')}</span>}</a>
      </nav>
      <div className="shrink-0 space-y-2 border-t border-stone-200 p-3">
        <div className={`flex items-center ${collapsed ? 'lg:justify-center' : 'justify-between'} gap-2`}><div className={`flex ${collapsed && !sidebarOpen ? 'flex-col items-center gap-2' : 'flex-row items-center gap-2'}`}><LanguageSwitcher compact={collapsed && !sidebarOpen} /><ThemeToggle compact={collapsed && !sidebarOpen} /></div>{(!collapsed || sidebarOpen) && <span className="text-xs text-stone-400">{lang.toUpperCase()}</span>}</div>
        {(!collapsed || sidebarOpen) && <p className="truncate px-2 pt-1 text-start text-xs text-stone-500" dir="ltr">{user?.email}</p>}
        <button onClick={() => void handleSignOut()} title={collapsed ? t('logout') : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-semibold text-red-600 transition hover:bg-red-50 ${collapsed ? 'lg:justify-center' : ''}`}><LogOut className="size-5 shrink-0" />{(!collapsed || sidebarOpen) && <span>{t('logout')}</span>}</button>
      </div>
    </aside>
    <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-[60] flex h-16 shrink-0 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur sm:px-8">
        <button onClick={toggleSidebar} className="rounded-lg p-2 text-stone-700 hover:bg-stone-100" aria-label={t('sidebarToggle')} title={t('sidebarToggle')}><Menu className="size-5" /></button>
        <span className="text-sm font-semibold text-stone-700 lg:hidden">{t('brand')}</span>
        <div className="ms-auto flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /><span className="text-sm text-stone-600">{t('online')}</span></div>
      </header>
      <main className="w-full min-w-0 flex-1 p-4 sm:p-8"><Outlet /></main>
    </div>
  </div>;
}
