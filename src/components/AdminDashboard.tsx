import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Activity, Zap, Clock, AlertCircle, CheckCircle2, XCircle, HelpCircle, Key, LogOut } from 'lucide-react';

const WORKER_URL = 'https://sd-ai-proxy.anshsjoshi07.workers.dev';
const TOKEN_KEY = 'sd:admin:token';

interface ProviderStat {
  provider: string;
  total: number;
  successes: number;
  avg_latency: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  last_used: number | null;
}

interface HealthCheck {
  provider: string;
  configured: boolean;
  status: 'up' | 'auth_error' | 'unreachable' | 'not_connected';
  http_status?: number;
}

interface RecentError {
  provider: string;
  error_message: string;
  ts: number;
}

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  groq: { label: 'Groq', color: '#f97316' },
  openrouter: { label: 'OpenRouter', color: '#6366f1' },
  gemini: { label: 'Gemini', color: '#4285f4' },
  opencode: { label: 'OpenCode Zen', color: '#10b981' },
  iteracompute: { label: 'IteraCompute (Qwen)', color: '#a855f7' },
};
const ALL_PROVIDERS = ['groq', 'openrouter', 'gemini', 'opencode', 'iteracompute'];

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const StatusDot: React.FC<{ status: HealthCheck['status'] | undefined }> = ({ status }) => {
  if (status === 'up') return <CheckCircle2 className="w-4 h-4" style={{ color: '#10b981' }} />;
  if (status === 'auth_error' || status === 'unreachable') return <XCircle className="w-4 h-4" style={{ color: '#ef4444' }} />;
  if (status === 'not_connected') return <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-subtle)' }} />;
  return <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-subtle)' }} />;
};

const statusLabel = (status: HealthCheck['status'] | undefined) => {
  if (status === 'up') return 'Up';
  if (status === 'auth_error') return 'Auth error';
  if (status === 'unreachable') return 'Unreachable';
  if (status === 'not_connected') return 'Not connected';
  return 'Unknown';
};

export const AdminDashboard: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [tokenInput, setTokenInput] = useState('');
  const [stats, setStats] = useState<ProviderStat[]>([]);
  const [errors, setErrors] = useState<RecentError[]>([]);
  const [health, setHealth] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const fetchData = useCallback(async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch(`${WORKER_URL}/admin/stats`, { headers: { 'X-Admin-Token': authToken } }),
        fetch(`${WORKER_URL}/admin/health`, { headers: { 'X-Admin-Token': authToken } }),
      ]);

      if (statsRes.status === 401 || healthRes.status === 401) {
        setError('Invalid admin token.');
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setLoading(false);
        return;
      }

      const statsData = await statsRes.json();
      const healthData = await healthRes.json();

      setStats(statsData.providers ?? []);
      setErrors(statsData.recent_errors ?? []);
      setHealth(healthData.checks ?? []);
      setLastRefresh(Date.now());
    } catch (e) {
      setError('Could not reach the gateway. Check your connection or the Worker URL.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchData(token);
  }, [token, fetchData]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => fetchData(token), 30_000);
    return () => clearInterval(interval);
  }, [token, fetchData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    localStorage.setItem(TOKEN_KEY, tokenInput.trim());
    setToken(tokenInput.trim());
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setStats([]);
    setHealth([]);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--surface-muted)' }}>
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}
        >
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" style={{ color: 'var(--text-subtle)' }} />
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-base)' }}>Admin Access</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Enter the admin token you set as <code>ADMIN_TOKEN</code> in the Cloudflare Worker's secrets.
          </p>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder="Admin token"
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}
          />
          <button type="submit" className="btn-primary w-full justify-center">Access Dashboard</button>
        </form>
      </div>
    );
  }

  const totalRequests = stats.reduce((sum, s) => sum + s.total, 0);
  const totalSuccesses = stats.reduce((sum, s) => sum + s.successes, 0);
  const overallSuccessRate = totalRequests > 0 ? Math.round((totalSuccesses / totalRequests) * 100) : null;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8" style={{ background: 'var(--surface-muted)', color: 'var(--text-base)' }}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6" /> AI Gateway Admin
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>
              {lastRefresh ? `Last updated ${timeAgo(lastRefresh)} · auto-refreshes every 30s` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(token)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--header-border)', color: 'var(--text-base)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ color: 'var(--text-subtle)' }}
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Requests (24h)</p>
            <p className="text-2xl font-bold mt-1">{totalRequests}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Success rate</p>
            <p className="text-2xl font-bold mt-1">{overallSuccessRate !== null ? `${overallSuccessRate}%` : '—'}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Providers connected</p>
            <p className="text-2xl font-bold mt-1">{health.filter(h => h.configured).length} / {ALL_PROVIDERS.length}</p>
          </div>
        </div>

        {/* Provider cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ALL_PROVIDERS.map(providerId => {
            const meta = PROVIDER_META[providerId];
            const stat = stats.find(s => s.provider === providerId);
            const h = health.find(h => h.provider === providerId);
            const successRate = stat && stat.total > 0 ? Math.round((stat.successes / stat.total) * 100) : null;

            return (
              <div
                key={providerId}
                className="rounded-2xl p-5"
                style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <h3 className="font-semibold">{meta.label}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <StatusDot status={h?.status} />
                    {statusLabel(h?.status)}
                  </div>
                </div>

                {!h?.configured ? (
                  <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    No API key set for this provider yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-subtle)' }}>
                        <Zap className="w-3 h-3" /> Requests
                      </p>
                      <p className="font-semibold">{stat?.total ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Success rate</p>
                      <p className="font-semibold">{successRate !== null ? `${successRate}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-subtle)' }}>
                        <Clock className="w-3 h-3" /> Avg latency
                      </p>
                      <p className="font-semibold">{stat?.avg_latency ? `${Math.round(stat.avg_latency)}ms` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Last used</p>
                      <p className="font-semibold">{timeAgo(stat?.last_used ?? null)}</p>
                    </div>
                    {(stat?.tokens_in || stat?.tokens_out) ? (
                      <div className="col-span-2">
                        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Tokens (in / out)</p>
                        <p className="font-semibold">{stat?.tokens_in ?? 0} / {stat?.tokens_out ?? 0}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent errors */}
        {errors.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--header-border)' }}>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} /> Recent errors
            </h3>
            <div className="space-y-2">
              {errors.map((e, i) => (
                <div key={i} className="text-xs flex items-start gap-2 py-1.5" style={{ borderTop: i > 0 ? '1px solid var(--header-border)' : 'none' }}>
                  <span className="font-medium shrink-0" style={{ color: PROVIDER_META[e.provider]?.color ?? 'var(--text-base)' }}>
                    {PROVIDER_META[e.provider]?.label ?? e.provider}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{e.error_message}</span>
                  <span className="ml-auto shrink-0" style={{ color: 'var(--text-subtle)' }}>{timeAgo(e.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
          This page is not linked anywhere on the site — bookmark <code>/#admin</code> to return.
        </p>
      </div>
    </div>
  );
};
