import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, Server, CheckCircle, XCircle, ArrowRight, X } from "lucide-react";

interface MCfg { id: number; baseUrl: string; relayConfigured: number; }
interface MCDomain { domain_name: string; active: number; }
interface Mailbox { username: string; name: string; active: number; quota_used_in_bytes: number; quota: number; }
interface Dkim { dkim_txt?: string; dkim_selector?: string; }

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
        <div key={m.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${m.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>{m.text}</div>
      ))}
    </div>
  );
  return { toast, Toasts };
}

function Inp({ className = "", ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...p} className={`w-full px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] focus:border-[hsl(var(--primary))] transition ${className}`} />
  );
}
function Btn({ children, variant = "primary", className = "", ...p }: {
  children: React.ReactNode; variant?: "primary" | "ghost" | "outline" | "danger"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed";
  const v = {
    primary: "bg-[hsl(var(--primary))] text-black hover:bg-[hsl(142,70%,40%)]",
    ghost:   "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
    outline: "border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
    danger:  "p-2 text-red-400 hover:bg-red-500/10 rounded-lg",
  }[variant];
  return <button {...p} className={`${base} ${v} ${className}`}>{children}</button>;
}
function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
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

  const [showCfg, setShowCfg]     = useState(false);
  const [cfgUrl, setCfgUrl]       = useState("");
  const [cfgKey, setCfgKey]       = useState("");
  const [showDom, setShowDom]     = useState(false);
  const [newDom, setNewDom]       = useState("");
  const [showMb, setShowMb]       = useState(false);
  const [mbDom, setMbDom]         = useState("");
  const [mbUser, setMbUser]       = useState("");
  const [mbName, setMbName]       = useState("");
  const [mbPass, setMbPass]       = useState("");
  const [mbQuota, setMbQuota]     = useState("1024");
  const [dkimDomain, setDkimDomain] = useState<string | null>(null);
  const [dkimData,   setDkimData]   = useState<Dkim | null>(null);

  const { data: cfgData, isLoading: cfgLoading } = useQuery<{ config: MCfg | null }>({
    queryKey: ["/api/mailcow/config", user.id],
    queryFn:  () => fetch("/api/mailcow/config", { headers: h }).then((r) => r.json()),
  });
  const config = cfgData?.config ?? null;

  const { data: domsData, refetch: refDoms } = useQuery<{ domains: MCDomain[] }>({
    queryKey: ["/api/mailcow/domains", user.id],
    queryFn:  () => fetch("/api/mailcow/domains", { headers: h }).then((r) => r.json()),
    enabled:  !!config,
  });
  const { data: mbData, refetch: refMbs } = useQuery<{ mailboxes: Mailbox[] }>({
    queryKey: ["/api/mailcow/mailboxes", user.id],
    queryFn:  () => fetch("/api/mailcow/mailboxes", { headers: h }).then((r) => r.json()),
    enabled:  !!config,
  });

  const domains   = domsData?.domains   ?? [];
  const mailboxes = mbData?.mailboxes   ?? [];

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
    onSuccess: async (r) => { const d = await r.json() as { message?: string }; qc.invalidateQueries({ queryKey: ["/api/mailcow/config", user.id] }); toast(d.message ?? "Relay configured"); },
    onError: (e: Error) => toast(e.message, false),
  });

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
      toast("DKIM generated");
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
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <Toasts />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Mailcow</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Manage domains, mailboxes, and relay configuration.</p>
        </div>
        <Btn variant="outline" onClick={() => setShowCfg(true)} data-testid="button-configure-mailcow">
          <Server size={15} />{config ? "Reconfigure" : "Connect Mailcow"}
        </Btn>
      </div>

      {/* Status card */}
      {config ? (
        <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle size={18} className="text-green-400" />
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Connected to Mailcow</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{config.baseUrl}</p>
            </div>
          </div>
          {config.relayConfigured ? (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">Relay Active ✓</span>
          ) : (
            <Btn onClick={() => configRelay.mutate()} disabled={configRelay.isPending} data-testid="button-configure-relay">
              <ArrowRight size={14} />{configRelay.isPending ? "Configuring…" : "Configure Relay → :2525"}
            </Btn>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[hsl(var(--border))] rounded-xl gap-3">
          <XCircle size={32} className="text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Not connected — click "Connect Mailcow" to start</p>
        </div>
      )}

      {config && (
        <>
          {/* Domains */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Domains ({domains.length})</h2>
              </div>
              <Btn size="sm" onClick={() => setShowDom(true)} data-testid="button-add-domain">
                <Plus size={14} />Add Domain
              </Btn>
            </div>
            {domains.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">No domains yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {["Domain","Status","Actions"].map((h_) => (
                      <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] pb-2 pr-4">{h_}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domains.map((d) => (
                    <tr key={d.domain_name} data-testid={`row-domain-${d.domain_name}`} className="border-b border-[hsl(var(--border)/0.5)]">
                      <td className="py-2.5 pr-4 font-mono text-[hsl(var(--foreground))]">{d.domain_name}</td>
                      <td className="py-2.5 pr-4">
                        {d.active
                          ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-400 border border-green-500/30">Active</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">Inactive</span>}
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
                          <Btn variant="outline" className="text-xs px-2 py-1 text-sm" onClick={() => viewDkim(d.domain_name)} data-testid={`button-dkim-${d.domain_name}`}>DKIM</Btn>
                          <Btn variant="danger" onClick={() => delDom.mutate(d.domain_name)} data-testid={`button-delete-domain-${d.domain_name}`}>
                            <Trash2 size={14} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mailboxes */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Mailboxes ({mailboxes.length})</h2>
              <Btn size="sm" onClick={() => setShowMb(true)} data-testid="button-add-mailbox">
                <Plus size={14} />Add Mailbox
              </Btn>
            </div>
            {mailboxes.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">No mailboxes yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      {["Email","Name","Quota","Status",""].map((h_) => (
                        <th key={h_} className="text-left text-xs font-medium text-[hsl(var(--muted-foreground))] pb-2 pr-4">{h_}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mailboxes.map((mb) => (
                      <tr key={mb.username} data-testid={`row-mailbox-${mb.username}`} className="border-b border-[hsl(var(--border)/0.5)]">
                        <td className="py-2.5 pr-4 font-mono text-xs text-[hsl(var(--foreground))]">{mb.username}</td>
                        <td className="py-2.5 pr-4 text-[hsl(var(--foreground))]">{mb.name}</td>
                        <td className="py-2.5 pr-4 text-xs text-[hsl(var(--muted-foreground))]">
                          {Math.round((mb.quota_used_in_bytes ?? 0) / 1_048_576)}/{mb.quota ?? 0} MB
                        </td>
                        <td className="py-2.5 pr-4">
                          {mb.active
                            ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-400 border border-green-500/30">Active</span>
                            : <span className="px-2 py-0.5 rounded-full text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">Inactive</span>}
                        </td>
                        <td className="py-2.5">
                          <Btn variant="danger" onClick={() => delMb.mutate(mb.username)} data-testid={`button-delete-mailbox-${mb.username}`}>
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
        </>
      )}

      {/* Config modal */}
      <Modal title="Connect Mailcow" open={showCfg} onClose={() => setShowCfg(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Mailcow URL</label>
            <Inp data-testid="input-mailcow-url" placeholder="https://mail.yourdomain.com" value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">API Key</label>
            <Inp data-testid="input-mailcow-key" type="password" placeholder="API key from Mailcow admin" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowCfg(false)}>Cancel</Btn>
          <Btn onClick={() => saveCfg.mutate()} disabled={saveCfg.isPending || !cfgUrl || !cfgKey} data-testid="button-save-mailcow">
            {saveCfg.isPending ? "Connecting…" : "Connect"}
          </Btn>
        </div>
      </Modal>

      {/* Add domain modal */}
      <Modal title="Add Domain" open={showDom} onClose={() => setShowDom(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain Name</label>
            <Inp data-testid="input-new-domain" placeholder="example.com" value={newDom} onChange={(e) => setNewDom(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowDom(false)}>Cancel</Btn>
          <Btn onClick={() => addDom.mutate()} disabled={addDom.isPending || !newDom} data-testid="button-confirm-add-domain">
            {addDom.isPending ? "Adding…" : "Add Domain"}
          </Btn>
        </div>
      </Modal>

      {/* Add mailbox modal */}
      <Modal title="Add Mailbox" open={showMb} onClose={() => setShowMb(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Local Part</label>
              <Inp data-testid="input-mb-user" placeholder="user" value={mbUser} onChange={(e) => setMbUser(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain</label>
              <Inp data-testid="input-mb-domain" placeholder="example.com" value={mbDom} onChange={(e) => setMbDom(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Display Name</label>
            <Inp data-testid="input-mb-name" value={mbName} onChange={(e) => setMbName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Password</label>
            <Inp data-testid="input-mb-pass" type="password" value={mbPass} onChange={(e) => setMbPass(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Quota (MB)</label>
            <Inp data-testid="input-mb-quota" type="number" value={mbQuota} onChange={(e) => setMbQuota(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowMb(false)}>Cancel</Btn>
          <Btn onClick={() => addMb.mutate()} disabled={addMb.isPending || !mbUser || !mbDom || !mbPass} data-testid="button-confirm-add-mailbox">
            {addMb.isPending ? "Creating…" : "Create Mailbox"}
          </Btn>
        </div>
      </Modal>

      {/* DKIM modal */}
      <Modal title={`DKIM — ${dkimDomain}`} open={!!dkimDomain} onClose={() => { setDkimDomain(null); setDkimData(null); }}>
        {dkimData?.dkim_txt ? (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">TXT Record Value</label>
            <pre className="text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-[hsl(var(--foreground))]">
              {dkimData.dkim_txt}
            </pre>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Add as TXT for <code className="font-mono">{dkimData.dkim_selector ?? "dkim"}._domainkey.{dkimDomain}</code>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No DKIM key found for this domain.</p>
            <Btn onClick={() => dkimDomain && genDkim(dkimDomain)} data-testid="button-generate-dkim">
              Generate 2048-bit DKIM Key
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
