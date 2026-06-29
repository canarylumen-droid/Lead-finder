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
  status: "running" | "completed" | "failed" | "paused";
  leadsCount: number;
  emailCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  leadsPerMinute?: number;
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

interface Props { user: User; onLogout: () => void; onNewScrape: () => void; }

const LEADS_PER_PAGE = 50;
const fmt  = (n: number | null | undefined) => (n ?? 0).toLocaleString();
const pct  = (n: number, d: number) => d ? Math.round((n / d) * 100) + "%" : "0%";

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function etaStr(remaining: number, lpm: number): string {
  if (!lpm || lpm <= 0 || remaining <= 0) return "—";
  const mins = Math.ceil(remaining / lpm);
  if (mins < 60) return mins + " min";
  return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
}

// ── Animated number hook ─────────────────────────────────────────────────────
function useAnimNum(target: number, ms = 500): number {
  const [cur, setCur] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current, diff = target - start, t0 = performance.now();
    const raf = (ts: number) => {
      const p = Math.min(1, (ts - t0) / ms);
      setCur(Math.round(start + diff * p));
      if (p < 1) requestAnimationFrame(raf); else prev.current = target;
    };
    requestAnimationFrame(raf);
  }, [target, ms]);
  return cur;
}

// ── SVG Speedometer ──────────────────────────────────────────────────────────
function Speedometer({ lpm, maxLpm = 30 }: { lpm: number; maxLpm?: number }) {
  const frac = Math.min(1, Math.max(0, lpm / maxLpm));
  const cx = 100, cy = 105, R = 82, needleLen = 68;

  // Full arc: from 210° to 330° (going clockwise over the top = 240° sweep)
  // We'll use 180° (semi-circle): from 180° to 360° in SVG coords
  // 9 o'clock = 180deg, 12 o'clock = 270deg, 3 o'clock = 0/360deg
  const toXY = (svgDeg: number, r = R) => {
    const rad = (svgDeg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as [number, number];
  };

  // Background arc: 9 o'clock (180°) → 3 o'clock (360°), going clockwise over the top
  const [bx1, by1] = toXY(180);
  const [bx2, by2] = toXY(360);

  // Colored arc up to current needle
  const currentDeg = 180 + frac * 180; // 180°=left, 270°=top, 360°=right
  const [ax2, ay2] = toXY(currentDeg);
  const arcLargeFlag = frac > 0.5 ? 1 : 0;

  // Needle rotation: -90° = 9 o'clock (speed 0), +90° = 3 o'clock (max speed)
  const needleAngle = -90 + frac * 180;
  const [tx, ty] = toXY(currentDeg, needleLen);

  // Color based on speed
  const color = frac < 0.35 ? "#22c55e" : frac < 0.65 ? "#eab308" : frac < 0.85 ? "#f97316" : "#ef4444";

  // Tick marks at 0, 25, 50, 75, 100%
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const d = 180 + f * 180;
    const [x1, y1] = toXY(d, R - 8);
    const [x2, y2] = toXY(d, R + 2);
    return { x1, y1, x2, y2, label: Math.round(f * maxLpm), labelPos: toXY(d, R + 16) };
  });

  return (
    <svg viewBox="0 0 200 120" className="w-36 h-24 shrink-0">
      {/* Gradient defs */}
      <defs>
        <radialGradient id="needleGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.8" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background arc */}
      <path
        d={`M ${bx1.toFixed(1)} ${by1.toFixed(1)} A ${R} ${R} 0 0 1 ${bx2.toFixed(1)} ${by2.toFixed(1)}`}
        fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round"
      />

      {/* Speed fill arc */}
      {frac > 0.01 && (
        <path
          d={`M ${bx1.toFixed(1)} ${by1.toFixed(1)} A ${R} ${R} 0 ${arcLargeFlag} 1 ${ax2.toFixed(1)} ${ay2.toFixed(1)}`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          style={{ transition: "d 0.6s cubic-bezier(0.25,0.46,0.45,0.94), stroke 0.6s" }}
        />
      )}

      {/* Ticks */}
      {ticks.map(({ x1, y1, x2, y2 }, i) => (
        <line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
          stroke="#374151" strokeWidth={i === 0 || i === 2 || i === 4 ? 2 : 1} />
      ))}

      {/* Label: 0 */}
      <text x="14" y={cy + 14} fill="#4b5563" fontSize="7.5" textAnchor="middle">0</text>
      {/* Label: max */}
      <text x="186" y={cy + 14} fill="#4b5563" fontSize="7.5" textAnchor="middle">{maxLpm}+</text>

      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={tx.toFixed(1)} y2={ty.toFixed(1)}
        stroke="white" strokeWidth="2.5" strokeLinecap="round"
        style={{ transition: "x2 0.6s cubic-bezier(0.25,0.46,0.45,0.94), y2 0.6s cubic-bezier(0.25,0.46,0.45,0.94)" }}
      />

      {/* Center cap */}
      <circle cx={cx} cy={cy} r="5" fill="#374151" />
      <circle cx={cx} cy={cy} r="3" fill={frac > 0.01 ? color : "#6b7280"} style={{ transition: "fill 0.6s" }} />

      {/* Speed label */}
      <text x={cx} y={cy + 22} fill="white" fontSize="13" fontWeight="bold" textAnchor="middle" className="tabular-nums">
        {lpm}
      </text>
      <text x={cx} y={cy + 33} fill="#6b7280" fontSize="7" textAnchor="middle">leads/min</text>
    </svg>
  );
}

