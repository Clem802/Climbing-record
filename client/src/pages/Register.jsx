import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRegister } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Register() {
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const data = await apiRegister(form);
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand tracking-tight">SPIDER</h1>
          <p className="text-gray-500 mt-1 text-sm uppercase tracking-widest">Climbing Tracker</p>
        </div>
        <div className="bg-white rounded-2xl shadow-natural p-8">
          <h2 className="text-xl font-bold mb-6">Create Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">{error}</p>}
            {[['Name', 'name', 'text'], ['Email', 'email', 'email'], ['Password', 'password', 'password']].map(([label, field, type]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type} value={form[field]} onChange={set(field)} required
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
              </div>
            ))}
            <button type="submit" disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-full transition disabled:opacity-50 mt-2">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </div>
        <p className="text-center text-gray-500 mt-4 text-sm">
          Have an account? <Link to="/login" className="text-brand font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
