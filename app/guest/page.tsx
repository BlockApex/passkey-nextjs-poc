'use client';

// "Try App" (guest mode) test harness. Exercises the two v0 backend endpoints
// added for Play Store review — /auth/guest-check and /auth/guest-login — with
// no passkey. A successful guest-login stores the session exactly like the
// passkey login and lands in the dashboard.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signedFetch, API_BASE } from '../../lib/api/signedFetch';

export default function GuestPage() {
  const router = useRouter();
  const [username, setUsername] = useState('androidTest');
  const [loading, setLoading] = useState<'check' | 'login' | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [loginResult, setLoginResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setError(null);
    setCheckResult(null);
    setLoginResult(null);
    setLoading('check');
    try {
      const res = await signedFetch(
        `/auth/guest-check?username=${encodeURIComponent(username)}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      setCheckResult(JSON.stringify(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setLoading(null);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setLoginResult(null);
    setLoading('login');
    try {
      const res = await signedFetch('/auth/guest-login', {
        method: 'POST',
        json: { username },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);

      // Persist the session the same way the passkey login does.
      localStorage.setItem('accessToken', body.accessToken);
      if (body.refreshToken) {
        localStorage.setItem('refreshToken', body.refreshToken);
      }
      localStorage.setItem('username', body.user.username);
      if (body.wallets) {
        localStorage.setItem('wallets', JSON.stringify(body.wallets));
      }

      setLoginResult(body);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-bold text-orange-600 mb-2">
          🧪 Try App (Guest)
        </h1>
        <p className="text-slate-600 mb-6 text-sm">
          Play Store reviewer access — signs in a reserved guest username with no
          passkey. Only <span className="font-mono font-semibold">androidTest</span>{' '}
          is permitted; anything else returns 403.
        </p>

        <label className="block text-sm font-medium text-slate-700 mb-1">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="androidTest"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />

        <div className="flex gap-3">
          <button
            onClick={handleCheck}
            disabled={loading !== null || !username.trim()}
            className="flex-1 py-3 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50 transition-colors"
          >
            {loading === 'check' ? 'Checking…' : 'Check reserved'}
          </button>
          <button
            onClick={handleGuestLogin}
            disabled={loading !== null || !username.trim()}
            className="flex-1 py-3 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
          >
            {loading === 'login' ? 'Signing in…' : 'Try App →'}
          </button>
        </div>

        {checkResult && (
          <div className="mt-4 p-3 bg-slate-100 rounded-lg text-sm font-mono text-slate-700 break-all">
            guest-check → {checkResult}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 break-all">
            {error}
          </div>
        )}

        {loginResult && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            <p className="font-semibold mb-1">
              ✅ Signed in as {String((loginResult.user as Record<string, unknown>)?.username)}
            </p>
            <p className="text-xs text-green-700">
              Session stored — redirecting to dashboard…
            </p>
          </div>
        )}

        <div className="mt-8 p-3 bg-slate-50 rounded-lg">
          <p className="text-xs text-slate-500 font-mono break-all">
            API: {API_BASE}
          </p>
        </div>
      </div>
    </div>
  );
}