export default function Dashboard({ user, onLogout, onNewScrape }: Props) {
  const [sessions, setSessions]           = useState<Session[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [leads, setLeads]                 = useState<Lead[]>([]);
  const [leadsPage, setLeadsPage]         = useState(1);
  const [leadsTotal, setLeadsTotal]       = useState(0);
  const [leadsLoading, setLeadsLoading]   = useState(false);
  const [stats, setStats]                 = useState<Stats | null>(null);
  const [exporting, setExporting]         = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQ, setSearchQ]             = useState("");
  const [debouncedQ, setDebouncedQ]       = useState("");
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [searchTotal, setSearchTotal]     = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const animLeads  = useAnimNum(stats?.totalLeads  ?? 0);
  const animEmails = useAnimNum(stats?.totalEmails ?? 0);
  const animPhones = useAnimNum(stats?.totalPhones ?? 0);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 380);
    return () => clearTimeout(t);
  }, [searchQ]);

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
    const r = await fetch("/api/sessions", { headers: { "x-user-id": String(user.id) } });
    const d = await r.json();
    if (Array.isArray(d.sessions)) setSessions(d.sessions);
    setLoading(false);
  }, [user.id]);

  const fetchStats = useCallback(async () => {
    const r = await fetch("/api/stats", { headers: { "x-user-id": String(user.id) } });
    setStats(await r.json());
  }, [user.id]);

  const fetchLeads = useCallback(async (sid: number, page: number) => {
    setLeadsLoading(true);
    const r  = await fetch(`/api/sessions/${sid}/leads?page=${page}&limit=${LEADS_PER_PAGE}`, {
      headers: { "x-user-id": String(user.id) },
    });
    const d  = await r.json();
    setLeads(d.leads ?? []);
    setLeadsTotal(d.total ?? 0);
    setLeadsLoading(false);
  }, [user.id]);

  useEffect(() => { fetchSessions(); fetchStats(); }, [fetchSessions, fetchStats]);

  // Poll while any session is active
  useEffect(() => {
    if (!sessions.some((s) => s.status === "running" || s.status === "paused")) return;
    const t = setInterval(() => { fetchSessions(); fetchStats(); }, 4000);
    return () => clearInterval(t);
  }, [sessions, fetchSessions, fetchStats]);

  // WebSocket — instant updates
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws    = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "session_update") {
          setSessions((prev) => prev.map((s) =>
            s.id === msg.sessionId
              ? { ...s, leadsCount: msg.leadsCount, emailCount: msg.emailCount,
                  status: msg.status, leadsPerMinute: msg.leadsPerMinute }
              : s,
          ));
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

  // Session controls
  const sessionAction = async (sid: number, action: "abort" | "pause" | "resume" | "restart") => {
    setActionLoading(`${action}-${sid}`);
    try {
      const r = await fetch(`/api/sessions/${sid}/${action}`, {
        method: "POST",
        headers: { "x-user-id": String(user.id) },
      });
      const d = await r.json();
      if (action === "restart" && d.session) {
        setSessions((prev) => [d.session, ...prev]);
        selectSession(d.session.id);
      } else {
        await fetchSessions();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const downloadCSV = async (sid: number) => {
    const r    = await fetch(`/api/sessions/${sid}/download`, { headers: { "x-user-id": String(user.id) } });
    const blob = await r.blob();
    const cd   = r.headers.get("Content-Disposition") ?? "";
    const name = cd.match(/filename="(.+)"/)?.[1] ?? `leads_${sid}.csv`;
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/leads/export", { headers: { "x-user-id": String(user.id) } });
      if (!r.ok) { alert("No leads to export yet"); return; }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: `all_leads_${new Date().toISOString().slice(0, 10)}.csv` }).click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const activeSessions  = sessions.filter((s) => s.status === "running");
  const pausedList      = sessions.filter((s) => s.status === "paused");
  const isSearchMode    = debouncedQ.length >= 2;
  const displayLeads    = isSearchMode ? searchResults : leads;
  const selectedSession = sessions.find((s) => s.id === selectedId);

  // Pick the gauge session: selected if running/paused, else first running
  const gaugeSession = (selectedSession?.status === "running" || selectedSession?.status === "paused")
    ? selectedSession
    : activeSessions[0] ?? pausedList[0];

  const lpm        = gaugeSession?.leadsPerMinute ?? 0;
  const progressPct = gaugeSession
    ? Math.min(100, Math.round((gaugeSession.leadsCount / Math.max(1, gaugeSession.targetVolume)) * 100))
    : 0;
  const remaining = gaugeSession ? Math.max(0, gaugeSession.targetVolume - gaugeSession.leadsCount) : 0;

  const kpis = stats ? [
    { label: "Total Leads",     value: animLeads,          sub: sessions.length + " sessions",                           color: "text-green-400",   bg: "bg-green-500/10"   },
    { label: "Emails Found",    value: animEmails,         sub: pct(stats.totalEmails, stats.totalLeads) + " rate",      color: "text-blue-400",    bg: "bg-blue-500/10"    },
    { label: "Phones Found",    value: animPhones,         sub: pct(stats.totalPhones, stats.totalLeads) + " rate",      color: "text-purple-400",  bg: "bg-purple-500/10"  },
    { label: "Verified Emails", value: stats.verifiedEmails, sub: pct(stats.verifiedEmails, stats.totalEmails) + " verified", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Active Scrapes",  value: activeSessions.length + pausedList.length, sub: sessions.filter((s) => s.status === "completed").length + " completed", color: activeSessions.length > 0 ? "text-yellow-400" : "text-gray-500", bg: activeSessions.length > 0 ? "bg-yellow-500/10" : "bg-gray-800" },
    { label: "Avg Reviews",     value: stats.avgReviews,   sub: fmt(stats.totalReviews) + " total",                      color: "text-orange-400",  bg: "bg-orange-500/10"  },
    { label: "Have Website",    value: stats.withWebsite,  sub: pct(stats.withWebsite, stats.totalLeads) + " have site", color: "text-cyan-400",    bg: "bg-cyan-500/10"    },
  ] : [];

  const statusColor = (s: Session["status"]) =>
    s === "running" ? "text-yellow-400" : s === "paused" ? "text-blue-400" : s === "completed" ? "text-green-400" : "text-red-400";
  const statusDot = (s: Session["status"]) =>
    s === "running" ? "bg-yellow-400 animate-pulse" : s === "paused" ? "bg-blue-400" : s === "completed" ? "bg-green-400" : "bg-red-400";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-3 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <span className="font-bold text-white text-sm hidden sm:block">Lead Finder</span>
          </div>

          {activeSessions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 text-xs font-medium">{activeSessions.length} scraping</span>
            </div>
          )}
          {pausedList.length > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-blue-400 text-xs font-medium">{pausedList.length} paused</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-gray-500 text-xs hidden lg:block truncate max-w-[160px]">{user.email}</span>
            <button onClick={onNewScrape} data-testid="btn-new-scrape"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              <span className="hidden sm:inline">New Scrape</span>
            </button>
            <button onClick={exportAll} disabled={exporting} data-testid="btn-export-all"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 transition disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {exporting
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>}
              </svg>
              <span className="hidden sm:inline">Export All</span>
            </button>
            <button onClick={onLogout} data-testid="btn-logout"
              className="p-1.5 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-3 py-4 flex-1 space-y-4">

        {/* KPI Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {kpis.map(({ label, value, sub, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl border border-white/5 px-3 py-3`}>
                <p className="text-xs text-gray-500 truncate mb-1">{label}</p>
                <p className={`text-lg font-bold ${color} leading-none tabular-nums`}>{fmt(typeof value === "number" ? value : 0)}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Live Speedometer Panel */}
        {gaugeSession && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <div className="flex items-start gap-4">

              {/* Animated SVG speedometer */}
              <Speedometer lpm={lpm} maxLpm={30} />

              {/* Info + controls */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full ${statusDot(gaugeSession.status)}`} />
                  <span className={`text-xs font-bold ${statusColor(gaugeSession.status)}`}>
                    {gaugeSession.status === "paused" ? "PAUSED" : "SCRAPING"}
                  </span>
                  <span className="text-xs text-gray-300 font-medium truncate">
                    {(gaugeSession.niches ?? []).slice(0, 3).join(", ")}
                  </span>
                  <span className="text-xs text-gray-600">·</span>
                  <span className="text-xs text-gray-500">{(gaugeSession.countries ?? []).join(", ")}</span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="tabular-nums">{fmt(gaugeSession.leadsCount)} / {fmt(gaugeSession.targetVolume)} leads</span>
                    <span className="text-gray-600 tabular-nums">ETA {etaStr(remaining, lpm)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progressPct}%`,
                        background: progressPct > 0 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "transparent",
                        transition: "width 0.7s ease",
                      }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-blue-400 tabular-nums">{fmt(gaugeSession.emailCount)} emails</span>
                    <span className="text-gray-600">{progressPct}% done</span>
                    <span className="text-gray-600 tabular-nums">{fmt(remaining)} remaining</span>
                  </div>
                </div>

                {/* Session controls */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {gaugeSession.status === "running" && (
                    <>
                      <button
                        data-testid={`btn-pause-${gaugeSession.id}`}
                        disabled={!!actionLoading}
                        onClick={() => sessionAction(gaugeSession.id, "pause")}
                        className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs rounded-lg border border-blue-500/30 transition disabled:opacity-50"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                        </svg>
                        Pause
                      </button>
                      <button
                        data-testid={`btn-abort-${gaugeSession.id}`}
                        disabled={!!actionLoading}
                        onClick={() => sessionAction(gaugeSession.id, "abort")}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg border border-red-500/30 transition disabled:opacity-50"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                        </svg>
                        Abort
                      </button>
                    </>
                  )}
                  {gaugeSession.status === "paused" && (
                    <>
                      <button
                        data-testid={`btn-resume-${gaugeSession.id}`}
                        disabled={!!actionLoading}
                        onClick={() => sessionAction(gaugeSession.id, "resume")}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs rounded-lg border border-green-500/30 transition disabled:opacity-50"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
                        </svg>
                        Resume
                      </button>
                      <button
                        data-testid={`btn-abort-paused-${gaugeSession.id}`}
                        disabled={!!actionLoading}
                        onClick={() => sessionAction(gaugeSession.id, "abort")}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg border border-red-500/30 transition disabled:opacity-50"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                        </svg>
                        Abort
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="h-20 flex items-center justify-center text-gray-600 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Loading…
          </div>
        )}

        {/* Main Layout */}
        <div className="flex gap-3">

          {/* Session sidebar */}
          <div className="w-60 shrink-0 space-y-2 hidden md:block">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Sessions</h2>
            {sessions.length === 0 && !loading && (
              <p className="text-xs text-gray-600 px-1">No sessions yet — start a scrape!</p>
            )}
            <div className="space-y-1.5 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
              {sessions.map((s) => {
                const pctDone = Math.min(100, Math.round((s.leadsCount / Math.max(1, s.targetVolume)) * 100));
                return (
                  <button key={s.id} data-testid={`session-${s.id}`} onClick={() => selectSession(s.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                      selectedId === s.id ? "border-green-500/50 bg-green-500/8" : "border-gray-800 bg-gray-900/60 hover:border-gray-700"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(s.status)}`} />
                        <span className={`text-xs font-semibold ${statusColor(s.status)}`}>
                          {s.status === "paused" ? "paused" : s.status === "running" ? "running" : s.status === "completed" ? "done" : "failed"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-600">{timeAgo(s.startedAt)}</span>
                    </div>
                    <p className="text-xs text-gray-300 font-medium truncate">
                      {(s.niches ?? []).slice(0, 2).join(", ")}{(s.niches ?? []).length > 2 ? " …" : ""}
                    </p>
                    <p className="text-xs text-gray-600 truncate mt-0.5">{(s.countries ?? []).join(", ")}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-white font-bold tabular-nums">{fmt(s.leadsCount)}</span>
                      <span className="text-xs text-gray-600">leads</span>
                      <span className="text-xs text-blue-400 tabular-nums">{fmt(s.emailCount)} em</span>
                    </div>
                    {(s.status === "running" || s.status === "paused") && (
                      <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pctDone}%`, transition: "width 0.7s ease" }} />
                      </div>
                    )}
                    {s.status === "running" && s.leadsPerMinute !== undefined && (
                      <p className="text-xs text-yellow-400/70 mt-1 tabular-nums">{s.leadsPerMinute} leads/min</p>
                    )}
                    {/* Restart button for failed sessions */}
                    {(s.status === "failed" || s.status === "completed") && (
                      <button
                        data-testid={`btn-restart-${s.id}`}
                        disabled={!!actionLoading}
                        onClick={(e) => { e.stopPropagation(); sessionAction(s.id, "restart"); }}
                        className="mt-1.5 flex items-center gap-1 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs rounded border border-gray-700 transition disabled:opacity-40"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                        Relaunch
                      </button>
                    )}
                  </button>
                );
              })}
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
            {sessions.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input data-testid="input-search"
                    placeholder="Search name, email, city…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 transition"
                  />
                  {searchQ && (
                    <button onClick={() => setSearchQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
                {isSearchMode && (
                  <span className="text-xs text-gray-500 shrink-0">{searchLoading ? "…" : fmt(searchTotal) + " results"}</span>
                )}
                {selectedSession && !isSearchMode && (
                  <button data-testid={`btn-csv-${selectedSession.id}`}
                    onClick={() => downloadCSV(selectedSession.id)}
                    className="flex items-center gap-1 px-2.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs rounded-lg border border-gray-700 transition shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span className="hidden sm:inline">Download CSV</span>
                  </button>
                )}
              </div>
            )}

            {/* Session meta */}
            {selectedSession && !isSearchMode && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className={`px-2 py-0.5 rounded font-medium ${
                  selectedSession.status === "running"   ? "bg-yellow-500/20 text-yellow-400" :
                  selectedSession.status === "paused"    ? "bg-blue-500/20 text-blue-400"     :
                  selectedSession.status === "completed" ? "bg-green-500/20 text-green-400"   :
                  "bg-red-500/20 text-red-400"
                }`}>
                  {selectedSession.status}
                </span>
                <span className="text-gray-400 font-medium">{(selectedSession.niches ?? []).join(", ")}</span>
                <span className="text-gray-700">·</span>
                <span>{(selectedSession.countries ?? []).join(", ")}</span>
                <span className="text-gray-700">·</span>
                <span className="tabular-nums">{fmt(selectedSession.leadsCount)} leads · {fmt(selectedSession.emailCount)} emails</span>
              </div>
            )}

            {isSearchMode && <p className="text-xs text-blue-400">Searching across all sessions…</p>}

            {/* Empty state */}
            {selectedId === null && !isSearchMode && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <svg className="w-10 h-10 text-gray-800 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
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
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {isSearchMode ? "Searching…" : "Loading leads…"}
                  </div>
                ) : displayLeads.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
                    {isSearchMode ? `No results for "${debouncedQ}"` : "No leads yet — scraping is starting…"}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800/80 text-left">
                        {[
                          ["Business Name",""],["Niche","hidden sm:table-cell"],["Email",""],
                          ["Phone","hidden md:table-cell"],["City","hidden lg:table-cell"],
                          ["Country","hidden xl:table-cell"],["Rating","hidden lg:table-cell"],
                          ["Reviews","hidden lg:table-cell"],["Website","hidden xl:table-cell"],
                          ["Maps","hidden xl:table-cell"],
                        ].map(([h, cls]) => (
                          <th key={h} className={`px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap ${cls}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayLeads.map((lead) => (
                        <tr key={lead.id} data-testid={`lead-${lead.id}`}
                          className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                          <td className="px-3 py-2 max-w-[160px]">
                            <span className="font-medium text-white truncate block">{lead.name}</span>
                            {lead.address && <span className="text-gray-600 truncate block mt-0.5">{lead.address}</span>}
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            <span className="px-1.5 py-0.5 bg-gray-700/60 text-gray-300 rounded text-xs">{lead.niche}</span>
                          </td>
                          <td className="px-3 py-2 max-w-[190px]">
                            {lead.email ? (
                              <div className="flex items-center gap-1 min-w-0">
                                {lead.emailVerified === 1 && (
                                  <svg className="w-3 h-3 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="MX verified">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                  </svg>
                                )}
                                <a href={"mailto:" + lead.email} className="text-blue-400 hover:text-blue-300 truncate block">{lead.email}</a>
                              </div>
                            ) : (
                              <span className="text-gray-700 italic">no email</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400 hidden md:table-cell">
                            {lead.phone ?? <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400 hidden lg:table-cell">{lead.city}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500 hidden xl:table-cell">{lead.country}</td>
                          <td className="px-3 py-2 whitespace-nowrap hidden lg:table-cell">
                            {lead.rating ? <span className="text-yellow-400">★ {lead.rating}</span> : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-400 tabular-nums hidden lg:table-cell">
                            {lead.reviewsCount != null ? lead.reviewsCount : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap hidden xl:table-cell">
                            {lead.website
                              ? <a href={lead.website} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 truncate block max-w-[110px]">
                                  {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap hidden xl:table-cell">
                            {lead.mapsUrl
                              ? <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-gray-500 hover:text-gray-300 underline">View</a>
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
                <span className="tabular-nums">
                  {(leadsPage - 1) * LEADS_PER_PAGE + 1}–{Math.min(leadsPage * LEADS_PER_PAGE, leadsTotal)} of {fmt(leadsTotal)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button disabled={leadsPage <= 1}
                    onClick={() => { const p = leadsPage - 1; setLeadsPage(p); fetchLeads(selectedId!, p); }}
                    className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700 disabled:opacity-30 transition">← Prev</button>
                  <span className="text-gray-600 px-1 tabular-nums">p.{leadsPage}</span>
                  <button disabled={leadsPage * LEADS_PER_PAGE >= leadsTotal}
                    onClick={() => { const p = leadsPage + 1; setLeadsPage(p); fetchLeads(selectedId!, p); }}
                    className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700 disabled:opacity-30 transition">Next →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
