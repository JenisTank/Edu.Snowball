import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Leads from './pages/Leads';
import Units from './pages/Units';
import SettingsPage from './pages/Settings';
import Admissions from './pages/Admissions';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Certificates from './pages/Certificates';
import Comms from './pages/Comms';
import ParentPortal from './pages/Parent';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/students" element={<Protected><Students /></Protected>} />
            <Route path="/leads" element={<Protected><Leads /></Protected>} />
            <Route path="/admissions" element={<Protected><Admissions /></Protected>} />
            <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
            <Route path="/fees" element={<Protected><Fees /></Protected>} />
            <Route path="/certificates" element={<Protected><Certificates /></Protected>} />
            <Route path="/comms" element={<Protected><Comms /></Protected>} />
            {/* Parent PWA — handles its own phone + admission-no auth */}
            <Route path="/parent" element={<ParentPortal />} />
            <Route path="/units" element={<Protected><Units /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
