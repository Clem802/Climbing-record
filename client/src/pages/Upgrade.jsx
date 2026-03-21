import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Upgrade() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-natural p-10">
        <div className="text-5xl mb-6">🧗</div>
        <h1 className="text-2xl font-bold mb-3">Account Inactive</h1>
        <p className="text-gray-500 mb-8">
          Your account is inactive. Contact your administrator to reactivate your subscription and get back on the wall.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-full mb-3 transition">
          Back to Dashboard
        </button>
        <button onClick={logout} className="w-full text-gray-400 hover:text-gray-600 text-sm transition py-2">
          Sign out
        </button>
      </div>
    </div>
  );
}
