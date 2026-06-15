import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './components/pages/LoginPage';
import DashboardOverview from './components/pages/DashboardOverview';
import CallHistoryPage from './components/pages/CallHistoryPage';
import KnowledgeBasePage from './components/pages/KnowledgeBasePage';
import RoutingRulesPage from './components/pages/RoutingRulesPage';
import LeadsPage from './components/pages/LeadsPage';
import SMSPage from './components/pages/SMSPage';
import ConfigPage from './components/pages/ConfigPage';
import AnalyticsPage from './components/pages/AnalyticsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardOverview />} />
            <Route path="/dashboard/calls" element={<CallHistoryPage />} />
            <Route path="/dashboard/knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="/dashboard/routing" element={<RoutingRulesPage />} />
            <Route path="/dashboard/leads" element={<LeadsPage />} />
            <Route path="/dashboard/sms" element={<SMSPage />} />
            <Route path="/dashboard/config" element={<ConfigPage />} />
            <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
