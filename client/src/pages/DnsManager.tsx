import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, CheckCircle, Clock, Globe, Wand2, Upload, X, Copy, ExternalLink } from "lucide-react";

interface DnsRecord {
  id: number; domain: string; recordType: string;
  name: string; value: string; ttl: number | null;
  provider: string | null; verifiedAt: string | null;
}

const TYPES = ["TXT", "MX", "CNAME", "A", "AAAA"];
const LS_KEY = "lf_hostinger_token";

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
function Sel({ children, className = "", ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...p} className={`px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] ${className}`}>
      {children}
    </select>
  );
}
function Modal({ title, open, onClose, children, maxW = "max-w-lg" }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string }) {
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

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TXT:   "bg-purple-500/15 text-purple-400 border-purple-500/30",
    MX:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
    CNAME: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    A:     "bg-green-500/15 text-green-400 border-green-500/30",
    AAAA:  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${colors[type] ?? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]"}`}>
      {type}
    </span>
  );
}

export default function DnsManager({ user }: { user: User }) {
  const { toast, Toasts } = useToast();
  const qc = useQueryClient();
  const h  = { "x-user-id": String(user.id) };

  const [filterDomain, setFilter] = useState("_all");
  const [recDomain, setRDom]  = useState("");
  const [recType,   setRType] = useState("TXT");
  const [recName,   setRName] = useState("");
  const [recValue,  setRVal]  = useState("");
  const [recTtl,    setRTtl]  = useState("3600");

  const [showGen,  setShowGen]  = useState(false);
  const [gDom,     setGDom]     = useState("");
  const [gSpf,     setGSpf]     = useState("");
  const [gSel,     setGSel]     = useState("dkim");
  const [gKey,     setGKey]     = useState("");
  const [gDmarc,   setGDmarc]   = useState("");

  const [showHost, setShowHost] = useState(false);
  const [hDom,     setHDom]     = useState("");
  const [hToken,   setHToken]   = useState(() => localStorage.getItem(LS_KEY) ?? "");
  const [saveToken, setSaveToken] = useState(!!localStorage.getItem(LS_KEY));

  const [showExport, setShowExport] = useState(false);
  const [exportDomain, setExportDomain] = useState("_all");

  useEffect(() => {
    if (saveToken && hToken) localStorage.setItem(LS_KEY, hToken);
    else if (!saveToken) localStorage.removeItem(LS_KEY);
  }, [hToken, saveToken]);

  const { data: rd, isLoading } = useQuery<{ records: DnsRecord[] }>({
    queryKey: ["/api/dns/records", user.id],
    queryFn:  () => fetch("/api/dns/records", { headers: h }).then((r) => r.json()),
  });

  const allRecs  = rd?.records ?? [];
  const recs     = filterDomain === "_all" ? allRecs : allRecs.filter((r) => r.domain === filterDomain);
  const domains  = [...new Set(allRecs.map((r) => r.domain))].sort();
  const byDomain = recs.reduce<Record<string, DnsRecord[]>>((acc, r) => { (acc[r.domain] ??= []).push(r); return acc; }, {});

  const addRec = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/dns/records", body, h),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] }); toast("Record added"); setRName(""); setRVal(""); },
    onError: (e: Error) => toast(e.message, false),
  });
  const delRec = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dns/records/${id}`, undefined, h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] }),
    onError: (e: Error) => toast(e.message, false),
  });
  const verify = useMutation({
    mutationFn: async (rec: DnsRecord) => {
      const r = await apiRequest("POST", "/api/dns/verify", { domain: rec.name, recordType: rec.recordType }, h);
      return r.json() as Promise<{ verified: boolean }>;
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] }); d.verified ? toast("Verified ✓") : toast("Not propagated yet — check again in a few minutes", false); },
  });
  const generate = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/dns/generate", body, h),
    onSuccess: async (r) => {
      const d = await r.json() as { records?: unknown[] };
      qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] });
      toast(`Generated ${d.records?.length ?? 0} records ✓`);
      setShowGen(false);
      if (gDom) setFilter(gDom);
    },
    onError: (e: Error) => toast(e.message, false),
  });
  const pushHost = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/dns/push/hostinger", body, h),
    onSuccess: async (r) => {
      const d = await r.json() as { results?: Array<{ record: string; status: string }> };
      const ok  = d.results?.filter((x) => x.status === "ok").length ?? 0;
      const tot = d.results?.length ?? 0;
      toast(`Pushed to Hostinger — ${ok}/${tot} records succeeded ${ok < tot ? "⚠️" : "✓"}`);
      if (ok < tot) {
        const failed = d.results?.filter((x) => x.status !== "ok").map((x) => x.record).join(", ");
        toast(`Failed: ${failed}`, false);
      }
      setShowHost(false);
    },
    onError: (e: Error) => toast(e.message, false),
  });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard ✓")).catch(() => toast("Copy failed", false));
  }

  function exportAsText() {
    const exportRecs = exportDomain === "_all" ? allRecs : allRecs.filter((r) => r.domain === exportDomain);
    const lines = exportRecs.map((r) => `${r.name}\t${r.ttl ?? 3600}\tIN\t${r.recordType}\t${r.value}`).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `dns-records${exportDomain !== "_all" ? `-${exportDomain}` : ""}.txt`;
    a.click(); URL.revokeObjectURL(url);
    toast("Downloaded ✓");
    setShowExport(false);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Toasts />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">DNS Manager</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">SPF · DKIM · DMARC — generate, verify, and push to Hostinger.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="outline" className="text-xs px-3 py-2" onClick={() => setShowGen(true)} data-testid="button-generate-records">
            <Wand2 size={13} />Auto-Generate
          </Btn>
          <Btn variant="outline" className="text-xs px-3 py-2" onClick={() => setShowHost(true)} data-testid="button-push-hostinger">
            <Upload size={13} />Push to Hostinger
          </Btn>
          <Btn variant="outline" className="text-xs px-3 py-2" onClick={() => setShowExport(true)} data-testid="button-export">
            <ExternalLink size={13} />Export
          </Btn>
        </div>
      </div>

      {/* Add record */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">Add Record</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[130px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Domain</label>
            <Inp data-testid="input-rec-domain" placeholder="example.com" value={recDomain} onChange={(e) => setRDom(e.target.value)} />
          </div>
          <div className="w-24">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Type</label>
            <Sel data-testid="select-rec-type" value={recType} onChange={(e) => setRType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Sel>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Name / Host</label>
            <Inp data-testid="input-rec-name" placeholder="@ or subdomain" value={recName} onChange={(e) => setRName(e.target.value)} />
          </div>
          <div className="flex-[2] min-w-[180px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Value</label>
            <Inp data-testid="input-rec-value" placeholder="v=spf1 …" value={recValue} onChange={(e) => setRVal(e.target.value)} />
          </div>
          <div className="w-20">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">TTL</label>
            <Inp data-testid="input-rec-ttl" type="number" value={recTtl} onChange={(e) => setRTtl(e.target.value)} />
          </div>
          <Btn onClick={() => addRec.mutate({ domain: recDomain.trim(), recordType: recType, name: recName.trim(), value: recValue.trim(), ttl: parseInt(recTtl) || 3600 })}
            disabled={addRec.isPending || !recDomain || !recName || !recValue} data-testid="button-add-record">
            <Plus size={14} />Add
          </Btn>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Globe size={15} className="text-[hsl(var(--muted-foreground))]" />
        <Sel data-testid="select-filter-domain" value={filterDomain} onChange={(e) => setFilter(e.target.value)} className="w-56">
          <option value="_all">All domains ({allRecs.length} records)</option>
          {domains.map((d) => <option key={d} value={d}>{d} ({allRecs.filter((r) => r.domain === d).length})</option>)}
        </Sel>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{recs.length} record{recs.length !== 1 ? "s" : ""} shown</span>
      </div>

      {/* Records */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(byDomain).length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 border border-dashed border-[hsl(var(--border))] rounded-xl">
          <Globe size={36} className="text-[hsl(var(--muted-foreground))] opacity-30" />
          <div className="text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No DNS records yet.</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Use "Auto-Generate" or "Sync DNS" from the Mailcow page to populate records automatically.</p>
          </div>
        </div>
      ) : (
        Object.entries(byDomain).map(([domain, domRecs]) => (
          <div key={domain} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-mono font-semibold text-[hsl(var(--foreground))]">{domain}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{domRecs.length} record{domRecs.length !== 1 ? "s" : ""}</span>
                <button
                  onClick={() => { setHDom(domain); setShowHost(true); }}
                  className="px-2 py-1 text-[10px] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] rounded hover:bg-[hsl(var(--primary)/0.08)] transition-colors font-medium"
                >
                  Push to Hostinger
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--muted)/0.3)]">
                    {["Type","Name","Value","TTL","Status",""].map((h_) => (
                      <th key={h_} className="text-left font-medium text-[hsl(var(--muted-foreground))] px-4 py-2">{h_}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domRecs.map((rec) => (
                    <tr key={rec.id} data-testid={`row-dns-${rec.id}`} className="border-t border-[hsl(var(--border)/0.4)] hover:bg-[hsl(var(--muted)/0.2)] transition-colors group">
                      <td className="px-4 py-2.5"><TypeBadge type={rec.recordType} /></td>
                      <td className="px-4 py-2.5 font-mono text-[hsl(var(--foreground))] max-w-[160px]">
                        <div className="flex items-center gap-1 truncate">
                          <span className="truncate">{rec.name}</span>
                          <button onClick={() => copyToClipboard(rec.name)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
                            <Copy size={10} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))] max-w-[220px]">
                        <div className="flex items-center gap-1">
                          <span className="truncate" title={rec.value}>{rec.value}</span>
                          <button onClick={() => copyToClipboard(rec.value)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
                            <Copy size={10} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{rec.ttl ?? 3600}</td>
                      <td className="px-4 py-2.5">
                        {rec.verifiedAt
                          ? <span className="flex items-center gap-1 text-green-400 font-medium"><CheckCircle size={11} />OK</span>
                          : <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><Clock size={11} />Pending</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => verify.mutate(rec)}
                            disabled={verify.isPending}
                            data-testid={`button-verify-${rec.id}`}
                            className="px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded hover:border-[hsl(var(--primary))] transition-colors font-medium"
                          >
                            Verify
                          </button>
                          <Btn variant="danger" className="px-1.5 py-1" onClick={() => delRec.mutate(rec.id)} data-testid={`button-delete-dns-${rec.id}`}>
                            <Trash2 size={11} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Auto-generate modal */}
      <Modal title="Auto-Generate DNS Records" open={showGen} onClose={() => setShowGen(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain *</label>
            <Inp data-testid="input-gen-domain" placeholder="example.com" value={gDom} onChange={(e) => setGDom(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">SPF Include</label>
            <Inp data-testid="input-gen-spf" placeholder="spf.resend.com" value={gSpf} onChange={(e) => setGSpf(e.target.value)} />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">e.g. <code className="font-mono">spf.resend.com</code> or <code className="font-mono">spf.sendinblue.com</code></p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DKIM Selector</label>
              <Inp data-testid="input-gen-dkim-sel" value={gSel} onChange={(e) => setGSel(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DMARC Email</label>
              <Inp data-testid="input-gen-dmarc" type="email" placeholder="postmaster@…" value={gDmarc} onChange={(e) => setGDmarc(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DKIM Public Key <span className="text-[hsl(var(--muted-foreground))]">(from Mailcow DKIM panel)</span></label>
            <Inp data-testid="input-gen-dkim-key" placeholder="MIIBIjANBgkq…" value={gKey} onChange={(e) => setGKey(e.target.value)} />
          </div>
          <div className="p-3 bg-[hsl(var(--muted)/0.5)] rounded-lg text-xs text-[hsl(var(--muted-foreground))]">
            Generates: SPF TXT · DKIM TXT · DMARC TXT. Use <strong>Sync DNS</strong> on Mailcow page to do this for all domains at once.
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowGen(false)}>Cancel</Btn>
          <Btn onClick={() => generate.mutate({ domain: gDom.trim(), spfInclude: gSpf.trim() || undefined, dkimSelector: gSel.trim(), dkimPublicKey: gKey.trim() || undefined, dmarcEmail: gDmarc.trim() || undefined })}
            disabled={generate.isPending || !gDom} data-testid="button-confirm-generate">
            {generate.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Generating…</> : "Generate Records"}
          </Btn>
        </div>
      </Modal>

      {/* Hostinger push modal */}
      <Modal title="Push DNS to Hostinger" open={showHost} onClose={() => setShowHost(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain *</label>
            <Sel data-testid="select-hostinger-domain" value={hDom} onChange={(e) => setHDom(e.target.value)} className="w-full">
              <option value="">Select domain…</option>
              {domains.map((d) => <option key={d} value={d}>{d} ({allRecs.filter((r) => r.domain === d).length} records)</option>)}
            </Sel>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
              Hostinger API Token
              <a href="https://hpanel.hostinger.com/api" target="_blank" rel="noopener noreferrer" className="ml-2 text-[hsl(var(--primary))] hover:underline text-[10px]">
                Get token ↗
              </a>
            </label>
            <Inp data-testid="input-hostinger-token" type="password" placeholder="Bearer token from Hostinger API panel" value={hToken} onChange={(e) => setHToken(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={saveToken} onChange={(e) => setSaveToken(e.target.checked)} className="rounded" />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Remember token in browser (localStorage)</span>
          </label>
          {hDom && (
            <div className="p-3 bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.3)] rounded-lg">
              <p className="text-xs text-[hsl(var(--primary))]">Will push {allRecs.filter((r) => r.domain === hDom).length} records for <strong>{hDom}</strong> to Hostinger DNS.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowHost(false)}>Cancel</Btn>
          <Btn onClick={() => pushHost.mutate({ domain: hDom, apiToken: hToken })}
            disabled={pushHost.isPending || !hDom || !hToken} data-testid="button-confirm-push-hostinger">
            {pushHost.isPending ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Pushing…</> : "Push to Hostinger"}
          </Btn>
        </div>
      </Modal>

      {/* Export modal */}
      <Modal title="Export DNS Records" open={showExport} onClose={() => setShowExport(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain</label>
            <Sel value={exportDomain} onChange={(e) => setExportDomain(e.target.value)} className="w-full">
              <option value="_all">All domains</option>
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </Sel>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Downloads as a zone-file style .txt — one record per line in BIND format.</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowExport(false)}>Cancel</Btn>
          <Btn onClick={exportAsText} data-testid="button-confirm-export">
            <ExternalLink size={13} />Download .txt
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
