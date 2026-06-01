import { useState, useEffect, useCallback, useRef } from "react";
import type { User } from "../App";

interface Session {
  id: number;
  niches: string[];
  cities: string[];
  country: string;
  countries: string[];
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

interface Stats {
  totalLeads: number;
  totalEmails: number;
  totalPhones: number;
  verifiedEmails: number;
  totalReviews: number;
  avgReviews: number;
  withWebsite: number;
}

interface Props {
  user: User;
  onLogout: () => void;
  onNewScrape: () => void;
}

const LEADS_PER_PAGE = 50;

function fmt(n: number) { return (n ?? 0).toLocaleString(); }
function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) + "%" : "0%"; }
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

export default function Dashboard({ user, onLogout, onNewScrape }: Props) {
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [leadsPage, setLeadsPage]     = useState(1);
  const [leadsTotal, setLeadsTotal]   = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [exporting, setExporting]     = useState(false);

  // Search
  const [searchQ, setSearchQ]             = useState("");
  const [debouncedQ, setDebouncedQ]       = useState("");
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [searchTotal, setSearchTotal]     = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Fetch search results
  useEffect(() => {
    if (debouncedQ.length < 2) { setSearchResults([]); setSearchTotal(0); return; }
    setSearchLoading(true);
    fetch(`/api/leads/search?q=${encodeURIComponent(debouncedQ)}&limit=100`, {
      headers: { "x-user-id": String(user.id) },
    })
      .then((r) => r.json())
      .then((d) => { setSearchResults(d.leads ?? []); setSearchTotal(d.total ?? 0); })
      .finally(() => setSearchLoading(false));
  }, [debouncedQ, user.id]);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/sessions", { headers: { "x-user-id": String(user.id) } });
    const data = await res.json();
    if (Array.isArray(data.sessions)) setSessions(data.sessions);
    setLoading(false);
  }, [user.id]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/stats", { headers: { "x-user-id": String(user.id) } });
    const d = await res.json();
    setStats(d);
  }, [user.id]);

  const fetchLeads = useCallback(async (sessionId: number, page: number) => {
    setLeadsLoading(true);
    const res = await fetch(`/api/sessions/${sessionId}/leads?page=${page}&limit=${LEADS_PER_PAGE}`, {
      headers: { "x-user-id": String(user.id) },
    });
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLeadsTotal(data.total ?? 0);
    setLeadsLoading(false);
  }, [user.id]);

  useEffect(() => { fetchSessions(); fetchStats(); }, [fetchSessions, fetchStats]);

  // Poll while running
  useEffect(() => {
    const hasRunning = sessions.some((s) => s.status === "running");
    if (!hasRunning) return;
    const t = setInterval(() => { fetchSessions(); fetchStats(); }, 2000);
    return () => clearInterval(t);
  }, [sessions, fetchSessions, fetchStats]);

  // WebSocket
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws    = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "session_update") {
          setSessions((prev) =>
            prev.map((s) => s.id === msg.sessionId
              ? { ...s, leadsCount: msg.leadsCount, emailCount: msg.emailCount, status: msg.status }
              : s),
          );
          if (msg.sessionId === selectedId) fetchLeads(msg.sessionId, leadsPage);
          fetchStats();
        }
      } catch {}
    };
    return () => ws.close();
  }, [selectedId, leadsPage, fetchLeads, fetchStats]);

  const selectSession = (id: number) => {
    setSelectedId(id); setLeadsPage(1); setSearchQ("");
    fetchLeads(id, 1);
  };

  const downloadCSV = async (sessionId: number) => {
    const res = await fetch(`/api/sessions/${sessionId}/download`, { headers: { "x-user-id": String(user.id) } });
    const blob = await res.blob();
    const cd   = res.headers.get("Content-Disposition") || "";
    const name = cd.match(/filename="(.+)"/)?.[1] || `leads_${sessionId}.csv`;
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/leads/export", { headers: { "x-user-id": String(user.id) } });
      if (!res.ok) { alert("No leads to export yet"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: `all_leads_${new Date().toISOString().slice(0, 10)}.csv` }).click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const activeSessions  = sessions.filter((s) => s.status === "running");
  const isSearchMode    = debouncedQ.length >= 2;
  const displayLeads    = isSearchMode ? searchResults : leads;
  const selectedSession = sessions.find((s) => s.id === selectedId);

  const kpis = stats ? [
    { label: "Total Leads",      value: fmt(stats.totalLeads),     sub: fmt(sessions.length) + " sessions",            color: "text-green-400",   bg: "bg-green-500/10"  },
    { label: "Emails Found",     value: fmt(stats.totalEmails),    sub: pct(stats.totalEmails, stats.totalLeads) + " of leads", color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Phones Found",     value: fmt(stats.totalPhones),    sub: pct(stats.totalPhones, stats.totalLeads) + " of leads", color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Verified Emails",  value: fmt(stats.verifiedEmails), sub: pct(stats.verifiedEmails, stats.totalEmails) + " of emails", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Active Scrapes",   value: String(activeSessions.length), sub: sessions.filter((s) => s.status === "completed").length + " completed", color: activeSessions.length > 0 ? "text-yellow-400" : "text-gray-500", bg: activeSessions.length > 0 ? "bg-yellow-500/10" : "bg-gray-800" },
    { label: "Total Reviews",    value: fmt(stats.totalReviews),   sub: "avg " + stats.avgReviews + " per lead",       color: "text-orange-400",  bg: "bg-orange-500/10" },
    { label: "With Website",     value: fmt(stats.withWebsite),    sub: pct(stats.withWebsite, stats.totalLeads) + " have a site", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ] : [];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 px-3 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-bold text-white text-sm hidden sm:block">Lead Finder</span>
          </div>

          {activeSessions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 text-xs font-medium hidden sm:block">{activeSessions.length} running</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-gray-500 text-xs hidden lg:block truncate max-w-[160px]">{user.email}</span>
            <button onClick={onNewScrape} data-testid="btn-new-scrape"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">New Scrape</span>
            </button>
            <button onClick={exportAll} disabled={exporting} data-testid="btn-export-all"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs rounded-lg border border-gray-700 transition disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {exporting
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                }
              </svg>
              <span className="hidden sm:inline">Export All</span>
            </button>
            <button onClick={onLogout} data-testid="btn-logout"
              className="p-1.5 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-3 py-4 flex-1 space-y-4">

        {/* ── KPI Cards ── */}
        {!loading && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {kpis.map(({ label, value, sub, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl border border-white/5 px-3 py-3`}>
                <p className="text-xs text-gray-500 truncate mb-1">{label}</p>
                <p className={`text-lg font-bold ${color} leading-none`}>{value}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="h-20 flex items-center justify-center text-gray-600 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        )}

        {/* ── Main layout ── */}
        <div className="flex gap-3">

          {/* Session list — desktop sidebar */}
          <div className="w-60 shrink-0 space-y-2 hidden md:block">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Sessions</h2>
            {sessions.length === 0 && !loading && (
              <p className="text-xs text-gray-600 px-1">No sessions yet</p>
            )}
            <div className="space-y-1.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
              {sessions.map((s) => (
                <button key={s.id} data-testid={`session-${s.id}`} onClick={() => selectSession(s.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                    selectedId === s.id ? "border-green-500/50 bg-green-500/10" : "border-gray-800 bg-gray-900 hover:border-gray-700"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${s.status === "running" ? "text-yellow-400" : s.status === "completed" ? "text-green-400" : "text-red-400"}`}>
                      {s.status === "running" ? "● running" : s.status === "completed" ? "✓ done" : "✗ failed"}
                    </span>
                    <span className="text-xs text-gray-600">{timeAgo(s.startedAt)}</span>
                  </div>
                  <p className="text-xs text-gray-300 font-medium truncate">
                    {(s.niches ?? []).slice(0, 2).join(", ")}{(s.niches ?? []).length > 2 ? " …" : ""}
                  </p>
                  <p className="text-xs text-gray-600 truncate mt-0.5">
                    {(s.countries ?? []).join(", ") || s.country || "—"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-white font-bold">{fmt(s.leadsCount)}</span>
                    <span className="text-xs text-gray-600">leads</span>
                    <span className="text-xs text-blue-400">{fmt(s.emailCount)} emails</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lead table area */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Mobile session picker */}
            <div className="md:hidden">
              <select data-testid="select-session" value={selectedId ?? ""}
                onChange={(e) => e.target.value && selectSession(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2">
                <option value="">Select a session…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.status}] {(s.niches ?? []).slice(0, 2).join(", ")} — {fmt(s.leadsCount)} leads
                  </option>
                ))}
              </select>
            </div>

            {/* Search + download row */}
            {(selectedId !== null || sessions.length > 0) && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input data-testid="input-search" placeholder="Search all leads — name, niche, city, email…"
                    value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 transition" />
                  {searchQ && (
                    <button onClick={() => setSearchQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {isSearchMode && (
                  <span className="text-xs text-gray-500 shrink-0">{searchLoading ? "…" : fmt(searchTotal) + " results"}</span>
                )}
                {selectedSession && !isSearchMode && (
                  <button data-testid={`btn-csv-${selectedSession.id}`} onClick={() => downloadCSV(selectedSession.id)}
                    className="flex items-center gap-1 px-2.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs rounded-lg border border-gray-700 transition shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                )}
              </div>
            )}

            {/* Session meta row */}
            {selectedSession && !isSearchMode && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className={`px-2 py-0.5 rounded font-medium ${selectedSession.status === "running" ? "bg-yellow-500/20 text-yellow-400" : selectedSession.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {selectedSession.status}
                </span>
                <span>{(selectedSession.niches ?? []).join(", ")}</span>
                <span className="text-gray-700">·</span>
                <span>{(selectedSession.countries ?? []).join(", ")}</span>
                <span className="text-gray-700">·</span>
                <span>{fmt(selectedSession.leadsCount)} leads · {fmt(selectedSession.emailCount)} emails</span>
                <span className="text-gray-700">·</span>
                <span>Max {selectedSession.maxReviews === 0 ? "unlimited" : selectedSession.maxReviews} reviews</span>
              </div>
            )}

            {isSearchMode && (
              <p className="text-xs text-blue-400">Searching across all your leads…</p>
            )}

            {/* Empty state */}
            {selectedId === null && !isSearchMode && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <svg className="w-10 h-10 text-gray-800 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-gray-500 text-sm font-medium">Select a session to view leads</p>
                <p className="text-gray-700 text-xs mt-1">Or search above to find any lead</p>
              </div>
            )}

            {/* Lead table */}
            {(selectedId !== null || isSearchMode) && (
              <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
                {(leadsLoading && !isSearchMode) || (searchLoading && isSearchMode) ? (
                  <div className="flex items-center justify-center py-16 text-gray-600 text-sm gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {isSearchMode ? "Searching…" : "Loading leads…"}
                  </div>
                ) : displayLeads.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
                    {isSearchMode ? ("No results for: " + debouncedQ) : "No leads yet — scrape is running"}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800 text-left">
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap">Business</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap">Niche</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap">City</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden sm:table-cell">Country</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap">Email</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden md:table-cell">Phone</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden lg:table-cell">Rating</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden lg:table-cell">Reviews</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden xl:table-cell">Website</th>
                        <th className="px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap hidden xl:table-cell">Maps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayLeads.map((lead) => (
                        <tr key={lead.id} data-testid={`lead-${lead.id}`}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-3 py-2 max-w-[160px]">
                            <span className="font-medium text-white truncate block">{lead.name}</span>
                            {lead.address && <span className="text-gray-600 truncate block mt-0.5">{lead.address}</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 bg-gray-700/70 text-gray-300 rounded text-xs">{lead.niche}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400">{lead.city}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500 hidden sm:table-cell">{lead.country}</td>
                          <td className="px-3 py-2 max-w-[180px]">
                            {lead.email ? (
                              <div className="flex items-center gap-1 min-w-0">
                                {lead.emailVerified === 1 && (
                                  <svg className="w-3 h-3 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="MX verified">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                  </svg>
                                )}
                                <a href={"mailto:" + lead.email} className="text-blue-400 hover:text-blue-300 truncate block">{lead.email}</a>
                              </div>
                            ) : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400 hidden md:table-cell">{lead.phone ?? <span className="text-gray-700">—</span>}</td>
                          <td className="px-3 py-2 whitespace-nowrap hidden lg:table-cell">
                            {lead.rating
                              ? <span className="text-yellow-400">★ {lead.rating}</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400 hidden lg:table-cell">{lead.reviewsCount ?? <span className="text-gray-700">—</span>}</td>
                          <td className="px-3 py-2 whitespace-nowrap hidden xl:table-cell">
                            {lead.website
                              ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate block max-w-[100px]">{lead.website.replace(/^https?:\/\//, "")}</a>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap hidden xl:table-cell">
                            {lead.mapsUrl
                              ? <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300 text-xs underline">View</a>
                              : <span className="text-gray-700">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Pagination */}
            {selectedId !== null && !isSearchMode && leadsTotal > LEADS_PER_PAGE && (
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>
                  {(leadsPage - 1) * LEADS_PER_PAGE + 1}–{Math.min(leadsPage * LEADS_PER_PAGE, leadsTotal)} of {fmt(leadsTotal)} leads
                </span>
                <div className="flex items-center gap-1.5">
                  <button disabled={leadsPage <= 1}
                    onClick={() => { const p = leadsPage - 1; setLeadsPage(p); fetchLeads(selectedId!, p); }}
                    className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700 disabled:opacity-30 transition">
                    Prev
                  </button>
                  <span className="text-gray-600 px-1">p.{leadsPage}</span>
                  <button disabled={leadsPage * LEADS_PER_PAGE >= leadsTotal}
                    onClick={() => { const p = leadsPage + 1; setLeadsPage(p); fetchLeads(selectedId!, p); }}
                    className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700 disabled:opacity-30 transition">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
