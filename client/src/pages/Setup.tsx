import { useState, useRef } from "react";
import type { User } from "../App";

interface Props {
  user: User;
  onLaunched: () => void;
  onLogout: () => void;
  onGoToDashboard: () => void;
}

const COUNTRIES = [
  "USA", "Canada", "UK", "Australia", "UAE",
  "India", "Germany", "France", "Netherlands", "Singapore",
];

const COUNTRY_CITIES: Record<string, string[]> = {
  USA: ["New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "Dallas, TX", "San Diego, CA", "Austin, TX", "Jacksonville, FL", "Miami, FL", "Denver, CO", "Nashville, TN", "Atlanta, GA", "Seattle, WA", "Las Vegas, NV", "Orlando, FL", "Charlotte, NC", "Boston, MA"],
  Canada: ["Toronto, ON", "Vancouver, BC", "Montreal, QC", "Calgary, AB", "Ottawa, ON", "Edmonton, AB", "Winnipeg, MB", "Hamilton, ON", "Quebec City, QC", "Halifax, NS"],
  UK: ["London", "Birmingham", "Manchester", "Leeds", "Glasgow", "Sheffield", "Bradford", "Edinburgh", "Liverpool", "Bristol", "Cardiff", "Leicester", "Nottingham", "Coventry"],
  Australia: ["Sydney, NSW", "Melbourne, VIC", "Brisbane, QLD", "Perth, WA", "Adelaide, SA", "Gold Coast, QLD", "Newcastle, NSW", "Canberra, ACT", "Wollongong, NSW", "Hobart, TAS"],
  UAE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah"],
  India: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Surat", "Jaipur"],
  Germany: ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", "Dortmund", "Essen", "Leipzig"],
  France: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille"],
  Netherlands: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven", "Groningen", "Tilburg", "Almere"],
  Singapore: ["Singapore"],
};

const PLATFORMS = [
  { id: "google-maps", label: "Google Maps", active: true, icon: "🗺️" },
  { id: "linkedin", label: "LinkedIn", active: false, icon: "💼" },
  { id: "instagram", label: "Instagram", active: false, icon: "📸" },
  { id: "twitter", label: "Twitter / X", active: false, icon: "𝕏" },
];

export default function Setup({ user, onLaunched, onLogout, onGoToDashboard }: Props) {
  const [niches, setNiches] = useState<string[]>([]);
  const [nicheInput, setNicheInput] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [country, setCountry] = useState("USA");
  const [maxReviews, setMaxReviews] = useState(40);
  const [targetVolume, setTargetVolume] = useState(500);
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const nicheRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);

  function addNiche() {
    const val = nicheInput.trim();
    if (val && !niches.includes(val)) setNiches([...niches, val]);
    setNicheInput("");
    nicheRef.current?.focus();
  }

  function addCity() {
    const val = cityInput.trim();
    if (val && !cities.includes(val)) setCities([...cities, val]);
    setCityInput("");
    cityRef.current?.focus();
  }

  function removeNiche(n: string) { setNiches(niches.filter((x) => x !== n)); }
  function removeCity(c: string) { setCities(cities.filter((x) => x !== c)); }

  function autofillCities() {
    const defaults = COUNTRY_CITIES[country] ?? [];
    const merged = [...new Set([...cities, ...defaults])];
    setCities(merged);
  }

  async function launch() {
    setError("");
    if (niches.length === 0) return setError("Add at least one niche.");
    if (cities.length === 0) return setError("Add at least one city or use Auto-fill.");

    setLaunching(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ niches, cities, country, maxReviews, targetVolume }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message || "Failed to launch");
      onLaunched();
    } catch {
      setError("Server error. Make sure the backend is running.");
    } finally {
      setLaunching(false);
    }
  }

  const combinations = niches.length * cities.length;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-white">Lead Finder</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onGoToDashboard}
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-[hsl(var(--muted))]"
          >
            My Leads
          </button>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{user.email}</span>
          <button onClick={onLogout} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition">Sign out</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Configure Your Scrape</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            Targets hidden businesses starting from Google Maps page 3 — low visibility, high intent.
          </p>
        </div>

        {/* Platform Selector */}
        <Section title="Platform" subtitle="Choose your data source">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLATFORMS.map((p) => (
              <div
                key={p.id}
                data-testid={`platform-${p.id}`}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition cursor-default ${
                  p.active
                    ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)] ring-1 ring-[hsl(var(--primary)/0.3)]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] opacity-40"
                }`}
              >
                <span className="text-2xl">{p.icon}</span>
                <span className={`text-xs font-medium ${p.active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}>
                  {p.label}
                </span>
                {!p.active && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Coming soon</span>}
                {p.active && <span className="text-[10px] text-[hsl(var(--primary))] font-semibold">Selected</span>}
              </div>
            ))}
          </div>
        </Section>

        {/* Niches */}
        <Section title="Target Niches" subtitle="Business types you want to find">
          <div className="flex gap-2">
            <input
              ref={nicheRef}
              data-testid="input-niche"
              type="text"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNiche())}
              placeholder="e.g. Dental Clinic, Roofing Contractor…"
              className="flex-1 px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition"
            />
            <button
              data-testid="button-add-niche"
              onClick={addNiche}
              className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg font-bold text-lg hover:bg-[hsl(142,70%,40%)] transition"
            >
              +
            </button>
          </div>
          {niches.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {niches.map((n) => (
                <Tag key={n} label={n} onRemove={() => removeNiche(n)} />
              ))}
            </div>
          )}
        </Section>

        {/* Cities */}
        <Section title="Target Cities" subtitle="Where to search">
          <div className="flex gap-2 mb-2">
            <select
              data-testid="select-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition"
            >
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              data-testid="button-autofill-cities"
              onClick={autofillCities}
              className="px-3.5 py-2 text-sm bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:text-white hover:border-[hsl(var(--primary)/0.4)] transition whitespace-nowrap"
            >
              Auto-fill {country} cities
            </button>
          </div>
          <div className="flex gap-2">
            <input
              ref={cityRef}
              data-testid="input-city"
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCity())}
              placeholder="e.g. Miami, FL"
              className="flex-1 px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition"
            />
            <button
              data-testid="button-add-city"
              onClick={addCity}
              className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg font-bold text-lg hover:bg-[hsl(142,70%,40%)] transition"
            >
              +
            </button>
          </div>
          {cities.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {cities.map((c) => (
                <Tag key={c} label={c} onRemove={() => removeCity(c)} color="blue" />
              ))}
            </div>
          )}
        </Section>

        {/* Filters */}
        <Section title="Scrape Filters" subtitle="Control the quality and volume of results">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Max Reviews <span className="text-[hsl(var(--muted-foreground))] font-normal">(skip over this)</span>
              </label>
              <input
                data-testid="input-max-reviews"
                type="number"
                min={1}
                max={10000}
                value={maxReviews}
                onChange={(e) => setMaxReviews(parseInt(e.target.value) || 40)}
                className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Filters out established businesses. Set 30–50 to find hidden gems.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">Target Lead Volume</label>
              <div className="flex gap-2 flex-wrap">
                {[500, 1000, 5000, 10000, 50000].map((v) => (
                  <button
                    key={v}
                    data-testid={`volume-${v}`}
                    onClick={() => setTargetVolume(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      targetVolume === v
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-white border border-[hsl(var(--border))]"
                    }`}
                  >
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                Custom:{" "}
                <input
                  type="number"
                  value={targetVolume}
                  onChange={(e) => setTargetVolume(parseInt(e.target.value) || 500)}
                  className="w-20 px-2 py-0.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded text-white text-xs"
                />
              </p>
            </div>
          </div>
        </Section>

        {/* Summary + Launch */}
        {combinations > 0 && (
          <div className="bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.2)] rounded-xl px-5 py-4 flex items-center gap-4">
            <svg className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              <span className="text-white font-medium">{combinations} query combinations</span> ({niches.length} niche{niches.length !== 1 ? "s" : ""} × {cities.length} city/cities) — targeting up to{" "}
              <span className="text-white font-medium">{targetVolume.toLocaleString()} leads</span> with ≤{maxReviews} reviews, starting from Google Maps page 3. Runs in the cloud — close your browser anytime.
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <button
          data-testid="button-launch"
          onClick={launch}
          disabled={launching}
          className="w-full py-4 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] font-bold text-base rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[hsl(var(--primary)/0.2)]"
        >
          {launching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Launching…
            </span>
          ) : (
            "🚀 Launch Cloud Scraper"
          )}
        </button>
      </main>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Tag({ label, onRemove, color = "green" }: { label: string; onRemove: () => void; color?: "green" | "blue" }) {
  const cls =
    color === "green"
      ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]"
      : "bg-blue-500/10 text-blue-300 border-blue-500/30";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${cls}`}>
      {label}
      <button onClick={onRemove} className="hover:opacity-70 transition ml-0.5 font-bold leading-none">×</button>
    </span>
  );
}
