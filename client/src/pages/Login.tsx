import { useState } from "react";
import type { User } from "../App";

interface Props {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Something went wrong");
        return;
      }

      onLogin(data.user);
    } catch {
      setError("Backend not connected yet — coming soon");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] mb-4">
            <svg className="w-7 h-7 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">LeadGen Pro</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">Google Maps Lead Scraper</p>
        </div>

        {/* Card */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">
            {isRegister ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mb-6">
            {isRegister ? "Start scraping leads instantly" : "Sign in to your dashboard"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                Email
              </label>
              <input
                data-testid="input-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)] focus:border-[hsl(var(--primary))] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                Password
              </label>
              <input
                data-testid="input-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)] focus:border-[hsl(var(--primary))] transition"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              data-testid="button-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] font-semibold rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              data-testid="button-toggle-auth"
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              className="text-[hsl(var(--primary))] hover:underline font-medium"
            >
              {isRegister ? "Sign in" : "Sign up"}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))] mt-6">
          Leads saved to your account in real-time via Neon PostgreSQL
        </p>
      </div>
    </div>
  );
}
