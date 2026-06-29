import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "../App";
import { BarChart2, TrendingUp, TrendingDown, AlertTriangle, MousePointerClick, RefreshCw, CheckCircle, Info } from "lucide-react";

interface AccountStat {
  accountId:   number;
  label:       string;
  provider:    string;
  providerSlug: string;
  delivered:   number;
  bounced:     number;
  spam:        number;
  opens:       number;
  clicks:      number;
  fromApi:     boolean;
  error?:      string;
}

interface AnalyticsData {
  accounts: AccountStat[];
  totals:   { delivered: number; bounced: number; spam: number; opens: number; clicks: number };
  period:   { start: string; end: string };
}

type Preset = { label: string; days: number | null; key: string };

const PRESETS: Preset[] = [
  { label: "Today",     days: 0,   key: "today" },
  { label: "Yesterday", days: 1,   key: "yesterday" },
  { label: "7 days",    days: 7,   key: "7d" },
  { label: "14 days",   days: 14,  key: "14d" },
  { label: "30 days",   days: 30,  key: "30d" },
  { label: "60 days",   days: 60,  key: "60d" },
  { label: "90 days",   days: 90,  key: "90d" },
  { label: "6 months",  days: 180, key: "6mo" },
  { label: "1 year",    days: 365, key: "1yr" },
];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetDates(p: Preset): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (p.days === 0) return { start: toIso(today), end: toIso(today) };
  if (p.days === 1) {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: toIso(y), end: toIso(y) };
  }
  const start = new Date(today); start.setDate(start.getDate() - (p.days ?? 30));
  return { start: toIso(start), end: toIso(today) };
}

function pct(num: number, den: number) {
  if (!den) return "—";
  return (num / den * 100).toFixed(1) + "%";
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-[hsl(var(--foreground))] tabular-nums truncate">{typeof value === "number" ? value.toLocaleString() : value}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        {sub && <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const PROVIDER_COLORS: Record<string, string> = {
  brevo: "#0b996e", sendgrid: "#1a82e2", resend: "#000000", mailgun: "#f06b1e",
  postmark: "#ffde00", ses: "#ff9900", custom: "#6366f1",
};

export default function Analytics({ user }: { user: User }) {
  const h = { "x-user-id": String(user.id) };

  const [preset,     setPreset]     = useState<string>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");
  const [useCustom,   setUseCustom]   = useState(false);

  const { start, end } = useMemo(() => {
    if (useCustom && customStart && customEnd) return { start: customStart, end: customEnd };
    const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[4];
    return presetDates(p);
  }, [preset, useCustom, customStart, customEnd]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/smtp", user.id, start, end],
    queryFn: () => fetch(`/api/analytics/smtp?start=${start}&end=${end}`, { headers: h }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const totals   = data?.totals;
  const accounts = data?.accounts ?? [];
  const bounceRate = totals ? pct(totals.bounced, totals.delivered + totals.bounced) : "—";
  const openRate   = totals ? pct(totals.opens,   totals.delivered) : "—";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Analytics</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            Email stats from provider APIs + relay logs. Period: <span className="text-[hsl(var(--foreground))]">{start}</span> → <span className="text-[hsl(var(--foreground))]">{end}</span>
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition disabled:opacity-50">
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />Refresh
        </button>
      </div>

      {/* Date presets */}
      <div className="flex flex-wrap gap-2 items-center">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => { setPreset(p.key); setUseCustom(false); }}
            data-testid={`preset-${p.key}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              !useCustom && preset === p.key
                ? "bg-[hsl(var(--primary))] text-black border-[hsl(var(--primary))]"
                : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-[hsl(var(--border))] select-none px-1">|</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setUseCustom(true); }}
            className="px-2 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)/0.5)]" />
          <span className="text-[hsl(var(--muted-foreground))] text-xs">→</span>
          <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setUseCustom(true); }}
            className="px-2 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)/0.5)]" />
        </div>
      </div>

      {/* Loading */}
      {(isLoading || isFetching) && (
        <div className="flex items-center justify-center py-12 gap-3 text-[hsl(var(--muted-foreground))]">
          <div className="w-5 h-5 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Fetching stats from provider APIs…</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {(error as Error).message}
        </div>
      )}

      {/* Summary cards */}
      {totals && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="Delivered"  value={totals.delivered} icon={CheckCircle}      color="bg-green-500/15 text-green-400" />
          <StatCard label="Bounced"    value={totals.bounced}   sub={`Rate: ${bounceRate}`} icon={TrendingDown} color="bg-red-500/15 text-red-400" />
          <StatCard label="Spam"       value={totals.spam}      icon={AlertTriangle}    color="bg-orange-500/15 text-orange-400" />
          <StatCard label="Opens"      value={totals.opens}     sub={`Rate: ${openRate}`}   icon={TrendingUp}   color="bg-blue-500/15 text-blue-400" />
          <StatCard label="Clicks"     value={totals.clicks}    icon={MousePointerClick} color="bg-purple-500/15 text-purple-400" />
        </div>
      )}

      {/* Per-account table */}
      {accounts.length > 0 && !isLoading && (
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Per Account Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--muted)/0.4)]">
                  {["Account", "Provider", "Delivered", "Bounced", "Bounce %", "Spam", "Opens", "Clicks", "Source"].map((h_) => (
                    <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] px-4 py-2.5 whitespace-nowrap">{h_}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const bRate = a.delivered + a.bounced > 0 ? (a.bounced / (a.delivered + a.bounced) * 100).toFixed(1) + "%" : "—";
                  const color = PROVIDER_COLORS[a.providerSlug] ?? "#6366f1";
                  return (
                    <tr key={a.accountId} data-testid={`row-analytics-${a.accountId}`}
                      className="border-t border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.2)] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[hsl(var(--foreground))]">{a.label}</div>
                        {a.error && <div className="text-[10px] text-orange-400 flex items-center gap-1 mt-0.5"><Info size={10} />{a.error}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}>
                          {a.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-green-400 font-medium">{a.delivered.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-red-400">{a.bounced.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-[hsl(var(--muted-foreground))]">{bRate}</td>
                      <td className="px-4 py-3 tabular-nums text-orange-400">{a.spam.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-blue-400">{a.opens.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-purple-400">{a.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {a.fromApi
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/30">Provider API</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">Relay logs</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="px-4 py-3 border-t border-[hsl(var(--border)/0.5)] bg-[hsl(var(--muted)/0.2)]">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              <span className="text-green-400 font-medium">Provider API</span> — live stats from Brevo / SendGrid API (requires API key stored).
              {" "}<span className="text-[hsl(var(--muted-foreground))] font-medium">Relay logs</span> — fallback: counts from your local relay server only. Providers without stats API: Resend, Mailgun, Postmark, etc.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isFetching && accounts.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[hsl(var(--border))] rounded-xl gap-3 text-[hsl(var(--muted-foreground))]">
          <BarChart2 size={36} className="opacity-30" />
          <p className="text-sm">No SMTP accounts found. Add accounts on the SMTP Providers page first.</p>
        </div>
      )}
    </div>
  );
}
