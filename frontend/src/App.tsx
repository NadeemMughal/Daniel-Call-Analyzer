import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import CallsPage from './pages/CallsPage'
import CallDetailPage from './pages/CallDetailPage'
import TrendsPage from './pages/TrendsPage'
import RubricPage from './pages/RubricPage'
import FailuresPage from './pages/FailuresPage'
import CoachingPage from './pages/CoachingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="coaching" element={<CoachingPage />} />
          <Route path="rubric" element={<RubricPage />} />
          <Route path="failures" element={<FailuresPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
