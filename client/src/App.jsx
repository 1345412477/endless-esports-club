import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ToastContainer } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import LoginPage from './pages/LoginPage';
import WorkerPage from './pages/WorkerPage';
import CSPage from './pages/CSPage';
import AdminPage from './pages/AdminPage';
import ManagerPage from './pages/ManagerPage';

function ProtectedRoute({ children, role }) {
  const { isLoggedIn, role: userRole } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (role && userRole !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <ConfirmDialog />
      <Routes>
        <Route path="/" element={<WorkerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cs" element={<ProtectedRoute role="cs"><CSPage /></ProtectedRoute>} />
        <Route path="/manager" element={<ProtectedRoute role="manager"><ManagerPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
