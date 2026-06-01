import { useState, useCallback } from "react";
import type { User } from "../App";
import { COUNTRY_CITIES, ALL_COUNTRIES, getDefaultCities } from "../lib/locationData";

interface Props {
  user: User;
  onLaunched: () => void;
  onLogout: () => void;
  onGoToDashboard: () => void;
}

const VOLUME_PRESETS = [100, 500, 1_000, 5_000, 10_000, 50_000];

export default function Setup({ user, onLaunched, onLogout, onGoToDashboard }: Props) {
  const [step, setStep]             = useState(1);
  const [nichesRaw, setNichesRaw]   = useState("");
  const [targetVolume, setTargetVolume] = useState(500);
  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [citySelection, setCitySelection]   = useState<Record<string, string[]>>({});
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [maxReviews, setMaxReviews] = useState(40);
  const [includePhone, setIncludePhone] = useState(true);
  const [launching, setLaunching]   = useState(false);
  const [toast, setToast]           = useState<{ msg: string; err?: boolean } | null>(null);

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const niches = nichesRaw.split(",").map((n) => n.trim()).filter(Boolean);
  const allSelectedCities = Object.values(citySelection).flat();
  const cityCountryMap: Record<string, string> = {};
  for (const [country, cities] of Object.entries(citySelection))
    cities.forEach((c) => { cityCountryMap[c] = country; });

  const filteredCountries = ALL_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  const toggleCountry = useCallback((country: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(country)) {
        setCitySelection((p) => { const n = { ...p }; delete n[country]; return n; });
        setExpandedCountry((e) => (e === country ? null : e));
        return prev.filter((c) => c !== country);
      }
      setCitySelection((p) => ({ ...p, [country]: getDefaultCities(country) }));
      setExpandedCountry(country);
      return [...prev, country];
    });
  }, []);

  const toggleCity = useCallback((country: string, city: string) => {
    setCitySelection((p) => {
      const cur = p[country] ?? [];
      return { ...p, [country]: cur.includes(city) ? cur.filter((c) => c !== city) : [...cur, city] };
    });
  }, []);

  const launch = async () => {
    if (!niches.length) { showToast("Add at least one niche", true); return; }
    if (!allSelectedCities.length) { showToast("Select at least one city", true); return; }
    setLaunching(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ niches, cities: allSelectedCities, countries: selectedCountries, cityCountryMap, maxReviews, targetVolume, includePhone: includePhone ? 1 : 0 }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Launch failed"); }
      showToast("Scrape launched!");
      setTimeout(onLaunched, 800);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setLaunching(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition";
  const btnPrimary = "w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed";
  const card = "bg-gray-900 rounded-xl border border-gray-800 p-5";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl border ${
          toast.err ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-green-500/20 border-green-500/40 text-green-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-3 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5">
          <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm hidden sm:block">Lead Finder</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-gray-500 text-xs hidden lg:block truncate max-w-[160px]">{user.email}</span>
            <button onClick={onGoToDashboard} className="px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition">
              Dashboard
            </button>
            <button onClick={onLogout} className="px-2.5 py-1 text-xs text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Step tabs */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-3 flex">
          {([
            { n: 1, label: "Niches & Goal" },
            { n: 2, label: "Locations" },
            { n: 3, label: "Settings" },
          ] as const).map(({ n, label }) => (
            <button key={n} onClick={() => setStep(n)} data-testid={`tab-step-${n}`}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                step === n ? "border-green-500 text-green-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              <span className="hidden sm:inline">{n}. {label}</span>
              <span className="sm:hidden">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-3 py-5 space-y-5">

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className={card + " space-y-5"}>
              <h2 className="text-sm font-semibold text-white">What niches to scrape?</h2>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Niches <span className="text-gray-600">(comma-separated, as many as you want)</span></label>
                <textarea data-testid="input-niches"
                  placeholder="plumbers, electricians, HVAC companies, dentists, roofers, landscaping, ..."
                  value={nichesRaw} onChange={(e) => setNichesRaw(e.target.value)} rows={3}
                  className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none transition" />
                {niches.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {niches.map((n) => (
                      <span key={n} className="px-2 py-0.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded text-xs">{n}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Target leads <span className="text-gray-600">(split equally across all niches × cities)</span></label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {VOLUME_PRESETS.map((v) => (
                    <button key={v} data-testid={`preset-${v}`} onClick={() => setTargetVolume(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${targetVolume === v
                        ? "bg-green-500/20 text-green-300 border-green-500/40" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}>
                      {v.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input data-testid="input-volume" type="number" min={1} max={500000} value={targetVolume}
                  onChange={(e) => setTargetVolume(Math.max(1, parseInt(e.target.value) || 1))}
                  className={inputCls + " w-36"} />
              </div>
            </div>
            <button data-testid="btn-next-1" onClick={() => {
              if (!niches.length) { showToast("Add at least one niche", true); return; }
              setStep(2);
            }} className={btnPrimary}>
              Continue to Locations →
            </button>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className={card + " space-y-3"}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Select Countries</h2>
                {selectedCountries.length > 0 && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded text-xs">
                    {selectedCountries.length} selected
                  </span>
                )}
              </div>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input data-testid="input-country-search" placeholder="Search countries..."
                  value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40 transition" />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredCountries.map((country) => {
                  const sel = selectedCountries.includes(country);
                  return (
                    <button key={country} data-testid={`btn-country-${country}`} onClick={() => toggleCountry(country)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${sel
                        ? "bg-green-500/20 text-green-300 border-green-500/40" : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"}`}>
                      {sel && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {country}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedCountries.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-white">Cities</h3>
                  <span className="text-xs text-gray-500">{allSelectedCities.length} selected total</span>
                </div>
                {selectedCountries.map((country) => {
                  const allCities = COUNTRY_CITIES[country] ?? [];
                  const selected  = citySelection[country] ?? [];
                  const open      = expandedCountry === country;
                  return (
                    <div key={country} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                      <button data-testid={`btn-expand-${country}`} onClick={() => setExpandedCountry(open ? null : country)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{country}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs border ${selected.length > 0
                            ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-gray-700 text-gray-400 border-gray-600"}`}>
                            {selected.length}/{allCities.length}
                          </span>
                        </div>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      {open && (
                        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
                          <div className="flex items-center gap-3 text-xs">
                            <button onClick={() => setCitySelection((p) => ({ ...p, [country]: [...allCities] }))}
                              className="text-green-400 hover:text-green-300 underline underline-offset-2">All {allCities.length}</button>
                            <span className="text-gray-700">·</span>
                            <button onClick={() => setCitySelection((p) => ({ ...p, [country]: getDefaultCities(country) }))}
                              className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Top 20</button>
                            <span className="text-gray-700">·</span>
                            <button onClick={() => setCitySelection((p) => ({ ...p, [country]: [] }))}
                              className="text-gray-500 hover:text-gray-400 underline underline-offset-2">None</button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-64 overflow-y-auto">
                            {allCities.map((city) => {
                              const checked = selected.includes(city);
                              return (
                                <label key={city} data-testid={`city-${city.replace(/[^a-z0-9]/gi, "_")}`}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs select-none transition ${
                                    checked ? "bg-green-500/10 text-green-300" : "text-gray-400 hover:bg-gray-800"}`}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleCity(country, city)}
                                    className="w-3 h-3 accent-green-500 shrink-0" />
                                  <span className="truncate">{city}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedCountries.length === 0 && (
              <p className="text-center text-gray-600 text-sm py-8">Select a country above — its cities will appear here</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg text-sm border border-gray-700 transition">Back</button>
              <button data-testid="btn-next-2" onClick={() => {
                if (!allSelectedCities.length) { showToast("Select at least one city", true); return; }
                setStep(3);
              }} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition">
                Continue to Settings →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className={card + " space-y-5"}>
              <h2 className="text-sm font-semibold text-white">Scraping Settings</h2>

              {/* Max reviews */}
              <div className="space-y-2">
                <label className="text-xs text-gray-300 font-medium">Max Reviews Filter</label>
                <div className="flex items-start gap-3">
                  <input data-testid="input-max-reviews" type="number" min={0} max={100000} value={maxReviews}
                    onChange={(e) => setMaxReviews(Math.max(0, parseInt(e.target.value) || 0))}
                    className={inputCls + " w-28 shrink-0"} />
                  <p className="text-xs text-gray-500 leading-relaxed mt-1">
                    Scrapes businesses with up to <span className="text-gray-300">{maxReviews || "unlimited"} reviews</span>.
                    Set to 0 for no limit. Always starts from page 3+ of Google Maps (low-visibility leads).
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[20, 40, 100, 0].map((v) => (
                    <button key={v} onClick={() => setMaxReviews(v)} data-testid={`rev-${v}`}
                      className={`px-2.5 py-1 rounded text-xs border transition ${maxReviews === v
                        ? "bg-green-500/20 text-green-300 border-green-500/40" : "bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600"}`}>
                      {v === 0 ? "No limit" : `≤ ${v}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                <div>
                  <p className="text-sm font-medium text-white">Include Phone Numbers</p>
                  <p className="text-xs text-gray-500 mt-0.5">Scraped from Google Maps. Optional — email is always collected.</p>
                </div>
                <button data-testid="switch-phone" onClick={() => setIncludePhone(!includePhone)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${includePhone ? "bg-green-500" : "bg-gray-700"}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includePhone ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 text-xs text-blue-300 leading-relaxed">
                <strong>Email always searched</strong> — visits each business website in parallel, extracts the real contact email, and validates it with a DNS mail-server check.
              </div>
            </div>

            {/* Launch summary */}
            <div className={card}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Launch Summary</h3>
              <div className="grid grid-cols-3 gap-y-3 gap-x-4 text-sm">
                {[
                  ["Niches", niches.length],
                  ["Target", targetVolume.toLocaleString()],
                  ["Countries", selectedCountries.length],
                  ["Cities", allSelectedCities.length],
                  ["Max Reviews", maxReviews === 0 ? "No limit" : `≤ ${maxReviews}`],
                  ["Phone", includePhone ? "Included" : "Excluded"],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-gray-500 text-xs">{label}</p>
                    <p className="text-white font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-700 mt-3 pt-3 border-t border-gray-800">
                {niches.length} niches × {allSelectedCities.length} cities = {(niches.length * allSelectedCities.length).toLocaleString()} queries
                · ~{Math.ceil(targetVolume / Math.max(niches.length * allSelectedCities.length, 1))} leads / query
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg text-sm border border-gray-700 transition">Back</button>
              <button data-testid="btn-launch" onClick={launch} disabled={launching}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                {launching ? "Launching…" : "🚀 Launch Scrape"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
