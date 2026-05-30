import { useState, useEffect, useCallback } from "react";
import type { User } from "../App";

interface Session {
  id: number;
  niches: string[];
  cities: string[];
  country: string;
  maxReviews: number;
  targetVolume: number;
  status: "running" | "completed" | "failed";
  leadsCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface Props {
  user: User;
  onLogout: () => void;
  onNewScrape: () => void;
}

const POLL_INTERVAL = 5000;

export default function Dashboard({ user, onLogout, onNewScrape }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", {
        headers: { "x-user-id": String(user.id) },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, [user.id]);

  // Initial load
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Poll every 5s if any sessions are running
  useEffect(() => {
    const hasRunning = sessions.some((s) => s.status === "running");
    if (!hasRunning) return;
    const id = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [sessions, fetchSessions]);

  async function downloadCSV(session: Session) {
    setDownloadingId(session.id);
    try {
      const res = await fetch(`/api/sessions/${session.id}/download`, {
        headers: { "x-user-id": String(user.id) },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `leads_${session.niches[0] ?? "data"}_${session.id}.csv`;
      a.click();
    } finally {
      setDownloadingId(null);
    }
  }

  const running = sessions.filter((s) => s.status === "running");
  const finished = sessions.filter((s) => s.status !== "running");

  const totalLeads = sessions.reduce((sum, s) => sum + s.leadsCount, 0);
  const totalCompleted = finished.filter((s) => s.status === "completed").length;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col">
      {/* Nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-white">Lead Finder</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="button-new-scrape"
            onClick={onNewScrape}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold rounded-lg hover:bg-[hsl(142,70%,40%)] transition"
          >
            + New Scrape
          </button>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{user.email}</span>
          <button data-testid="button-logout" onClick={onLogout} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Leads", value: totalLeads.toLocaleString(), icon: "👥" },
            { label: "Active Scrapes", value: running.length, icon: running.length > 0 ? "⚡" : "💤" },
            { label: "Completed Runs", value: totalCompleted, icon: "✅" },
            { label: "Total Sessions", value: sessions.length, icon: "📋" },
          ].map((s) => (
            <div
              key={s.label}
              data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4"
            >
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState onNewScrape={onNewScrape} />
        ) : (
          <div className="space-y-8">
            {/* Active Operations */}
            {running.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[hsl(var(--primary))] rounded-full animate-pulse" />
                  Active Operations
                </h2>
                <div className="space-y-3">
                  {running.map((s) => (
                    <ActiveCard key={s.id} session={s} />
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {finished.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-white mb-3">Download Center</h2>
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
                        {["Niches", "Cities", "Country", "Leads", "Max Reviews", "Status", "Date", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {finished.map((s) => (
                        <tr
                          key={s.id}
                          data-testid={`row-session-${s.id}`}
                          className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.3)] transition"
                        >
                          <td className="px-4 py-3 max-w-[180px]">
                            <div className="flex flex-wrap gap-1">
                              {s.niches.slice(0, 2).map((n) => (
                                <span key={n} className="inline-block px-2 py-0.5 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-xs rounded-full">{n}</span>
                              ))}
                              {s.niches.length > 2 && <span className="text-xs text-[hsl(var(--muted-foreground))]">+{s.niches.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">
                            {s.cities.slice(0, 2).join(", ")}
                            {s.cities.length > 2 && ` +${s.cities.length - 2}`}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">{s.country}</td>
                          <td className="px-4 py-3">
                            <span className="text-white font-semibold">{s.leadsCount.toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">≤{s.maxReviews}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={s.status} />
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs whitespace-nowrap">
                            {new Date(s.startedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {s.status === "completed" && s.leadsCount > 0 && (
                              <button
                                data-testid={`button-download-${s.id}`}
                                onClick={() => downloadCSV(s)}
                                disabled={downloadingId === s.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] text-xs font-semibold rounded-lg transition disabled:opacity-60"
                              >
                                {downloadingId === s.id ? (
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                )}
                                CSV
                              </button>
                            )}
                            {s.status === "failed" && (
                              <span className="text-xs text-red-400">{s.errorMessage?.slice(0, 40)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ActiveCard({ session }: { session: Session }) {
  const pct = Math.min(100, Math.round((session.leadsCount / session.targetVolume) * 100));

  return (
    <div
      data-testid={`card-active-${session.id}`}
      className="bg-[hsl(var(--card))] border border-[hsl(var(--primary)/0.2)] rounded-xl p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {session.niches.map((n) => (
              <span key={n} className="px-2.5 py-0.5 bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] text-xs font-medium rounded-full">{n}</span>
            ))}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {session.cities.slice(0, 3).join(", ")}{session.cities.length > 3 ? ` +${session.cities.length - 3} more` : ""} · {session.country} · ≤{session.maxReviews} reviews · page 3+
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-white">{session.leadsCount.toLocaleString()}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">of {session.targetVolume.toLocaleString()} target</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))] mb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[hsl(var(--primary))] rounded-full animate-pulse" />
            Scraping…
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
          <div
            className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Polling every 5s · Close your browser — this continues in the cloud
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs">Completed</span>;
  if (status === "failed") return <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs">Failed</span>;
  return <span className="px-2 py-0.5 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)] rounded-full text-xs">Running</span>;
}

function EmptyState({ onNewScrape }: { onNewScrape: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[hsl(var(--muted-foreground))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">No leads yet</h3>
      <p className="text-[hsl(var(--muted-foreground))] text-sm mb-6 max-w-xs">
        Launch your first scrape to start finding hidden businesses on Google Maps.
      </p>
      <button
        onClick={onNewScrape}
        className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold rounded-lg hover:bg-[hsl(142,70%,40%)] transition"
      >
        🚀 Launch your first scrape
      </button>
    </div>
  );
}
