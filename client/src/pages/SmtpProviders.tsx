import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, TestTube, Zap, ExternalLink, ArrowRight, X, Pencil, Mail } from "lucide-react";

interface Provider {
  id: number; slug: string; name: string; logoUrl: string | null;
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

// Clearbit logos take priority — official hi-res brand logos
const CLEARBIT: Record<string, string> = {
  resend:         "https://logo.clearbit.com/resend.com",
  brevo:          "https://logo.clearbit.com/brevo.com",
  mailgun:        "https://logo.clearbit.com/mailgun.com",
  sendgrid:       "https://logo.clearbit.com/sendgrid.com",
  postmark:       "https://logo.clearbit.com/postmarkapp.com",
  sparkpost:      "https://logo.clearbit.com/sparkpost.com",
  "amazon-ses":   "https://logo.clearbit.com/amazonaws.com",
  mailjet:        "https://logo.clearbit.com/mailjet.com",
  "elastic-email":"https://logo.clearbit.com/elasticemail.com",
  smtp2go:        "https://logo.clearbit.com/smtp2go.com",
  mailtrap:       "https://logo.clearbit.com/mailtrap.io",
  cloudmailin:    "https://logo.clearbit.com/cloudmailin.com",
  mandrill:       "https://logo.clearbit.com/mailchimp.com",
  zoho:           "https://logo.clearbit.com/zoho.com",
  "smtp-com":     "https://logo.clearbit.com/smtp.com",
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [msgs, setMsgs] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  function toast(text: string, ok = true) {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, text, ok }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 4000);
  }
  const Toasts = () => (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {msgs.map((m) => (
        <div key={m.id} className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl border ${m.ok ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white"}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
  return { toast, Toasts };
}

// ── Primitives ────────────────────────────────────────────────────────────────
function Inp({ className = "", ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] focus:border-[hsl(var(--primary))] transition ${className}`} />;
}
function Btn({ children, variant = "primary", className = "", ...p }: {
  children: React.ReactNode; variant?: "primary" | "ghost" | "outline" | "danger"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-[hsl(var(--primary))] text-black hover:opacity-90",
    ghost:   "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
    outline: "border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
    danger:  "text-red-400 hover:bg-red-500/10",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`}>{children}</button>;
}

// ── Account Modal (Add or Edit) ───────────────────────────────────────────────
interface AccountModalProps {
  provider: Provider | null;
  editAccount?: Account | null;
  onClose: () => void;
  user: User;
  toast: (t: string, ok?: boolean) => void;
}
function AccountModal({ provider, editAccount, onClose, user, toast }: AccountModalProps) {
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };
  const isEdit = !!editAccount;

  const [apiKey,   setApiKey]  = useState(editAccount?.apiKey  ?? "");
  const [label,    setLabel]   = useState(editAccount?.label   ?? "");
  const [smtpHost, setHost]    = useState(editAccount?.smtpHost ?? provider?.smtpHost ?? "");
  const [smtpPort, setPort]    = useState(String(editAccount?.smtpPort ?? provider?.smtpPort ?? 587));
  const [smtpUser, setUser_]   = useState(editAccount?.smtpUser ?? "");
  const [smtpPass, setPass]    = useState("");
  const [fetching, setFetch]   = useState(false);

  const hasApiFetch = provider?.hasApiFetch === 1;

  const mut = useMutation({
    mutationFn: (body: object) => isEdit
      ? apiRequest("PATCH", `/api/smtp/accounts/${editAccount!.id}`, body, h)
      : apiRequest("POST",  "/api/smtp/accounts", body, h),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/smtp/accounts", user.id] });
      toast(isEdit ? "Account updated" : "Account added");
      onClose();
    },
    onError: (e: Error) => toast(e.message, false),
  });

  async function fetchCreds() {
    if (!apiKey.trim() || !provider) return;
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

  function submit() {
    if (!label.trim()) return;
    const body: Record<string, unknown> = { label, smtpHost: smtpHost || undefined, smtpPort: smtpPort ? parseInt(smtpPort) : undefined, smtpUser: smtpUser || undefined };
    if (!isEdit) body.providerId = provider!.id;
    if (apiKey && apiKey !== "••••••••") body.apiKey = apiKey;
    if (smtpPass && smtpPass !== "••••••••") body.smtpPass = smtpPass;
    mut.mutate(body);
  }

  const title = isEdit ? `Edit ${label}` : `Add ${provider?.name ?? ""} Account`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {provider && (
              <img
                src={CLEARBIT[provider.slug] ?? provider.logoUrl ?? ""}
                alt={provider.name}
                className="w-7 h-7 rounded object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h2>
          </div>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Label *</label>
            <Inp data-testid="input-account-label" placeholder="e.g. Resend Production" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {hasApiFetch && (
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">API Key</label>
              <div className="flex gap-2">
                <Inp data-testid="input-api-key" type="password" placeholder="sk-… / your API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="flex-1" />
                <Btn variant="outline" className="shrink-0 px-2.5" onClick={fetchCreds} disabled={fetching || !apiKey.trim()} data-testid="button-fetch-creds" title="Auto-fill SMTP credentials from API key">
                  {fetching ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Zap size={14} />}
                </Btn>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">⚡ Click lightning to auto-fill SMTP fields</p>
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
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">SMTP Username</label>
            <Inp data-testid="input-smtp-user" value={smtpUser} onChange={(e) => setUser_(e.target.value)} placeholder="apikey or email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Password / Token {isEdit && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">(leave blank to keep current)</span>}</label>
            <Inp data-testid="input-smtp-pass" type="password" value={smtpPass} onChange={(e) => setPass(e.target.value)} placeholder={isEdit ? "Leave blank to keep current" : "••••••••"} />
          </div>
          {provider?.docsUrl && (
            <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline mt-1">
              <ExternalLink size={11} />View {provider.name} Docs
            </a>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={mut.isPending || !label.trim()} data-testid="button-save-account">
            {mut.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Saving…</> : isEdit ? "Save Changes" : "Add Account"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Provider Logo ─────────────────────────────────────────────────────────────
function ProviderLogo({ provider, size = 28 }: { provider: Provider; size?: number }) {
  const src = CLEARBIT[provider.slug] ?? provider.logoUrl ?? "";
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className="flex items-center justify-center rounded text-white text-[11px] font-bold shrink-0"
        style={{ width: size, height: size, backgroundColor: provider.color ?? "#6366f1" }}>
        {provider.name[0]}
      </div>
    );
  }
  return (
    <img src={src} alt={provider.name} style={{ width: size, height: size }}
      className="rounded object-contain shrink-0"
      onError={() => setErr(true)} />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SmtpProviders({ user }: { user: User }) {
  const { toast, Toasts } = useToast();
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };

  const [selProvider, setSelProvider] = useState<Provider | null>(null);
  const [editAcct,    setEditAcct]    = useState<Account | null>(null);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [mapDomain,   setMapDomain]   = useState("");
  const [mapPrimary,  setMapPrimary]  = useState("");
  const [mapFallback, setMapFallback] = useState("");
  const [provSearch,  setProvSearch]  = useState("");

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
  const filtered  = provSearch ? providers.filter((p) => p.name.toLowerCase().includes(provSearch.toLowerCase())) : providers;

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

  const providerById = (id: number) => providers.find((p) => p.id === id);
  const acctById     = (id: number) => accounts.find((a) => a.id === id);

  function openEdit(acct: Account) {
    setEditAcct(acct);
    setEditProvider(providerById(acct.providerId) ?? null);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Toasts />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">SMTP Providers</h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Connect transactional email accounts and map domains to the relay multiplexer.</p>
      </div>

      {/* Relay stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Delivered", val: stats.ok,       cls: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
          { label: "Fallback",  val: stats.fallback, cls: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          { label: "Failed",    val: stats.failed,   cls: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
        ].map((s) => (
          <div key={s.label} className={`border rounded-xl p-4 ${s.bg}`}>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Relay — {s.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls}`} data-testid={`stat-relay-${s.label.toLowerCase()}`}>{s.val.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Provider tiles */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Choose a Provider</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Click to add an account</p>
          </div>
          <input
            placeholder="Search providers…"
            value={provSearch}
            onChange={(e) => setProvSearch(e.target.value)}
            className="px-3 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none w-44"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelProvider(p)}
              data-testid={`card-provider-${p.slug}`}
              className="group flex items-center gap-2.5 p-3 bg-[hsl(var(--muted)/0.5)] hover:bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] rounded-xl cursor-pointer transition-all"
            >
              <ProviderLogo provider={p} size={26} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[hsl(var(--foreground))] truncate">{p.name}</p>
                {p.hasApiFetch === 1 && <span className="text-[10px] text-[hsl(var(--primary))] font-medium">Auto-fill</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accounts table */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Connected Accounts</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{accounts.length} account{accounts.length !== 1 ? "s" : ""} across {providers.length} providers</p>
          </div>
        </div>
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[hsl(var(--muted-foreground))]">
            <Mail size={28} className="opacity-30" />
            <p className="text-sm">No accounts yet — click a provider tile above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(var(--muted)/0.4)]">
                  {["Provider","Label","SMTP Host","Port","Username","Status",""].map((h_) => (
                    <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] px-4 py-2.5">{h_}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const prov = providerById(a.providerId);
                  return (
                    <tr key={a.id} data-testid={`row-account-${a.id}`} className="border-t border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.2)] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {prov && <ProviderLogo provider={prov} size={20} />}
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{prov?.name ?? `#${a.providerId}`}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">{a.label}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{a.smtpHost ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{a.smtpPort ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] max-w-[140px] truncate">{a.smtpUser ?? "—"}</td>
                      <td className="px-4 py-3">
                        {a.degradedAt
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 font-medium">Degraded</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 font-medium">Active</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Btn variant="ghost" className="px-2 py-1.5" onClick={() => openEdit(a)} data-testid={`button-edit-account-${a.id}`} title="Edit">
                            <Pencil size={13} />
                          </Btn>
                          <Btn variant="ghost" className="px-2 py-1.5" onClick={() => testAcct.mutate(a.id)} disabled={testAcct.isPending} data-testid={`button-test-account-${a.id}`} title="Test connection">
                            <TestTube size={13} />
                          </Btn>
                          <Btn variant="danger" className="px-2 py-1.5" onClick={() => { if (confirm("Delete this account?")) delAcct.mutate(a.id); }} data-testid={`button-delete-account-${a.id}`}>
                            <Trash2 size={13} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Domain → Relay Mappings */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Domain → Relay Mappings</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">The multiplexer (127.0.0.1:2525) routes each sender domain to the mapped SMTP account.</p>
        </div>
        {/* Add form */}
        <div className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[150px]">
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Sender Domain</label>
              <Inp data-testid="input-map-domain" placeholder="example.com" value={mapDomain} onChange={(e) => setMapDomain(e.target.value)} />
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Primary Account</label>
              <select data-testid="select-map-primary" value={mapPrimary} onChange={(e) => setMapPrimary(e.target.value)}
                className="w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]">
                <option value="">Select account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Fallback Account</label>
              <select data-testid="select-map-fallback" value={mapFallback} onChange={(e) => setMapFallback(e.target.value)}
                className="w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]">
                <option value="">None</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <Btn onClick={() => { if (!mapDomain || !mapPrimary) return; addMap.mutate({ domain: mapDomain.trim(), primaryAccountId: parseInt(mapPrimary), fallbackAccountId: mapFallback ? parseInt(mapFallback) : undefined }); }}
              disabled={addMap.isPending || !mapDomain || !mapPrimary} data-testid="button-add-mapping">
              <Plus size={14} />Add Mapping
            </Btn>
          </div>
        </div>
        {mappings.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-6">No mappings yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--muted)/0.4)]">
                {["Domain","Primary Account","Fallback",""].map((h_) => (
                  <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] px-4 py-2.5">{h_}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const primary  = acctById(m.primaryAccountId);
                const fallback = m.fallbackAccountId ? acctById(m.fallbackAccountId) : null;
                const pProv    = primary  ? providerById(primary.providerId)  : null;
                const fProv    = fallback ? providerById(fallback.providerId) : null;
                return (
                  <tr key={m.id} data-testid={`row-mapping-${m.id}`} className="border-t border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.2)]">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-[hsl(var(--foreground))]">{m.domain}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ArrowRight size={12} className="text-[hsl(var(--primary))]" />
                        {pProv && <ProviderLogo provider={pProv} size={16} />}
                        <span className="text-xs text-[hsl(var(--foreground))]">{primary?.label ?? `#${m.primaryAccountId}`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {fallback ? (
                        <div className="flex items-center gap-2">
                          {fProv && <ProviderLogo provider={fProv} size={16} />}
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{fallback.label}</span>
                        </div>
                      ) : <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Btn variant="danger" className="px-2 py-1.5" onClick={() => delMap.mutate(m.id)} data-testid={`button-delete-mapping-${m.id}`}>
                        <Trash2 size={13} />
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {selProvider && (
        <AccountModal provider={selProvider} onClose={() => setSelProvider(null)} user={user} toast={toast} />
      )}
      {editAcct && (
        <AccountModal provider={editProvider} editAccount={editAcct} onClose={() => { setEditAcct(null); setEditProvider(null); }} user={user} toast={toast} />
      )}
    </div>
  );
}
