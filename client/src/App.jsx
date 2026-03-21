import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Upgrade from './pages/Upgrade.jsx';

// Placeholder pages — will be replaced in later tasks
const Dashboard = () => <div className="p-8 text-gray-400">Dashboard (coming soon)</div>;
const SessionNew = () => <div className="p-8 text-gray-400">New Session (coming soon)</div>;
const SessionDetail = () => <div className="p-8 text-gray-400">Session Detail (coming soon)</div>;
const Progress = () => <div className="p-8 text-gray-400">Progress (coming soon)</div>;
const Admin = () => <div className="p-8 text-gray-400">Admin (coming soon)</div>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/sessions/new" element={<ProtectedRoute requireSubscription><SessionNew /></ProtectedRoute>} />
            <Route path="/sessions/:id" element={<ProtectedRoute><SessionDetail /></ProtectedRoute>} />
            <Route path="/progress" element={<ProtectedRoute requireSubscription><Progress /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
            <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
