import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import CallsPage from './pages/CallsPage'
import CallDetailPage from './pages/CallDetailPage'
import TrendsPage from './pages/TrendsPage'
import RubricPage from './pages/RubricPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/calls" replace />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="rubric" element={<RubricPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
