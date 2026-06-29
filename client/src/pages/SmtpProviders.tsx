import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, TestTube, Zap, ExternalLink, ArrowRight, X } from "lucide-react";

interface Provider {
  id: number; slug: string; name: string;
  smtpHost: string | null; smtpPort: number | null;
  hasApiFetch: number; color: string | null; docsUrl: string | null;
}
interface Account {
  id: number; providerId: number; label: string;
  smtpHost: string | null; smtpPort: number | null; smtpUser: string | null;
  apiKey: string | null; smtpPass: string | null; isActive: number;
  lastError: string | null; degradedAt: string | null;
}
interface Mapping {
  id: number; domain: string; primaryAccountId: number; fallbackAccountId: number | null;
}

const PROVIDER_LOGOS: Record<string, string> = {
  resend:    "https://avatars.githubusercontent.com/u/87849025",
  sendgrid:  "https://sendgrid.com/favicon.ico",
  postmark:  "https://postmarkapp.com/favicon.ico",
  ses:       "https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico",
  mailtrap:  "https://mailtrap.io/favicon.ico",
  mandrill:  "https://mailchimp.com/favicon.ico",
  zohomail:  "https://www.zoho.com/favicon.ico",
};

// ── Toast helper ──────────────────────────────────────────────────────────────
function useToast() {
  const [msgs, setMsgs] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  function toast(text: string, ok = true) {
    const id = Date.now();
    setMsgs((m) => [...m, { id, text, ok }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 4000);
  }
  const Toasts = () => (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {msgs.map((m) => (
        <div key={m.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${m.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
  return { toast, Toasts };
}

// ── Input / Button primitives ─────────────────────────────────────────────────
function Inp({ className = "", ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={`w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] focus:border-[hsl(var(--primary))] transition ${className}`}
    />
  );
}
function Btn({ children, variant = "primary", size = "md", className = "", ...p }: {
  children: React.ReactNode; variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "icon"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 font-medium transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";
  const v = {
    primary: "bg-[hsl(var(--primary))] text-black hover:bg-[hsl(142,70%,40%)]",
    ghost:   "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
    outline: "border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
    danger:  "text-red-400 hover:bg-red-500/10",
  }[variant];
  const s = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", icon: "p-2" }[size];
  return <button {...p} className={`${base} ${v} ${s} ${className}`}>{children}</button>;
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AddModal({ provider, onClose, user, toast }: {
  provider: Provider; onClose: () => void; user: User;
  toast: (t: string, ok?: boolean) => void;
}) {
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };
  const [apiKey, setApiKey]   = useState("");
  const [label, setLabel]     = useState("");
  const [smtpHost, setHost]   = useState(provider.smtpHost ?? "");
  const [smtpPort, setPort]   = useState(String(provider.smtpPort ?? 587));
  const [smtpUser, setUser_]  = useState("");
  const [smtpPass, setPass]   = useState("");
  const [fetching, setFetch]  = useState(false);

  const addMut = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/smtp/accounts", body, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/smtp/accounts", user.id] }); toast("Account added"); onClose(); },
    onError: (e: Error) => toast(e.message, false),
  });

  async function fetchCreds() {
    if (!apiKey.trim()) return;
    setFetch(true);
    try {
      const r = await apiRequest("POST", `/api/smtp/providers/${provider.slug}/fetch`, { apiKey }, h);
      const d = await r.json() as { smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string };
      if (d.smtpHost) setHost(d.smtpHost);
      if (d.smtpPort) setPort(String(d.smtpPort));
      if (d.smtpUser) setUser_(d.smtpUser);
      if (d.smtpPass) setPass(d.smtpPass);
      toast("Credentials auto-filled ✓");
    } catch (e: unknown) { toast((e as Error).message, false); }
    finally { setFetch(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Add {provider.name} Account</h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Label</label>
            <Inp data-testid="input-account-label" placeholder="My account" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {provider.hasApiFetch === 1 && (
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">API Key</label>
              <div className="flex gap-2">
                <Inp data-testid="input-api-key" type="password" placeholder="sk-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="flex-1" />
                <Btn variant="outline" size="sm" onClick={fetchCreds} disabled={fetching || !apiKey} data-testid="button-fetch-creds" title="Auto-fill SMTP credentials">
                  {fetching ? "…" : <Zap size={14} />}
                </Btn>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">⚡ auto-fills SMTP fields</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">SMTP Host</label>
              <Inp data-testid="input-smtp-host" value={smtpHost} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Port</label>
              <Inp data-testid="input-smtp-port" value={smtpPort} onChange={(e) => setPort(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Username</label>
            <Inp data-testid="input-smtp-user" value={smtpUser} onChange={(e) => setUser_(e.target.value)} placeholder="apikey or email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Password / Token</label>
            <Inp data-testid="input-smtp-pass" type="password" value={smtpPass} onChange={(e) => setPass(e.target.value)} />
          </div>
          {provider.docsUrl && (
            <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline">
              <ExternalLink size={12} />View {provider.name} Docs
            </a>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => addMut.mutate({ providerId: provider.id, label, apiKey: apiKey || undefined, smtpHost: smtpHost || undefined, smtpPort: smtpPort ? parseInt(smtpPort) : undefined, smtpUser: smtpUser || undefined, smtpPass: smtpPass || undefined })} disabled={addMut.isPending || !label} data-testid="button-save-account">
            {addMut.isPending ? "Saving…" : "Save Account"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SmtpProviders({ user }: { user: User }) {
  const { toast, Toasts } = useToast();
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };
  const [selProvider, setSelProvider] = useState<Provider | null>(null);
  const [mapDomain, setMapDomain]     = useState("");
  const [mapPrimary, setMapPrimary]   = useState("");
  const [mapFallback, setMapFallback] = useState("");

  const { data: pd } = useQuery<{ providers: Provider[] }>({
    queryKey: ["/api/smtp/providers"],
    queryFn:  () => fetch("/api/smtp/providers").then((r) => r.json()),
  });
  const { data: ad } = useQuery<{ accounts: Account[] }>({
    queryKey: ["/api/smtp/accounts", user.id],
    queryFn:  () => fetch("/api/smtp/accounts", { headers: h }).then((r) => r.json()),
  });
  const { data: md } = useQuery<{ mappings: Mapping[] }>({
    queryKey: ["/api/smtp/mappings", user.id],
    queryFn:  () => fetch("/api/smtp/mappings", { headers: h }).then((r) => r.json()),
  });
  const { data: rd } = useQuery<{ stats: { ok: number; failed: number; fallback: number } }>({
    queryKey: ["/api/smtp/relay/stats", user.id],
    queryFn:  () => fetch("/api/smtp/relay/stats", { headers: h }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const providers = pd?.providers ?? [];
  const accounts  = ad?.accounts  ?? [];
  const mappings  = md?.mappings  ?? [];
  const stats     = rd?.stats ?? { ok: 0, failed: 0, fallback: 0 };

  const delAcct = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/smtp/accounts/${id}`, undefined, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/smtp/accounts", user.id] }); toast("Deleted"); },
    onError: (e: Error) => toast(e.message, false),
  });
  const testAcct = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("POST", `/api/smtp/accounts/${id}/test`, {}, h); return r.json() as Promise<{ ok: boolean; message: string }>; },
    onSuccess: (d) => d.ok ? toast("Connection OK ✓") : toast(d.message, false),
    onError: (e: Error) => toast(e.message, false),
  });
  const addMap = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/smtp/mappings", body, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/smtp/mappings", user.id] }); setMapDomain(""); setMapPrimary(""); setMapFallback(""); toast("Mapping saved"); },
    onError: (e: Error) => toast(e.message, false),
  });
  const delMap = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/smtp/mappings/${id}`, undefined, h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/smtp/mappings", user.id] }),
    onError: (e: Error) => toast(e.message, false),
  });

  const acctById = (id: number) => accounts.find((a) => a.id === id);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <Toasts />
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">SMTP Providers</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Connect email accounts and map domains to the relay multiplexer.</p>
      </div>

      {/* Relay stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Delivered", val: stats.ok,       cls: "text-green-400" },
          { label: "Fallback",  val: stats.fallback, cls: "text-yellow-400" },
          { label: "Failed",    val: stats.failed,   cls: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.cls}`} data-testid={`stat-relay-${s.label.toLowerCase()}`}>{s.val.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Provider tiles */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1">Choose a Provider</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-4">Click any tile to add an account</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {providers.map((p) => {
            const logo = PROVIDER_LOGOS[p.slug];
            return (
              <div
                key={p.id}
                onClick={() => setSelProvider(p)}
                data-testid={`card-provider-${p.slug}`}
                className="flex items-center gap-2.5 p-3 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent)/0.15)] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] rounded-lg cursor-pointer transition"
              >
                {logo ? (
                  <img src={logo} alt={p.name} className="w-6 h-6 rounded object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: p.color ?? "#6366f1" }}>{p.name[0]}</div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[hsl(var(--foreground))] truncate">{p.name}</p>
                  {p.hasApiFetch === 1 && <span className="text-[10px] text-[hsl(var(--primary))]">Auto</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accounts */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">Your Accounts ({accounts.length})</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-6">No accounts yet — click a provider tile above</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["Provider","Label","Host","User","Status",""].map((h_) => (
                    <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] pb-2 pr-4">{h_}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} data-testid={`row-account-${a.id}`} className="border-b border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.3)]">
                    <td className="py-2.5 pr-4 font-medium text-[hsl(var(--foreground))]">
                      {providers.find((p) => p.id === a.providerId)?.name ?? `#${a.providerId}`}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--foreground))]">{a.label}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--muted-foreground))] font-mono text-xs">{a.smtpHost ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--muted-foreground))] text-xs">{a.smtpUser ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      {a.degradedAt
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-400 border border-red-500/30">Degraded</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-400 border border-green-500/30">Active</span>}
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1 justify-end">
                        <Btn variant="ghost" size="icon" onClick={() => testAcct.mutate(a.id)} disabled={testAcct.isPending} data-testid={`button-test-account-${a.id}`} title="Test connection">
                          <TestTube size={14} />
                        </Btn>
                        <Btn variant="danger" size="icon" onClick={() => delAcct.mutate(a.id)} data-testid={`button-delete-account-${a.id}`}>
                          <Trash2 size={14} />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Domain Mappings */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Domain → Relay Mappings</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">The SMTP relay (127.0.0.1:2525) routes by sender domain using these mappings.</p>
        </div>

        {/* Add form */}
        <div className="flex flex-wrap gap-3 items-end p-4 bg-[hsl(var(--muted)/0.5)] rounded-lg">
          <div className="min-w-[160px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Domain</label>
            <Inp data-testid="input-map-domain" placeholder="example.com" value={mapDomain} onChange={(e) => setMapDomain(e.target.value)} />
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Primary Account</label>
            <select
              data-testid="select-map-primary"
              value={mapPrimary}
              onChange={(e) => setMapPrimary(e.target.value)}
              className="w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)]"
            >
              <option value="">Select…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Fallback (optional)</label>
            <select
              data-testid="select-map-fallback"
              value={mapFallback}
              onChange={(e) => setMapFallback(e.target.value)}
              className="w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)]"
            >
              <option value="">None</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <Btn
            onClick={() => {
              if (!mapDomain || !mapPrimary) return;
              addMap.mutate({ domain: mapDomain.trim(), primaryAccountId: parseInt(mapPrimary), fallbackAccountId: mapFallback ? parseInt(mapFallback) : undefined });
            }}
            disabled={addMap.isPending || !mapDomain || !mapPrimary}
            data-testid="button-add-mapping"
          >
            <Plus size={14} />Add Mapping
          </Btn>
        </div>

        {mappings.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">No mappings yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["Domain","Primary Account","Fallback",""].map((h_) => (
                    <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] pb-2 pr-4">{h_}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} data-testid={`row-mapping-${m.id}`} className="border-b border-[hsl(var(--border)/0.5)]">
                    <td className="py-2.5 pr-4 font-mono text-xs text-[hsl(var(--foreground))]">{m.domain}</td>
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-1.5 text-[hsl(var(--foreground))]">
                        <ArrowRight size={12} className="text-[hsl(var(--muted-foreground))]" />
                        {acctById(m.primaryAccountId)?.label ?? `#${m.primaryAccountId}`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--muted-foreground))] text-xs">
                      {m.fallbackAccountId ? acctById(m.fallbackAccountId)?.label ?? `#${m.fallbackAccountId}` : "—"}
                    </td>
                    <td className="py-2.5">
                      <Btn variant="danger" size="icon" onClick={() => delMap.mutate(m.id)} data-testid={`button-delete-mapping-${m.id}`}>
                        <Trash2 size={14} />
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selProvider && (
        <AddModal provider={selProvider} onClose={() => setSelProvider(null)} user={user} toast={toast} />
      )}
    </div>
  );
}
