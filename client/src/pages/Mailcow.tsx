import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, Server, CheckCircle, XCircle, RefreshCw, Key, Globe, Inbox, Wand2, X, Zap } from "lucide-react";

interface MCfg { id: number; baseUrl: string; relayConfigured: number; }
interface MCDomain { domain_name: string; active: number; aliases_in_domain?: number; mboxes_in_domain?: number; }
interface Mailbox { username: string; name: string; active: number; quota_used_in_bytes: number; quota: number; domain?: string; }
interface Dkim { dkim_txt?: string; dkim_selector?: string; dkim_public_key?: string; }

function useToast() {
  const [msgs, setMsgs] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  function toast(text: string, ok = true) {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, text, ok }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 5000);
  }
  const Toasts = () => (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {msgs.map((m) => (
        <div key={m.id} className={`max-w-sm px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl border ${m.ok ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white"}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
  return { toast, Toasts };
}

function Inp({ className = "", ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] focus:border-[hsl(var(--primary))] transition ${className}`} />;
}
function Btn({ children, variant = "primary", className = "", ...p }: {
  children: React.ReactNode; variant?: "primary" | "ghost" | "outline" | "danger"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-[hsl(var(--primary))] text-black hover:opacity-90",
    ghost:   "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
    outline: "border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
    danger:  "text-red-400 hover:bg-red-500/10",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`}>{children}</button>;
}
function Modal({ title, open, onClose, children, maxW = "max-w-md" }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className={`w-full ${maxW} bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MailcowPage({ user }: { user: User }) {
  const { toast, Toasts } = useToast();
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };

  const [tab,         setTab]         = useState<"domains" | "mailboxes">("domains");
  const [showCfg,     setShowCfg]     = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [cfgUrl,      setCfgUrl]      = useState("");
  const [cfgKey,      setCfgKey]      = useState("");
  const [showDom,     setShowDom]     = useState(false);
  const [newDom,      setNewDom]      = useState("");
  const [showMb,      setShowMb]      = useState(false);
  const [mbDom,       setMbDom]       = useState("");
  const [mbUser,      setMbUser]      = useState("");
  const [mbName,      setMbName]      = useState("");
  const [mbPass,      setMbPass]      = useState("");
  const [mbQuota,     setMbQuota]     = useState("1024");
  const [showPwdAll,  setShowPwdAll]  = useState(false);
  const [bulkPwd,     setBulkPwd]     = useState("");
  const [showSync,    setShowSync]    = useState(false);
  const [syncSpf,     setSyncSpf]     = useState("");
  const [syncDmarc,   setSyncDmarc]   = useState("");
  const [dkimDomain,  setDkimDomain]  = useState<string | null>(null);
  const [dkimData,    setDkimData]    = useState<Dkim | null>(null);
  const [domFilter,   setDomFilter]   = useState("");

  const { data: cfgData, isLoading: cfgLoading } = useQuery<{ config: MCfg | null }>({
    queryKey: ["/api/mailcow/config", user.id],
    queryFn:  () => fetch("/api/mailcow/config", { headers: h }).then((r) => r.json()),
  });
  const config = cfgData?.config ?? null;

  const { data: domsData, refetch: refDoms, isFetching: domsFetching } = useQuery<{ domains: MCDomain[] }>({
    queryKey: ["/api/mailcow/domains", user.id],
    queryFn:  () => fetch("/api/mailcow/domains", { headers: h }).then((r) => r.json()),
    enabled:  !!config,
  });
  const { data: mbData, refetch: refMbs, isFetching: mbFetching } = useQuery<{ mailboxes: Mailbox[] }>({
    queryKey: ["/api/mailcow/mailboxes", user.id],
    queryFn:  () => fetch("/api/mailcow/mailboxes", { headers: h }).then((r) => r.json()),
    enabled:  !!config,
  });

  const allDomains  = domsData?.domains   ?? [];
  const allMailboxes = mbData?.mailboxes  ?? [];
  const domains  = domFilter ? allDomains.filter((d) => d.domain_name.includes(domFilter)) : allDomains;
  const mailboxes = domFilter ? allMailboxes.filter((m) => m.username.includes(domFilter) || m.domain?.includes(domFilter)) : allMailboxes;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveCfg = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/mailcow/config", { baseUrl: cfgUrl.trim(), apiKey: cfgKey.trim() }, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mailcow/config", user.id] }); toast("Mailcow connected ✓"); setShowCfg(false); },
    onError: (e: Error) => toast(e.message, false),
  });
  const addDom = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailcow/domains", { domain: newDom.trim(), active: 1, restart_sogo: 1 }, h),
    onSuccess: () => { refDoms(); toast(`Domain ${newDom} added`); setShowDom(false); setNewDom(""); },
    onError: (e: Error) => toast(e.message, false),
  });
  const delDom = useMutation({
    mutationFn: (d: string) => apiRequest("DELETE", `/api/mailcow/domains/${d}`, undefined, h),
    onSuccess: () => { refDoms(); toast("Domain deleted"); },
    onError: (e: Error) => toast(e.message, false),
  });
  const addMb = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailcow/mailboxes", { local_part: mbUser.trim(), domain: mbDom.trim(), name: mbName.trim(), password: mbPass, password2: mbPass, quota: parseInt(mbQuota), active: 1 }, h),
    onSuccess: () => { refMbs(); toast(`Mailbox ${mbUser}@${mbDom} created`); setShowMb(false); setMbUser(""); setMbName(""); setMbPass(""); setMbDom(""); },
    onError: (e: Error) => toast(e.message, false),
  });
  const delMb = useMutation({
    mutationFn: (email: string) => apiRequest("DELETE", `/api/mailcow/mailboxes/${email}`, undefined, h),
    onSuccess: () => { refMbs(); toast("Mailbox deleted"); },
    onError: (e: Error) => toast(e.message, false),
  });
  const configRelay = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailcow/relay/configure", {}, h),
    onSuccess: async (r) => { const d = await r.json() as { message?: string }; qc.invalidateQueries({ queryKey: ["/api/mailcow/config", user.id] }); toast(d.message ?? "Relay configured ✓"); },
    onError: (e: Error) => toast(e.message, false),
  });
  const bulkPwdMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailcow/mailboxes/set-password", { password: bulkPwd }, h),
    onSuccess: async (r) => {
      const d = await r.json() as { updated: number; total: number; errors: string[] };
      toast(`Updated ${d.updated}/${d.total} mailboxes ✓`);
      if (d.errors.length) toast(`${d.errors.length} errors — check console`, false);
      setShowPwdAll(false); setBulkPwd("");
    },
    onError: (e: Error) => toast(e.message, false),
  });
  const syncDnsMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mailcow/sync-dns", {
      spfIncludes: syncSpf.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
      dmarcEmail:  syncDmarc.trim() || undefined,
    }, h),
    onSuccess: async (r) => {
      const d = await r.json() as { domains: number; records: number };
      toast(`DNS synced — ${d.domains} domains, ${d.records} records saved ✓`);
      setShowSync(false);
    },
    onError: (e: Error) => toast(e.message, false),
  });

  async function autoAssignSmtp() {
    setAutoAssigning(true);
    try {
      const domains = allDomains.map((d) => d.domain_name).filter(Boolean);
      if (domains.length === 0) { toast("No Mailcow domains found — add domains first", false); return; }
      const r = await apiRequest("POST", "/api/smtp/mappings/auto-assign", { domains }, h);
      const data = await r.json() as { assigned: number; skipped: number; message: string };
      toast(data.message);
    } catch (e: unknown) {
      toast((e as Error).message || "Auto-assign failed", false);
    } finally {
      setAutoAssigning(false);
    }
  }

  async function viewDkim(domain: string) {
    try {
      const r = await fetch(`/api/mailcow/dkim/${domain}`, { headers: h });
      setDkimDomain(domain);
      setDkimData(await r.json() as Dkim);
    } catch { toast("Could not fetch DKIM", false); }
  }
  async function genDkim(domain: string) {
    try {
      await apiRequest("POST", "/api/mailcow/dkim", { domain, dkim_selector: "dkim", key_size: 2048 }, h);
      toast("DKIM key generated ✓");
      await viewDkim(domain);
    } catch (e: unknown) { toast((e as Error).message, false); }
  }

  if (cfgLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Toasts />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Mailcow</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Manage domains, mailboxes, DKIM, and relay configuration.</p>
        </div>
        <Btn variant="outline" onClick={() => setShowCfg(true)} data-testid="button-configure-mailcow">
          <Server size={14} />{config ? "Reconfigure" : "Connect Mailcow"}
        </Btn>
      </div>

      {/* Connection status */}
      {config ? (
        <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Connected to Mailcow</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{config.baseUrl}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.relayConfigured ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">Relay Active → :2525 ✓</span>
            ) : (
              <Btn onClick={() => configRelay.mutate()} disabled={configRelay.isPending} data-testid="button-configure-relay" className="text-xs px-3 py-1.5">
                {configRelay.isPending ? <><span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />Configuring…</> : "→ Set Relay :2525"}
              </Btn>
            )}
            <Btn variant="outline" className="text-xs px-3 py-1.5" onClick={() => setShowPwdAll(true)} data-testid="button-set-all-passwords">
              <Key size={12} />Set All Passwords
            </Btn>
            <Btn variant="outline" className="text-xs px-3 py-1.5" onClick={() => setShowSync(true)} data-testid="button-sync-dns">
              <Wand2 size={12} />Sync DNS
            </Btn>
            <Btn variant="outline" className="text-xs px-3 py-1.5" onClick={autoAssignSmtp} disabled={autoAssigning} data-testid="button-auto-assign-smtp">
              {autoAssigning
                ? <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />Assigning…</>
                : <><Zap size={12} />Auto-Assign SMTP</>}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[hsl(var(--border))] rounded-xl gap-3">
          <XCircle size={36} className="text-[hsl(var(--muted-foreground))] opacity-40" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Not connected — click "Connect Mailcow" to start</p>
        </div>
      )}

      {config && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary)/0.15)] flex items-center justify-center">
                <Globe size={18} className="text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))] tabular-nums">{allDomains.length}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Domains</p>
              </div>
            </div>
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary)/0.15)] flex items-center justify-center">
                <Inbox size={18} className="text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--foreground))] tabular-nums">{allMailboxes.length}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Mailboxes</p>
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-[hsl(var(--border))]">
              {(["domains", "mailboxes"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  data-testid={`tab-${t}`}
                  className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${tab === t ? "text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
                >
                  {t === "domains" ? `Domains (${allDomains.length})` : `Mailboxes (${allMailboxes.length})`}
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[hsl(var(--muted)/0.3)] border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2">
                <input
                  placeholder={tab === "domains" ? "Filter domains…" : "Filter mailboxes…"}
                  value={domFilter}
                  onChange={(e) => setDomFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none w-48"
                />
                <button
                  onClick={() => tab === "domains" ? refDoms() : refMbs()}
                  className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={(tab === "domains" ? domsFetching : mbFetching) ? "animate-spin" : ""} />
                </button>
              </div>
              <Btn className="text-xs px-3 py-1.5" onClick={() => tab === "domains" ? setShowDom(true) : setShowMb(true)} data-testid={`button-add-${tab === "domains" ? "domain" : "mailbox"}`}>
                <Plus size={13} />Add {tab === "domains" ? "Domain" : "Mailbox"}
              </Btn>
            </div>

            {/* Domains tab */}
            {tab === "domains" && (
              domains.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-[hsl(var(--muted-foreground))]">
                  <Globe size={28} className="opacity-30" />
                  <p className="text-sm">{domFilter ? "No matching domains" : "No domains yet"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)]">
                        {["Domain","Status","Mailboxes","DKIM",""].map((h_) => (
                          <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] px-4 py-2.5">{h_}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {domains.map((d) => (
                        <tr key={d.domain_name} data-testid={`row-domain-${d.domain_name}`} className="border-t border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.2)] transition-colors">
                          <td className="px-4 py-3 font-mono text-sm text-[hsl(var(--foreground))]">{d.domain_name}</td>
                          <td className="px-4 py-3">
                            {d.active
                              ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/30">Active</span>
                              : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">Inactive</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                            {d.mboxes_in_domain ?? allMailboxes.filter((m) => m.username.endsWith(`@${d.domain_name}`)).length}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => viewDkim(d.domain_name)} data-testid={`button-dkim-${d.domain_name}`}
                              className="px-2 py-1 text-[10px] border border-[hsl(var(--border))] rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-colors font-medium">
                              DKIM
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <Btn variant="danger" className="px-2 py-1.5" onClick={() => { if (confirm(`Delete domain ${d.domain_name}?`)) delDom.mutate(d.domain_name); }} data-testid={`button-delete-domain-${d.domain_name}`}>
                              <Trash2 size={13} />
                            </Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Mailboxes tab */}
            {tab === "mailboxes" && (
              mailboxes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-[hsl(var(--muted-foreground))]">
                  <Inbox size={28} className="opacity-30" />
                  <p className="text-sm">{domFilter ? "No matching mailboxes" : "No mailboxes yet"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)]">
                        {["Email","Name","Quota Used","Status",""].map((h_) => (
                          <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] px-4 py-2.5">{h_}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mailboxes.map((mb) => {
                        const usedMB  = Math.round((mb.quota_used_in_bytes ?? 0) / 1_048_576);
                        const totalMB = mb.quota ?? 0;
                        const pct     = totalMB > 0 ? Math.min(100, Math.round((usedMB / totalMB) * 100)) : 0;
                        return (
                          <tr key={mb.username} data-testid={`row-mailbox-${mb.username}`} className="border-t border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--muted)/0.2)] transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--foreground))]">{mb.username}</td>
                            <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))]">{mb.name}</td>
                            <td className="px-4 py-3 min-w-[140px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                                  <div className="h-full bg-[hsl(var(--primary))] rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] text-[hsl(var(--muted-foreground))] shrink-0">{usedMB}/{totalMB}MB</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {mb.active
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/30">Active</span>
                                : <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">Inactive</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Btn variant="danger" className="px-2 py-1.5" onClick={() => { if (confirm(`Delete mailbox ${mb.username}?`)) delMb.mutate(mb.username); }} data-testid={`button-delete-mailbox-${mb.username}`}>
                                <Trash2 size={13} />
                              </Btn>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Connect Mailcow */}
      <Modal title="Connect Mailcow" open={showCfg} onClose={() => setShowCfg(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Mailcow URL</label>
            <Inp data-testid="input-mailcow-url" placeholder="https://mail.yourdomain.com" value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">API Key</label>
            <Inp data-testid="input-mailcow-key" type="password" placeholder="API key from Mailcow admin → API → Create key" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} />
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Connection will be verified before saving.</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowCfg(false)}>Cancel</Btn>
          <Btn onClick={() => saveCfg.mutate()} disabled={saveCfg.isPending || !cfgUrl || !cfgKey} data-testid="button-save-mailcow">
            {saveCfg.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Connecting…</> : "Connect"}
          </Btn>
        </div>
      </Modal>

      {/* Add Domain */}
      <Modal title="Add Domain" open={showDom} onClose={() => setShowDom(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain Name</label>
            <Inp data-testid="input-new-domain" placeholder="example.com" value={newDom} onChange={(e) => setNewDom(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowDom(false)}>Cancel</Btn>
          <Btn onClick={() => addDom.mutate()} disabled={addDom.isPending || !newDom.trim()} data-testid="button-confirm-add-domain">
            {addDom.isPending ? "Adding…" : "Add Domain"}
          </Btn>
        </div>
      </Modal>

      {/* Add Mailbox */}
      <Modal title="Add Mailbox" open={showMb} onClose={() => setShowMb(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Local Part *</label>
              <Inp data-testid="input-mb-user" placeholder="user" value={mbUser} onChange={(e) => setMbUser(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain *</label>
              <select value={mbDom} onChange={(e) => setMbDom(e.target.value)} data-testid="input-mb-domain"
                className="w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none">
                <option value="">Select…</option>
                {allDomains.map((d) => <option key={d.domain_name} value={d.domain_name}>{d.domain_name}</option>)}
              </select>
            </div>
          </div>
          {mbUser && mbDom && <p className="text-xs text-[hsl(var(--muted-foreground))]">Will create: <code className="font-mono">{mbUser}@{mbDom}</code></p>}
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Display Name</label>
            <Inp data-testid="input-mb-name" value={mbName} onChange={(e) => setMbName(e.target.value)} placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Password * (min 8 chars)</label>
            <Inp data-testid="input-mb-pass" type="password" value={mbPass} onChange={(e) => setMbPass(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Quota (MB)</label>
            <Inp data-testid="input-mb-quota" type="number" value={mbQuota} onChange={(e) => setMbQuota(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowMb(false)}>Cancel</Btn>
          <Btn onClick={() => addMb.mutate()} disabled={addMb.isPending || !mbUser || !mbDom || mbPass.length < 8} data-testid="button-confirm-add-mailbox">
            {addMb.isPending ? "Creating…" : "Create Mailbox"}
          </Btn>
        </div>
      </Modal>

      {/* Bulk set password */}
      <Modal title="Set All Mailbox Passwords" open={showPwdAll} onClose={() => setShowPwdAll(false)}>
        <div className="space-y-3">
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs text-yellow-400">⚠️ This will overwrite the password for all {allMailboxes.length} mailboxes with the same password.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">New Password (min 8 chars)</label>
            <Inp data-testid="input-bulk-password" type="password" value={bulkPwd} onChange={(e) => setBulkPwd(e.target.value)} placeholder="Strong password" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowPwdAll(false)}>Cancel</Btn>
          <Btn onClick={() => bulkPwdMut.mutate()} disabled={bulkPwdMut.isPending || bulkPwd.length < 8} data-testid="button-confirm-set-passwords">
            {bulkPwdMut.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Setting…</> : `Set Password on ${allMailboxes.length} Mailboxes`}
          </Btn>
        </div>
      </Modal>

      {/* Sync DNS */}
      <Modal title="Sync DNS from Mailcow" open={showSync} onClose={() => setShowSync(false)}>
        <div className="space-y-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Pulls DKIM for every domain from Mailcow, then generates SPF + DKIM + DMARC records and saves them to DNS Manager.</p>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">SPF Includes <span className="text-[hsl(var(--muted-foreground))]">(space or comma separated)</span></label>
            <Inp data-testid="input-sync-spf" placeholder="spf.resend.com spf.sendinblue.com" value={syncSpf} onChange={(e) => setSyncSpf(e.target.value)} />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Example: <code className="font-mono">spf.resend.com spf.sendinblue.com mailgun.org</code></p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DMARC Report Email <span className="text-[hsl(var(--muted-foreground))]">(optional)</span></label>
            <Inp data-testid="input-sync-dmarc" type="email" placeholder="postmaster@yourdomain.com" value={syncDmarc} onChange={(e) => setSyncDmarc(e.target.value)} />
          </div>
          <div className="p-3 bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.3)] rounded-lg">
            <p className="text-xs text-[hsl(var(--primary))]">Will generate records for {allDomains.length} domain{allDomains.length !== 1 ? "s" : ""}. Go to DNS Manager afterward to push to Hostinger.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowSync(false)}>Cancel</Btn>
          <Btn onClick={() => syncDnsMut.mutate()} disabled={syncDnsMut.isPending} data-testid="button-confirm-sync-dns">
            {syncDnsMut.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Syncing…</> : "Sync DNS Records"}
          </Btn>
        </div>
      </Modal>

      {/* DKIM */}
      <Modal title={`DKIM — ${dkimDomain}`} open={!!dkimDomain} onClose={() => { setDkimDomain(null); setDkimData(null); }}>
        {dkimData?.dkim_txt && dkimData.dkim_txt !== "none" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">TXT Record Value</label>
              <pre className="text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-[hsl(var(--foreground))] max-h-40">
                {dkimData.dkim_txt}
              </pre>
            </div>
            <div className="p-3 bg-[hsl(var(--muted))] rounded-lg">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Add this as a TXT record for:</p>
              <code className="text-xs font-mono text-[hsl(var(--foreground))]">{dkimData.dkim_selector ?? "dkim"}._domainkey.{dkimDomain}</code>
            </div>
            {dkimData.dkim_public_key && (
              <div>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Public Key</label>
                <pre className="text-[10px] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-[hsl(var(--muted-foreground))] max-h-24">
                  {dkimData.dkim_public_key}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No DKIM key found for this domain yet.</p>
            <Btn onClick={() => dkimDomain && genDkim(dkimDomain)} data-testid="button-generate-dkim">
              <Key size={13} />Generate 2048-bit DKIM Key
            </Btn>
          </div>
        )}
        <div className="flex justify-end mt-5">
          <Btn variant="outline" onClick={() => { setDkimDomain(null); setDkimData(null); }}>Close</Btn>
        </div>
      </Modal>
    </div>
  );
}
