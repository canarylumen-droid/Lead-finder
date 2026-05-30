import { useState, useMemo } from "react";
import type { User } from "../App";

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: string | null;
  reviews: string | null;
  email: string | null;
  query: string;
  url: string;
}

interface Props {
  user: User;
  onLogout: () => void;
}

// Mock data so the table looks real before wiring
const MOCK_LEADS: Lead[] = [
  { id: 1, name: "Top Hat Roofing", phone: "(305) 555-0142", website: "https://tophatroofing.com", address: "Miami, FL 33101", rating: "4.9", reviews: "91", email: "info@tophatroofing.com", query: "Roofing Contractor in Miami, FL", url: "https://maps.google.com/..." },
  { id: 2, name: "Pioneer Roofing Co.", phone: "(954) 555-0188", website: "https://pioneerroofing.com", address: "Fort Lauderdale, FL 33301", rating: "4.5", reviews: "97", email: "pioneer@pioneerroofingcompany.com", query: "Roofing Contractor in Miami, FL", url: "https://maps.google.com/..." },
  { id: 3, name: "Smart Renovation", phone: null, website: "https://smartrenovation.ae", address: "Dubai, UAE", rating: "4.8", reviews: "57", email: "info@smartrenovation.ae", query: "Home Remodeling in Dubai UAE", url: "https://maps.google.com/..." },
  { id: 4, name: "Haifa RENOV8", phone: "(971) 555-0199", website: "https://haifarenov8.ae", address: "Dubai, UAE", rating: "4.9", reviews: "64", email: "info@haifagroups.com", query: "Home Remodeling in Dubai UAE", url: "https://maps.google.com/..." },
  { id: 5, name: "Atlas HVAC Service", phone: "(312) 555-0167", website: "https://atlashvac.com", address: "Chicago, IL 60601", rating: "4.7", reviews: "143", email: null, query: "HVAC Repair in Chicago, IL", url: "https://maps.google.com/..." },
  { id: 6, name: "BlueSky Pest Control", phone: "(206) 555-0134", website: null, address: "Seattle, WA 98101", rating: "4.3", reviews: "28", email: "bluesky@pestcontrol.com", query: "Pest Control in Washington", url: "https://maps.google.com/..." },
  { id: 7, name: "SunState Solar", phone: "(602) 555-0177", website: "https://sunstatesolar.com", address: "Phoenix, AZ 85001", rating: "4.6", reviews: "212", email: "sales@sunstatesolar.com", query: "Solar Company in Phoenix, AZ", url: "https://maps.google.com/..." },
  { id: 8, name: "FloodBusters Restoration", phone: "(214) 555-0155", website: "https://floodbusters.com", address: "Dallas, TX 75201", rating: "5.0", reviews: "38", email: "info@floodbusters.com", query: "Water Damage Restoration in Dallas, TX", url: "https://maps.google.com/..." },
];

type Tab = "leads" | "scrape" | "jobs";

