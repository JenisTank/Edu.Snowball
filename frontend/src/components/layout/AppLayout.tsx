import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Megaphone, GraduationCap, CalendarCheck,
  IndianRupee, Briefcase, Boxes, MessageCircle, FileBadge, Building2,
  LogOut, ChevronDown, Menu, X, Bell, Settings, Search,
} from 'lucide-react';
import { Logo } from '../brand/Logo';
import { useAuth, ROLE_LABELS, HO_ROLES } from '../../lib/auth';
import { cn } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface NavItem { to: string; label: string; icon: any; soon?: string }

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Admissions',
    items: [
      { to: '/leads', label: 'First Buzz CRM', icon: Megaphone },
      { to: '/admissions', label: 'Admissions', icon: GraduationCap },
    ],
  },
  {
    group: 'Daily Operations',
    items: [
      { to: '/students', label: 'Students', icon: Users },
      { to: '/lifecycle', label: 'Student Lifecycle', icon: Users },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/fees', label: 'Fees', icon: IndianRupee },
      { to: '/comms', label: 'Communication', icon: MessageCircle },
      { to: '/certificates', label: 'Certificates', icon: FileBadge },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/units', label: 'Units & Batches', icon: Building2 },
      { to: '/hr', label: 'HR & Payroll', icon: Briefcase, soon: 'Phase 2' },
      { to: '/academic', label: 'Academic Planning', icon: GraduationCap },
      { to: '/inventory', label: 'Inventory', icon: Boxes, soon: 'Phase 2' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: () => api('/units'),
    enabled: !!user && HO_ROLES.includes(user.role),
  });

  if (!user) return null;
  const isHO = HO_ROLES.includes(user.role);

  const sidebar = (
    <aside className="flex h-full w-[248px] flex-col bg-cream border-r border-[#EFE6CC]">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo />
        <button className="md:hidden btn-neo-icon p-1.5" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-4">
        {NAV.map(section => (
          <div key={section.group} className="mb-4">
            <div className="px-2 pb-1.5 pt-2 text-[10px] font-heading font-extrabold uppercase tracking-[0.14em] text-stone-500">
              {section.group}
            </div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.soon ? '#' : item.to}
                onClick={e => { if (item.soon) e.preventDefault(); else setMobileOpen(false); }}
                className={({ isActive }) => cn(
                  'group mb-1.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition select-none',
                  item.soon
                    ? 'cursor-default text-stone-400'
                    : isActive
                      ? 'nav-active'
                      : 'text-stone-600 hover:bg-[#F7EFD8] hover:text-ink active:shadow-neo-inset-sm',
                )}
              >
                <item.icon className="h-[17px] w-[17px] shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.soon && (
                  <span className="rounded-full bg-[#F2EAD3] px-2 py-0.5 text-[9px] font-bold text-stone-500">
                    {item.soon}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 pt-0">
        <div className="card p-3.5 text-xs">
          <div className="font-heading font-extrabold text-honey-700">🐝 Slice 7 — Live</div>
          <p className="mt-1 leading-relaxed text-stone-600">
            CRM · Admissions · Attendance · Fees · Parent PWA · Certificates · Comms.
          </p>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-lift">{sidebar}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Topbar ── */}
        <header className="flex items-center gap-3 px-4 py-3.5 lg:px-6">
          <button className="md:hidden btn-neo-icon" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>

          {/* Unit context chip */}
          <div className="chip hidden sm:inline-flex">
            <Building2 className="h-3.5 w-3.5 text-honey-500" />
            {isHO
              ? <>Head Office · <span className="text-honey-600">All {units?.length ?? 3} units</span></>
              : <span>{user.unitName}</span>}
          </div>

          {/* Global search */}
          <div className="relative mx-auto hidden w-full max-w-md md:block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 z-10" />
            <input className="input rounded-full pl-10 py-2 text-[12.5px]" placeholder="Search anything… (global search ships in Slice 2)" />
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Live badge */}
            <span className="chip hidden sm:inline-flex">
              <span className="chip-dot bg-emerald-500 animate-pulse" /> Live
            </span>

            <button className="btn-neo-icon relative">
              <Bell className="h-[17px] w-[17px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-honey-500" />
            </button>

            <div className="relative">
              <button
                onClick={() => setUserMenu(v => !v)}
                className="flex items-center gap-2.5 rounded-2xl border border-[#E4D29D] bg-gradient-to-br from-[#F9EFD3] to-[#EDDEB2] px-2.5 py-1.5 shadow-neo-sm active:shadow-neo-inset-sm transition"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-honey-400 to-honey-600 font-heading text-sm font-extrabold text-white shadow-neo-xs">
                  {user.fullName.charAt(0)}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-[12.5px] font-bold leading-tight">{user.fullName}</div>
                  <div className="text-[10.5px] text-stone-500 leading-tight">
                    {ROLE_LABELS[user.role] || user.role} · Rajkot
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-stone-500" />
              </button>
              {userMenu && (
                <div className="pop absolute right-0 top-full z-30 mt-2 w-56">
                  <div className="px-3 py-2 text-xs text-stone-500 border-b border-[#E3D5AC]/60 mb-1">
                    {user.email}
                  </div>
                  <button
                    onClick={() => { logout(); navigate('/login'); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-white/50 transition"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-1 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, count, action }: {
  title: string; subtitle?: string; count?: string; action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-[1.55rem] font-extrabold tracking-tight">{title}</h1>
          {count && <span className="chip">{count}</span>}
        </div>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
