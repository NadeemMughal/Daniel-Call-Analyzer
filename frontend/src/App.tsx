import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CallsPage from './pages/CallsPage'
import CallDetailPage from './pages/CallDetailPage'
import TrendsPage from './pages/TrendsPage'
import RubricPage from './pages/RubricPage'
import FailuresPage from './pages/FailuresPage'
import CoachingPage from './pages/CoachingPage'
import MemberReportPage from './pages/MemberReportPage'
import ClientsPage from './pages/ClientsPage'
import ClientDetailPage from './pages/ClientDetailPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="calls/:id" element={<CallDetailPage />} />
            <Route path="trends" element={<TrendsPage />} />
            <Route path="coaching" element={<CoachingPage />} />
            <Route path="rubric" element={<RubricPage />} />
            <Route path="failures" element={<FailuresPage />} />
            <Route path="members/:id" element={<MemberReportPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