export default function Dashboard({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("leads");
  const [search, setSearch] = useState("");
  const [filterEmail, setFilterEmail] = useState(false);
  const [leads] = useState<Lead[]>(MOCK_LEADS);

  // Scrape form state (not wired yet)
  const [scrapeKeywords, setScrapeKeywords] = useState("");
  const [scrapeLocations, setScrapeLocations] = useState("");
  const [scrapeTarget, setScrapeTarget] = useState("500");

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchSearch =
        !search ||
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        (l.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.address ?? "").toLowerCase().includes(search.toLowerCase()) ||
        l.query.toLowerCase().includes(search.toLowerCase());
      const matchEmail = !filterEmail || !!l.email;
      return matchSearch && matchEmail;
    });
  }, [leads, search, filterEmail]);

  const stats = useMemo(() => ({
    total: leads.length,
    withEmails: leads.filter((l) => l.email).length,
    withWebsite: leads.filter((l) => l.website).length,
    avgRating: (
      leads.reduce((sum, l) => sum + parseFloat(l.rating ?? "0"), 0) / leads.length
    ).toFixed(1),
  }), [leads]);

  function downloadCSV() {
    const headers = ["Name", "Phone", "Website", "Address", "Rating", "Reviews", "Email", "Query", "Maps URL"];
    const rows = filtered.map((l) => [
      `"${l.name}"`,
      `"${l.phone ?? ""}"`,
      `"${l.website ?? ""}"`,
      `"${l.address ?? ""}"`,
      `"${l.rating ?? ""}"`,
      `"${l.reviews ?? ""}"`,
      `"${l.email ?? ""}"`,
      `"${l.query}"`,
      `"${l.url}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-white text-lg">LeadGen Pro</span>
        </div>

        <nav className="flex items-center gap-1">
          {(["leads", "scrape", "jobs"] as Tab[]).map((t) => (
            <button
              key={t}
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
                tab === t
                  ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-[hsl(var(--muted))]"
              }`}
            >
              {t === "leads" ? "My Leads" : t === "scrape" ? "New Scrape" : "Jobs"}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{user.email}</span>
          <button
            data-testid="button-logout"
            onClick={onLogout}
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-[hsl(var(--muted))]"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Leads", value: stats.total, icon: "👥", color: "blue" },
            { label: "With Email", value: stats.withEmails, icon: "📧", color: "green" },
            { label: "With Website", value: stats.withWebsite, icon: "🌐", color: "purple" },
            { label: "Avg Rating", value: stats.avgRating + " ★", icon: "⭐", color: "yellow" },
          ].map((s) => (
            <div
              key={s.label}
              data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4"
            >
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Leads Tab */}
        {tab === "leads" && (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
            {/* Table Toolbar */}
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[hsl(var(--border))]">
              <input
                data-testid="input-search"
                type="text"
                placeholder="Search name, email, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3.5 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition"
              />
              <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] cursor-pointer select-none">
                <input
                  data-testid="checkbox-filter-email"
                  type="checkbox"
                  checked={filterEmail}
                  onChange={(e) => setFilterEmail(e.target.checked)}
                  className="accent-[hsl(var(--primary))]"
                />
                Emails only
              </label>
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {filtered.length} leads
              </span>
              <button
                data-testid="button-download-csv"
                onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] text-sm font-semibold rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                    {["Business Name", "Phone", "Email", "Rating", "Reviews", "Website", "Address", "Query"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-[hsl(var(--muted-foreground))]">
                        No leads found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((lead) => (
                      <tr
                        key={lead.id}
                        data-testid={`row-lead-${lead.id}`}
                        className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.4)] transition"
                      >
                        <td className="px-4 py-3">
                          <a
                            href={lead.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-white hover:text-[hsl(var(--primary))] transition"
                          >
                            {lead.name}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {lead.phone ?? <span className="text-[hsl(var(--border))]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {lead.email ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] rounded text-xs font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {lead.email}
                            </span>
                          ) : (
                            <span className="text-[hsl(var(--border))]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {lead.rating ? (
                            <span className="text-yellow-400 font-medium">★ {lead.rating}</span>
                          ) : (
                            <span className="text-[hsl(var(--border))]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                          {lead.reviews ?? <span className="text-[hsl(var(--border))]">—</span>}
                        </td>
                        <td className="px-4 py-3 max-w-[160px] truncate">
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline text-xs"
                            >
                              {lead.website.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            <span className="text-[hsl(var(--border))]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs max-w-[160px] truncate">
                          {lead.address ?? <span className="text-[hsl(var(--border))]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs max-w-[180px] truncate">
                          {lead.query}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* New Scrape Tab */}
        {tab === "scrape" && (
          <div className="max-w-2xl">
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-1">New Scrape Job</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
                Runs 500 concurrent browser instances on the server — scrapes Google Maps and finds emails from business websites.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Niches / Keywords
                  </label>
                  <textarea
                    data-testid="input-keywords"
                    value={scrapeKeywords}
                    onChange={(e) => setScrapeKeywords(e.target.value)}
                    rows={4}
                    placeholder={"Roofing Contractor\nHVAC Service\nMedSpa Clinic\nWater Damage Restoration"}
                    className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition resize-none font-mono"
                  />
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">One niche per line</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Locations
                  </label>
                  <textarea
                    data-testid="input-locations"
                    value={scrapeLocations}
                    onChange={(e) => setScrapeLocations(e.target.value)}
                    rows={4}
                    placeholder={"Miami, FL\nDallas, TX\nHouston, TX\nDubai, UAE"}
                    className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition resize-none font-mono"
                  />
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">One location per line</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Target Leads
                  </label>
                  <div className="flex gap-2">
                    {["500", "1000", "5000", "50000"].map((n) => (
                      <button
                        key={n}
                        data-testid={`target-${n}`}
                        onClick={() => setScrapeTarget(n)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          scrapeTarget === n
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                            : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-white border border-[hsl(var(--border))]"
                        }`}
                      >
                        {parseInt(n).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info box */}
                <div className="flex items-start gap-3 bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.2)] rounded-lg px-4 py-3">
                  <svg className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                    <span className="text-white font-medium">500 concurrent browsers</span> — runs on Railway/AWS, not your machine.
                    Leads save to your Neon PostgreSQL account in real-time as they're scraped.
                    Scraping {parseInt(scrapeTarget).toLocaleString()} leads takes ~
                    {scrapeTarget === "500" ? "5 min" : scrapeTarget === "1000" ? "10 min" : scrapeTarget === "5000" ? "45 min" : "~1 hour"}.
                  </div>
                </div>

                <button
                  data-testid="button-start-scrape"
                  disabled
                  className="w-full py-3 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold rounded-lg text-sm opacity-40 cursor-not-allowed"
                >
                  🚀 Start Scrape — Backend coming soon
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Jobs Tab */}
        {tab === "jobs" && (
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Scrape Jobs</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
              Live job progress and logs — each job runs in the cloud and saves leads to your account.
            </p>

            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-[hsl(var(--muted-foreground))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-[hsl(var(--muted-foreground))] text-sm">No jobs yet</p>
              <p className="text-[hsl(var(--muted-foreground)/0.6)] text-xs mt-1">Start a scrape to see real-time progress here</p>
            </div>

            {/* Future: job cards with progress bars, logs, cancel button */}
          </div>
        )}
      </main>
    </div>
  );
}
