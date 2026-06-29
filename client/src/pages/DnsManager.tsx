import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../App";
import { apiRequest } from "../lib/queryClient";
import { Plus, Trash2, CheckCircle, Clock, Globe, Wand2, Upload, X } from "lucide-react";

interface DnsRecord {
  id: number; domain: string; recordType: string;
  name: string; value: string; ttl: number | null;
  provider: string | null; verifiedAt: string | null;
}

const TYPES = ["TXT", "MX", "CNAME", "A", "AAAA"];

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
    danger:  "p-1.5 text-red-400 hover:bg-red-500/10 rounded",
  }[variant];
  return <button {...p} className={`${base} ${v} ${className}`}>{children}</button>;
}
function Sel({ children, className = "", ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...p} className={`px-3 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] ${className}`}>
      {children}
    </select>
  );
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

  const [showGen, setShowGen] = useState(false);
  const [gDom,    setGDom]    = useState("");
  const [gSpf,    setGSpf]    = useState("");
  const [gSel,    setGSel]    = useState("dkim");
  const [gKey,    setGKey]    = useState("");
  const [gDmarc,  setGDmarc]  = useState("");

  const [showHost, setShowHost] = useState(false);
  const [hDom,     setHDom]    = useState("");
  const [hToken,   setHToken]  = useState("");

  const { data: rd, isLoading } = useQuery<{ records: DnsRecord[] }>({
    queryKey: ["/api/dns/records", user.id],
    queryFn:  () => fetch("/api/dns/records", { headers: h }).then((r) => r.json()),
  });

  const allRecs = rd?.records ?? [];
  const recs    = filterDomain === "_all" ? allRecs : allRecs.filter((r) => r.domain === filterDomain);
  const domains = [...new Set(allRecs.map((r) => r.domain))];

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
    mutationFn: async ({ domain, recordType }: { domain: string; recordType: string }) => {
      const r = await apiRequest("POST", "/api/dns/verify", { domain, recordType }, h);
      return r.json() as Promise<{ verified: boolean }>;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] });
      d.verified ? toast("Verified ✓") : toast("Not propagated yet — try later", false);
    },
  });
  const generate = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/dns/generate", body, h),
    onSuccess: async (r) => {
      const d = await r.json() as { records?: unknown[] };
      qc.invalidateQueries({ queryKey: ["/api/dns/records", user.id] });
      toast(`Generated ${d.records?.length ?? 0} records`);
      setShowGen(false);
      if (gDom) setFilter(gDom);
    },
    onError: (e: Error) => toast(e.message, false),
  });
  const pushHost = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/dns/push/hostinger", body, h),
    onSuccess: async (r) => {
      const d = await r.json() as { results?: Array<{ status: string }> };
      const ok = d.results?.filter((x) => x.status === "ok").length ?? 0;
      toast(`Pushed — ${ok}/${d.results?.length ?? 0} succeeded`);
      setShowHost(false);
    },
    onError: (e: Error) => toast(e.message, false),
  });

  const byDomain = recs.reduce<Record<string, DnsRecord[]>>((acc, r) => {
    (acc[r.domain] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <Toasts />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">DNS Manager</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">Manage SPF, DKIM, DMARC and other DNS records.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" onClick={() => setShowGen(true)} data-testid="button-generate-records">
            <Wand2 size={14} />Auto-Generate
          </Btn>
          <Btn variant="outline" onClick={() => setShowHost(true)} data-testid="button-push-hostinger">
            <Upload size={14} />Push to Hostinger
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
            <Inp data-testid="input-rec-name" placeholder="@" value={recName} onChange={(e) => setRName(e.target.value)} />
          </div>
          <div className="flex-[2] min-w-[180px]">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">Value</label>
            <Inp data-testid="input-rec-value" placeholder="v=spf1 …" value={recValue} onChange={(e) => setRVal(e.target.value)} />
          </div>
          <div className="w-20">
            <label className="block text-xs text-[hsl(var(--muted-foreground))] mb-1">TTL</label>
            <Inp data-testid="input-rec-ttl" type="number" value={recTtl} onChange={(e) => setRTtl(e.target.value)} />
          </div>
          <Btn
            onClick={() => addRec.mutate({ domain: recDomain.trim(), recordType: recType, name: recName.trim(), value: recValue.trim(), ttl: parseInt(recTtl) || 3600 })}
            disabled={addRec.isPending || !recDomain || !recName || !recValue}
            data-testid="button-add-record"
          >
            <Plus size={14} />Add
          </Btn>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Globe size={16} className="text-[hsl(var(--muted-foreground))]" />
        <Sel data-testid="select-filter-domain" value={filterDomain} onChange={(e) => setFilter(e.target.value)} className="w-64">
          <option value="_all">All domains</option>
          {domains.map((d) => <option key={d} value={d}>{d}</option>)}
        </Sel>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{recs.length} record{recs.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Records */}
      {isLoading ? (
        <div className="text-center py-10 text-[hsl(var(--muted-foreground))]">
          <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : Object.keys(byDomain).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-[hsl(var(--border))] rounded-xl gap-3">
          <Globe size={32} className="text-[hsl(var(--muted-foreground))] opacity-40" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No DNS records yet. Add one above or use Auto-Generate.</p>
        </div>
      ) : (
        Object.entries(byDomain).map(([domain, domRecs]) => (
          <div key={domain} className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-mono font-semibold text-[hsl(var(--foreground))]">{domain}</h2>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{domRecs.length} record{domRecs.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {["Type","Name","Value","TTL","Status",""].map((h_) => (
                      <th key={h_} className="text-left font-medium text-[hsl(var(--muted-foreground))] pb-2 pr-3">{h_}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {domRecs.map((rec) => (
                    <tr key={rec.id} data-testid={`row-dns-${rec.id}`} className="border-b border-[hsl(var(--border)/0.4)] hover:bg-[hsl(var(--muted)/0.3)]">
                      <td className="py-2 pr-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">{rec.recordType}</span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[hsl(var(--foreground))] max-w-[140px] truncate">{rec.name}</td>
                      <td className="py-2 pr-3 text-[hsl(var(--muted-foreground))] max-w-[200px] truncate" title={rec.value}>{rec.value}</td>
                      <td className="py-2 pr-3 text-[hsl(var(--muted-foreground))]">{rec.ttl ?? 3600}</td>
                      <td className="py-2 pr-3">
                        {rec.verifiedAt
                          ? <span className="flex items-center gap-1 text-green-400"><CheckCircle size={11} />OK</span>
                          : <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><Clock size={11} />Pending</span>}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => verify.mutate({ domain: rec.name, recordType: rec.recordType })}
                            disabled={verify.isPending}
                            data-testid={`button-verify-${rec.id}`}
                            className="px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded transition"
                          >
                            Verify
                          </button>
                          <Btn variant="danger" onClick={() => delRec.mutate(rec.id)} data-testid={`button-delete-dns-${rec.id}`}>
                            <Trash2 size={12} />
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
            <Inp data-testid="input-gen-domain" placeholder="example.com" value={gDom} onChange={(e) => setGDom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">SPF Include</label>
            <Inp data-testid="input-gen-spf" placeholder="spf.resend.com" value={gSpf} onChange={(e) => setGSpf(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DKIM Selector</label>
              <Inp data-testid="input-gen-dkim-sel" value={gSel} onChange={(e) => setGSel(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DMARC Email</label>
              <Inp data-testid="input-gen-dmarc" placeholder="postmaster@…" value={gDmarc} onChange={(e) => setGDmarc(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">DKIM Public Key (optional)</label>
            <Inp data-testid="input-gen-dkim-key" placeholder="MIIBIjANBgkq…" value={gKey} onChange={(e) => setGKey(e.target.value)} />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">From your Mailcow DKIM panel</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowGen(false)}>Cancel</Btn>
          <Btn
            onClick={() => generate.mutate({ domain: gDom.trim(), spfInclude: gSpf.trim() || undefined, dkimSelector: gSel.trim(), dkimPublicKey: gKey.trim() || undefined, dmarcEmail: gDmarc.trim() || undefined })}
            disabled={generate.isPending || !gDom}
            data-testid="button-confirm-generate"
          >
            {generate.isPending ? "Generating…" : "Generate Records"}
          </Btn>
        </div>
      </Modal>

      {/* Hostinger push modal */}
      <Modal title="Push DNS to Hostinger" open={showHost} onClose={() => setShowHost(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Domain</label>
            <Sel data-testid="select-hostinger-domain" value={hDom} onChange={(e) => setHDom(e.target.value)} className="w-full">
              <option value="">Select domain…</option>
              {domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </Sel>
          </div>
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Hostinger API Token</label>
            <Inp data-testid="input-hostinger-token" type="password" placeholder="Bearer token from Hostinger" value={hToken} onChange={(e) => setHToken(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={() => setShowHost(false)}>Cancel</Btn>
          <Btn
            onClick={() => pushHost.mutate({ domain: hDom, apiToken: hToken })}
            disabled={pushHost.isPending || !hDom || !hToken}
            data-testid="button-confirm-push-hostinger"
          >
            {pushHost.isPending ? "Pushing…" : "Push Records"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
