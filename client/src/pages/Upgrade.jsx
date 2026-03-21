import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Upgrade() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-6">🧗</div>
        <h1 className="text-2xl font-bold mb-3">Account Inactive</h1>
        <p className="text-gray-400 mb-6">
          Your account is inactive. Contact your administrator to reactivate your subscription.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded mb-3 transition">
          Back to Dashboard
        </button>
        <button onClick={logout} className="w-full text-gray-400 hover:text-white text-sm transition">
          Sign out
        </button>
      </div>
    </div>
  );
}
