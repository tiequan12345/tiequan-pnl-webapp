'use client';

import React, { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Lock } from 'lucide-react';

const LoginForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || 'Login failed. Please try again.');
        setSubmitting(false);
        return;
      }

      const redirectPath = searchParams.get('redirect') || '/';
      router.push(redirectPath);
      router.refresh();
    } catch {
      setError('Unexpected error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-3">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Login</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Enter the application password to access your dashboard.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xl shadow-black/40"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Application Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-sm font-medium text-white py-2.5 rounded-lg transition-colors border border-blue-500/40"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
                Signing in...
              </span>
            ) : (
              <span>Sign In</span>
            )}
          </button>

          <p className="text-[11px] text-zinc-500 text-center">
            For local development, set <code className="text-zinc-300">APP_PASSWORD</code> in your
            environment before starting the app.
          </p>
        </form>
      </div>
    </div>
  );
};

const LoginPage: React.FC = () => {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
};

export default LoginPage;