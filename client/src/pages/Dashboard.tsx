import { useState, useEffect, useCallback, useRef } from "react";
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
  emailCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface Lead {
  id: number;
  niche: string;
  city: string;
  country: string;
  name: string;
  phone: string | null;
  website: string | null;
  rating: string | null;
  reviewsCount: number | null;
  address: string | null;
  email: string | null;
  emailVerified: number;
  mapsUrl: string | null;
}

interface Props {
  user: User;
  onLogout: () => void;
  onNewScrape: () => void;
}

const POLL_INTERVAL = 8_000; // fallback polling if WS down

export default function Dashboard({ user, onLogout, onNewScrape }: Props) {
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [leadsPage, setLeadsPage]     = useState(1);
  const [leadsTotal, setLeadsTotal]   = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const wsRef   = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const res  = await fetch("/api/sessions", { headers: { "x-user-id": String(user.id) } });
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  }, [user.id]);

  const fetchLeads = useCallback(async (sessionId: number, page: number) => {
    setLeadsLoading(true);
    try {
      const res  = await fetch(`/api/sessions/${sessionId}/leads?page=${page}&limit=50`, {
        headers: { "x-user-id": String(user.id) },
      });
      if (!res.ok) return;
      const data = await res.json();
      setLeads(data.leads ?? []);
      setLeadsTotal(data.total ?? 0);
    } finally {
      setLeadsLoading(false);
    }
  }, [user.id]);

  // ── WebSocket (real-time KPI) ──────────────────────────────────────────────
  const connectWS = useCallback((runningSessions: Session[]) => {
    if (!runningSessions.length) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Subscribe to any new sessions
      runningSessions.forEach((s) =>
        wsRef.current!.send(JSON.stringify({ type: "subscribe", sessionId: s.id }))
      );
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws    = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      runningSessions.forEach((s) =>
        ws.send(JSON.stringify({ type: "subscribe", sessionId: s.id }))
      );
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type !== "session_update") return;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === msg.sessionId
              ? { ...s, leadsCount: msg.leadsCount, emailCount: msg.emailCount, status: msg.status }
              : s
          )
        );
        // Refresh lead table if viewing this session
        if (msg.sessionId === selectedId) {
          fetchLeads(msg.sessionId, leadsPage);
        }
      } catch (_) {}
    };

    ws.onerror  = () => {};
    ws.onclose  = () => {};
  }, [selectedId, leadsPage, fetchLeads]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const running = sessions.filter((s) => s.status === "running");
    connectWS(running);

    // Fallback poll for when WS is down
    if (pollRef.current) clearInterval(pollRef.current);
    if (running.length > 0) {
      pollRef.current = setInterval(fetchSessions, POLL_INTERVAL);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessions.filter((s) => s.status === "running").length, connectWS, fetchSessions]);

  useEffect(() => {
    if (selectedId) fetchLeads(selectedId, leadsPage);
  }, [selectedId, leadsPage, fetchLeads]);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ── CSV download ───────────────────────────────────────────────────────────
  async function downloadCSV(session: Session) {
    setDownloadingId(session.id);
    try {
      const res = await fetch(`/api/sessions/${session.id}/download`, {
        headers: { "x-user-id": String(user.id) },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `leads_${session.niches[0] ?? "data"}_${session.id}.csv`;
      a.click();
    } finally { setDownloadingId(null); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const running  = sessions.filter((s) => s.status === "running");
  const finished = sessions.filter((s) => s.status !== "running");
  const totalLeads  = sessions.reduce((s, r) => s + r.leadsCount, 0);
  const totalEmails = sessions.reduce((s, r) => s + (r.emailCount ?? 0), 0);
  const totalPages  = Math.ceil(leadsTotal / 50);
  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col">
      {/* Nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-white">Lead Finder</span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.2)] px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-[hsl(var(--primary))] rounded-full animate-pulse" />
              {running.length} live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="button-new-scrape"
            onClick={onNewScrape}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold rounded-lg hover:bg-[hsl(142,70%,40%)] transition"
          >
            + New Scrape
          </button>
          <span className="text-xs text-[hsl(var(--muted-foreground))] hidden sm:block">{user.email}</span>
          <button data-testid="button-logout" onClick={onLogout} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full space-y-8">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon="👥" label="Total Leads" value={totalLeads.toLocaleString()} />
          <KPICard
            icon="📧"
            label="Emails Found"
            value={totalEmails.toLocaleString()}
            sub={totalLeads > 0 ? `${Math.round((totalEmails / totalLeads) * 100)}% of leads` : undefined}
            highlight={totalEmails > 0}
          />
          <KPICard icon="⚡" label="Active Scrapes" value={String(running.length)} highlight={running.length > 0} />
          <KPICard icon="✅" label="Completed Runs" value={String(finished.filter((s) => s.status === "completed").length)} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState onNewScrape={onNewScrape} />
        ) : (
          <>
            {/* Active Operations */}
            {running.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
                  Active Operations
                </h2>
                <div className="space-y-3">
                  {running.map((s) => (
                    <ActiveCard
                      key={s.id}
                      session={s}
                      isSelected={selectedId === s.id}
                      onClick={() => { setSelectedId(s.id === selectedId ? null : s.id); setLeadsPage(1); }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* History / Download Center */}
            {finished.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
                  Download Center
                </h2>
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
                          {["Niches", "Cities", "Country", "Leads", "Emails", "vs Target", "Status", "Date", ""].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finished.map((s) => {
                          const over   = s.leadsCount - s.targetVolume;
                          const overPct = Math.round((s.leadsCount / s.targetVolume) * 100);
                          return (
                            <tr
                              key={s.id}
                              data-testid={`row-session-${s.id}`}
                              className={`border-b border-[hsl(var(--border))] last:border-0 transition cursor-pointer ${selectedId === s.id ? "bg-[hsl(var(--primary)/0.05)]" : "hover:bg-[hsl(var(--muted)/0.3)]"}`}
                              onClick={() => { setSelectedId(s.id === selectedId ? null : s.id); setLeadsPage(1); }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {s.niches.slice(0, 2).map((n) => (
                                    <span key={n} className="px-2 py-0.5 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-xs rounded-full">{n}</span>
                                  ))}
                                  {s.niches.length > 2 && <span className="text-xs text-[hsl(var(--muted-foreground))]">+{s.niches.length - 2}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                                {s.cities.slice(0, 2).join(", ")}{s.cities.length > 2 ? ` +${s.cities.length - 2}` : ""}
                              </td>
                              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{s.country}</td>
                              <td className="px-4 py-3 font-semibold text-white">{s.leadsCount.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                {(s.emailCount ?? 0) > 0 ? (
                                  <span className="text-[hsl(var(--primary))] font-medium">{s.emailCount.toLocaleString()}</span>
                                ) : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {over >= 0 ? (
                                  <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs font-medium">
                                    +{over.toLocaleString()} ({overPct}%)
                                  </span>
                                ) : (
                                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{overPct}%</span>
                                )}
                              </td>
                              <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                                {new Date(s.startedAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                {s.status === "completed" && s.leadsCount > 0 && (
                                  <button
                                    data-testid={`button-download-${s.id}`}
                                    onClick={() => downloadCSV(s)}
                                    disabled={downloadingId === s.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] text-xs font-semibold rounded-lg transition disabled:opacity-60"
                                  >
                                    {downloadingId === s.id
                                      ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                                    CSV
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Lead table (shown when a session is selected) */}
            {selectedId && selectedSession && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Leads — {selectedSession.niches.slice(0, 2).join(", ")} · {selectedSession.country}
                    </h2>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {leadsTotal.toLocaleString()} total · page {leadsPage} of {totalPages || 1}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={leadsPage <= 1}
                      onClick={() => setLeadsPage((p) => p - 1)}
                      className="px-3 py-1.5 text-sm bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:text-white disabled:opacity-40 transition"
                    >← Prev</button>
                    <button
                      disabled={leadsPage >= totalPages}
                      onClick={() => setLeadsPage((p) => p + 1)}
                      className="px-3 py-1.5 text-sm bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:text-white disabled:opacity-40 transition"
                    >Next →</button>
                  </div>
                </div>

                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                  {leadsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-5 h-5 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
                            {["Business Name", "Niche", "City", "Phone", "Email", "Rating", "Reviews", "Website"].map((h) => (
                              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {leads.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">No leads yet — scraper is running…</td></tr>
                          ) : (
                            leads.map((lead) => (
                              <tr key={lead.id} data-testid={`row-lead-${lead.id}`} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.3)] transition">
                                <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">
                                  {lead.mapsUrl
                                    ? <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(var(--primary))] transition">{lead.name}</a>
                                    : lead.name}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{lead.niche}</td>
                                <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">{lead.city}</td>
                                <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">{lead.phone ?? <Dash />}</td>
                                <td className="px-4 py-2.5">
                                  {lead.email ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${lead.emailVerified === 1 ? "bg-green-500/10 text-green-400" : "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"}`}>
                                      {lead.emailVerified === 1 && "✓ "}{lead.email}
                                    </span>
                                  ) : <Dash />}
                                </td>
                                <td className="px-4 py-2.5 text-xs">
                                  {lead.rating ? <span className="text-yellow-400">★ {lead.rating}</span> : <Dash />}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">{lead.reviewsCount ?? <Dash />}</td>
                                <td className="px-4 py-2.5 text-xs max-w-[140px] truncate">
                                  {lead.website
                                    ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{lead.website.replace(/^https?:\/\//, "")}</a>
                                    : <Dash />}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, highlight }: { icon: string; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`bg-[hsl(var(--card))] border rounded-xl p-4 transition ${highlight ? "border-[hsl(var(--primary)/0.4)]" : "border-[hsl(var(--border))]"}`}>
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[hsl(var(--primary))] mt-0.5">{sub}</div>}
    </div>
  );
}

function ActiveCard({ session, isSelected, onClick }: { session: Session; isSelected: boolean; onClick: () => void }) {
  const pct     = Math.min(Math.round((session.leadsCount / session.targetVolume) * 100), 999);
  const over    = session.leadsCount - session.targetVolume;
  const emailPct = session.leadsCount > 0
    ? Math.round(((session.emailCount ?? 0) / session.leadsCount) * 100)
    : 0;

  return (
    <div
      data-testid={`card-active-${session.id}`}
      onClick={onClick}
      className={`bg-[hsl(var(--card))] border rounded-xl p-5 space-y-4 cursor-pointer transition ${isSelected ? "border-[hsl(var(--primary)/0.5)] ring-1 ring-[hsl(var(--primary)/0.2)]" : "border-[hsl(var(--primary)/0.2)] hover:border-[hsl(var(--primary)/0.4)]"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {session.niches.map((n) => (
              <span key={n} className="px-2.5 py-0.5 bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] text-xs font-medium rounded-full">{n}</span>
            ))}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {session.cities.slice(0, 4).join(", ")}{session.cities.length > 4 ? ` +${session.cities.length - 4} cities` : ""} · {session.country} · ≤{session.maxReviews} reviews · page 3+
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <div className="text-2xl font-bold text-white">{session.leadsCount.toLocaleString()}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">of {session.targetVolume.toLocaleString()} target</div>
          {over > 0 && (
            <div className="text-xs font-semibold text-green-400">🎯 +{over.toLocaleString()} over target!</div>
          )}
        </div>
      </div>

      {/* Lead progress */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
            <span className="w-1.5 h-1.5 bg-[hsl(var(--primary))] rounded-full animate-pulse" />
            Scraping live · WebSocket
          </span>
          <span className="text-white font-medium">{pct}%</span>
        </div>
        <div className="w-full h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
          <div className="h-full bg-[hsl(var(--primary))] rounded-full transition-all duration-300" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      {/* Email sub-bar */}
      {(session.emailCount ?? 0) > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1 text-[hsl(var(--muted-foreground))]">
            <span>📧 Emails found: {(session.emailCount ?? 0).toLocaleString()}</span>
            <span>{emailPct}% of leads</span>
          </div>
          <div className="w-full h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${emailPct}%` }} />
          </div>
        </div>
      )}

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Click to view leads · Close your browser — this continues in the cloud
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs">Completed</span>;
  if (status === "failed")    return <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs">Failed</span>;
  return <span className="px-2 py-0.5 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)] rounded-full text-xs">Running</span>;
}

function Dash() { return <span className="text-[hsl(var(--border))]">—</span>; }

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
        Launch your first scrape to find hidden businesses on Google Maps — page 3 and beyond.
      </p>
      <button onClick={onNewScrape} className="px-6 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold rounded-lg hover:bg-[hsl(142,70%,40%)] transition">
        🚀 Launch your first scrape
      </button>
    </div>
  );
}
