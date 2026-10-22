import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { I18nProvider, useI18n } from './lib/i18n';
import { AppLayout } from './components/layout/AppLayout';

// Route-level code splitting: each screen is fetched on first visit instead of
// shipping one ~520 kB bundle to every parent's phone.
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Leads = lazy(() => import('./pages/Leads'));
const Units = lazy(() => import('./pages/Units'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Admissions = lazy(() => import('./pages/Admissions'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Fees = lazy(() => import('./pages/Fees'));
const Certificates = lazy(() => import('./pages/Certificates'));
const Comms = lazy(() => import('./pages/Comms'));
const ParentPortal = lazy(() => import('./pages/Parent'));
const Lifecycle = lazy(() => import('./pages/Lifecycle'));
const Academic = lazy(() => import('./pages/Academic'));
const Inventory = lazy(() => import('./pages/Inventory'));
const PTM = lazy(() => import('./pages/PTM'));
const Me = lazy(() => import('./pages/Me'));
const Evening = lazy(() => import('./pages/Evening'));
const HR = lazy(() => import('./pages/HR'));
const Analytics = lazy(() => import('./pages/Analytics'));

/** Shown while a route chunk is loading. */
function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex items-center gap-3 text-sm font-semibold text-[color:var(--txt3)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--accent)] border-t-transparent" />
        {t('common.loading')}
      </div>
    </div>
  );
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

/**
 * Route tree. It remounts on a language switch (`key={lang}`): column labels are
 * memoised inside each page, and a remount is the only honest way to force every
 * `useMemo` to rebuild with the new language.
 */
function Shell() {
  const { lang } = useI18n();
  return (
    <Suspense key={lang} fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/students"
          element={
            <Protected>
              <Students />
            </Protected>
          }
        />
        <Route
          path="/lifecycle"
          element={
            <Protected>
              <Lifecycle />
            </Protected>
          }
        />
        <Route
          path="/academic"
          element={
            <Protected>
              <Academic />
            </Protected>
          }
        />
        <Route
          path="/inventory"
          element={
            <Protected>
              <Inventory />
            </Protected>
          }
        />
        <Route
          path="/me"
          element={
            <Protected>
              <Me />
            </Protected>
          }
        />
        <Route
          path="/ptm"
          element={
            <Protected>
              <PTM />
            </Protected>
          }
        />
        <Route
          path="/evening"
          element={
            <Protected>
              <Evening />
            </Protected>
          }
        />
        <Route
          path="/hr"
          element={
            <Protected>
              <HR />
            </Protected>
          }
        />
        <Route
          path="/analytics"
          element={
            <Protected>
              <Analytics />
            </Protected>
          }
        />
        <Route
          path="/leads"
          element={
            <Protected>
              <Leads />
            </Protected>
          }
        />
        <Route
          path="/admissions"
          element={
            <Protected>
              <Admissions />
            </Protected>
          }
        />
        <Route
          path="/attendance"
          element={
            <Protected>
              <Attendance />
            </Protected>
          }
        />
        <Route
          path="/fees"
          element={
            <Protected>
              <Fees />
            </Protected>
          }
        />
        <Route
          path="/certificates"
          element={
            <Protected>
              <Certificates />
            </Protected>
          }
        />
        <Route
          path="/comms"
          element={
            <Protected>
              <Comms />
            </Protected>
          }
        />
        {/* Parent PWA — handles its own phone + admission-no auth */}
        <Route path="/parent" element={<ParentPortal />} />
        <Route
          path="/units"
          element={
            <Protected>
              <Units />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
