import { useState, useRef } from "react";
import type { User } from "../App";

interface Props {
  user: User;
  onLaunched: () => void;
  onLogout: () => void;
  onGoToDashboard: () => void;
}

// Comprehensive country → major business hub cities
const COUNTRY_CITIES: Record<string, string[]> = {
  "USA":         ["New York, NY","Los Angeles, CA","Chicago, IL","Houston, TX","Phoenix, AZ","Philadelphia, PA","San Antonio, TX","Dallas, TX","San Diego, CA","Austin, TX","Jacksonville, FL","Miami, FL","Denver, CO","Nashville, TN","Atlanta, GA","Seattle, WA","Las Vegas, NV","Orlando, FL","Charlotte, NC","Boston, MA","Fort Worth, TX","Detroit, MI","Memphis, TN","Portland, OR","Baltimore, MD","Sacramento, CA","Minneapolis, MN","Tampa, FL","Tucson, AZ","Raleigh, NC"],
  "Canada":      ["Toronto, ON","Vancouver, BC","Montreal, QC","Calgary, AB","Ottawa, ON","Edmonton, AB","Winnipeg, MB","Hamilton, ON","Quebec City, QC","Halifax, NS","Victoria, BC","London, ON","Saskatoon, SK","Regina, SK","St. John's, NL"],
  "UK":          ["London","Birmingham","Manchester","Leeds","Glasgow","Sheffield","Bradford","Edinburgh","Liverpool","Bristol","Cardiff","Leicester","Nottingham","Coventry","Belfast","Derby","Plymouth","Stoke-on-Trent","Wolverhampton","Southampton"],
  "Australia":   ["Sydney, NSW","Melbourne, VIC","Brisbane, QLD","Perth, WA","Adelaide, SA","Gold Coast, QLD","Newcastle, NSW","Canberra, ACT","Wollongong, NSW","Hobart, TAS","Geelong, VIC","Townsville, QLD","Cairns, QLD","Darwin, NT","Ballarat, VIC"],
  "UAE":         ["Dubai","Abu Dhabi","Sharjah","Ajman","Ras Al Khaimah","Fujairah","Umm Al Quwain","Al Ain"],
  "India":       ["Mumbai","Delhi","Bangalore","Hyderabad","Chennai","Kolkata","Pune","Ahmedabad","Surat","Jaipur","Lucknow","Kanpur","Nagpur","Visakhapatnam","Indore","Thane","Bhopal","Patna","Vadodara","Ghaziabad"],
  "Germany":     ["Berlin","Hamburg","Munich","Cologne","Frankfurt","Stuttgart","Düsseldorf","Dortmund","Essen","Leipzig","Bremen","Dresden","Hanover","Nuremberg","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Mannheim"],
  "France":      ["Paris","Marseille","Lyon","Toulouse","Nice","Nantes","Strasbourg","Montpellier","Bordeaux","Lille","Rennes","Reims","Saint-Étienne","Toulon","Grenoble","Dijon","Angers","Nîmes","Villeurbanne","Le Mans"],
  "Netherlands": ["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven","Groningen","Tilburg","Almere","Breda","Nijmegen","Enschede","Haarlem","Arnhem","Zaanstad","Amersfoort"],
  "Singapore":   ["Singapore"],
  "New Zealand": ["Auckland","Wellington","Christchurch","Hamilton","Tauranga","Dunedin","Palmerston North","Nelson","Rotorua","New Plymouth"],
  "Ireland":     ["Dublin","Cork","Limerick","Galway","Waterford","Drogheda","Dundalk","Swords","Bray","Navan"],
  "South Africa":["Johannesburg","Cape Town","Durban","Pretoria","Port Elizabeth","Bloemfontein","East London","Pietermaritzburg","Polokwane","Kimberley"],
  "Philippines": ["Manila","Quezon City","Cebu","Davao","Caloocan","Zamboanga","Taguig","Antipolo","Pasig","Makati"],
  "Malaysia":    ["Kuala Lumpur","George Town","Ipoh","Shah Alam","Petaling Jaya","Kota Kinabalu","Kuching","Johor Bahru","Subang Jaya","Klang"],
  "Saudi Arabia":["Riyadh","Jeddah","Mecca","Medina","Dammam","Al Khobar","Tabuk","Buraidah","Khamis Mushait","Al Hufuf"],
  "Pakistan":    ["Karachi","Lahore","Faisalabad","Rawalpindi","Islamabad","Gujranwala","Peshawar","Multan","Hyderabad","Quetta"],
  "Nigeria":     ["Lagos","Kano","Ibadan","Abuja","Port Harcourt","Benin City","Maiduguri","Zaria"," Jos","Kaduna"],
  "Kenya":       ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Thika","Malindi","Kitale","Garissa","Kakamega"],
  "Brazil":      ["São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza","Belo Horizonte","Manaus","Curitiba","Recife","Porto Alegre"],
  "Mexico":      ["Mexico City","Guadalajara","Monterrey","Puebla","Tijuana","León","Ciudad Juárez","Zapopan","Mérida","Cancún"],
  "Spain":       ["Madrid","Barcelona","Valencia","Seville","Zaragoza","Málaga","Murcia","Palma","Las Palmas","Bilbao"],
  "Italy":       ["Rome","Milan","Naples","Turin","Palermo","Genoa","Bologna","Florence","Bari","Catania"],
  "Portugal":    ["Lisbon","Porto","Braga","Coimbra","Funchal","Setúbal","Amadora","Almada","Famalicão","Agualva-Cacém"],
  "Sweden":      ["Stockholm","Gothenburg","Malmö","Uppsala","Västerås","Örebro","Linköping","Helsingborg","Jönköping","Norrköping"],
  "Norway":      ["Oslo","Bergen","Trondheim","Stavanger","Drammen","Fredrikstad","Kristiansand","Sandnes","Ålesund","Tromsø"],
  "Denmark":     ["Copenhagen","Aarhus","Odense","Aalborg","Esbjerg","Randers","Kolding","Horsens","Vejle","Roskilde"],
  "Switzerland": ["Zurich","Geneva","Basel","Bern","Lausanne","Winterthur","Lucerne","St. Gallen","Lugano","Biel"],
  "Austria":     ["Vienna","Graz","Linz","Salzburg","Innsbruck","Klagenfurt","Villach","Wels","Sankt Pölten","Steyr"],
  "Poland":      ["Warsaw","Kraków","Łódź","Wrocław","Poznań","Gdańsk","Szczecin","Bydgoszcz","Lublin","Białystok"],
  "Czech Republic":["Prague","Brno","Ostrava","Plzeň","Liberec","Olomouc","Ústí nad Labem","České Budějovice","Hradec Králové","Pardubice"],
  "Hungary":     ["Budapest","Debrecen","Miskolc","Szeged","Pécs","Győr","Nyíregyháza","Kecskemét","Székesfehérvár","Szombathely"],
  "Romania":     ["Bucharest","Cluj-Napoca","Timișoara","Iași","Constanța","Craiova","Brașov","Galați","Ploiești","Oradea"],
  "Greece":      ["Athens","Thessaloniki","Patras","Heraklion","Larissa","Volos","Ioannina","Chania","Chalcis","Agrinion"],
  "Turkey":      ["Istanbul","Ankara","İzmir","Bursa","Adana","Gaziantep","Konya","Antalya","Kayseri","Diyarbakır"],
  "Egypt":       ["Cairo","Alexandria","Giza","Shubra El-Kheima","Port Said","Suez","Luxor","Mansoura","El-Mahalla El-Kubra","Tanta"],
  "Japan":       ["Tokyo","Yokohama","Osaka","Nagoya","Sapporo","Fukuoka","Kobe","Kawasaki","Kyoto","Saitama"],
  "South Korea": ["Seoul","Busan","Incheon","Daegu","Daejeon","Gwangju","Suwon","Ulsan","Changwon","Seongnam"],
  "China":       ["Shanghai","Beijing","Guangzhou","Shenzhen","Chengdu","Chongqing","Hangzhou","Wuhan","Xi'an","Tianjin"],
  "Indonesia":   ["Jakarta","Surabaya","Bandung","Medan","Bekasi","Palembang","Makassar","Semarang","Depok","Tangerang"],
  "Thailand":    ["Bangkok","Chiang Mai","Pattaya","Phuket","Khon Kaen","Hat Yai","Nakhon Ratchasima","Udon Thani","Nonthaburi","Pak Kret"],
  "Vietnam":     ["Ho Chi Minh City","Hanoi","Da Nang","Haiphong","Cần Thơ","Biên Hòa","Nha Trang","Buôn Ma Thuột","Vũng Tàu","Quy Nhơn"],
  "Other":       [], // Custom — type your own cities
};

const ALL_COUNTRIES = Object.keys(COUNTRY_CITIES).sort();

const PLATFORMS = [
  { id: "google-maps", label: "Google Maps", icon: "🗺️", active: true },
  { id: "linkedin",    label: "LinkedIn",    icon: "💼", active: false },
  { id: "instagram",   label: "Instagram",   icon: "📸", active: false },
  { id: "twitter",     label: "Twitter / X", icon: "𝕏",  active: false },
];

export default function Setup({ user, onLaunched, onLogout, onGoToDashboard }: Props) {
  const [niches, setNiches]           = useState<string[]>([]);
  const [nicheInput, setNicheInput]   = useState("");
  const [cities, setCities]           = useState<string[]>([]);
  const [cityInput, setCityInput]     = useState("");
  const [country, setCountry]         = useState("USA");
  const [maxReviews, setMaxReviews]   = useState(40);
  const [targetVolume, setTargetVolume] = useState(500);
  const [error, setError]             = useState("");
  const [launching, setLaunching]     = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const nicheRef = useRef<HTMLInputElement>(null);
  const cityRef  = useRef<HTMLInputElement>(null);

  const filteredCountries = ALL_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  function addNiche() {
    const val = nicheInput.trim();
    if (val && !niches.includes(val)) setNiches([...niches, val]);
    setNicheInput(""); nicheRef.current?.focus();
  }

  function addCity() {
    const val = cityInput.trim();
    if (val && !cities.includes(val)) setCities([...cities, val]);
    setCityInput(""); cityRef.current?.focus();
  }

  function removeNiche(n: string) { setNiches(niches.filter((x) => x !== n)); }
  function removeCity(c: string)  { setCities(cities.filter((x) => x !== c));  }

  function addRecommendedCities() {
    const defaults = COUNTRY_CITIES[country] ?? [];
    setCities(Array.from(new Set([...cities, ...defaults])));
  }

  function addAllCities() {
    const all = Object.values(COUNTRY_CITIES).flat();
    setCities(Array.from(new Set([...cities, ...all])));
  }

  async function launch() {
    setError("");
    if (niches.length === 0) return setError("Add at least one niche.");
    const finalCities = cities.length > 0 ? cities : (COUNTRY_CITIES[country] ?? []);
    if (finalCities.length === 0) return setError("Add at least one city.");
    setLaunching(true);
    try {
      const res  = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({ niches, cities: finalCities, country, maxReviews, targetVolume }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message || "Failed to launch");
      onLaunched();
    } catch { setError("Server error. Make sure the backend is running."); }
    finally  { setLaunching(false); }
  }

  const combinations = niches.length * Math.max(cities.length, 1);
  const citiesLabel  = cities.length === 0 ? `Auto (${COUNTRY_CITIES[country]?.length ?? 0} cities)` : `${cities.length} cities`;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
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
          <button onClick={onGoToDashboard} className="text-sm text-[hsl(var(--muted-foreground))] hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-[hsl(var(--muted))]">My Leads</button>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{user.email}</span>
          <button onClick={onLogout} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-white transition">Sign out</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Configure Your Scrape</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            Targets hidden local businesses from Google Maps page 3+ with low visibility — perfect for agency outreach.
            Email is found by visiting their website automatically.
          </p>
        </div>

        {/* Platform */}
        <Card title="Platform" sub="Data source">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLATFORMS.map((p) => (
              <div key={p.id} data-testid={`platform-${p.id}`}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border cursor-default ${p.active ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.08)] ring-1 ring-[hsl(var(--primary)/0.3)]" : "border-[hsl(var(--border))] opacity-35"}`}>
                <span className="text-2xl">{p.icon}</span>
                <span className={`text-xs font-medium ${p.active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}>{p.label}</span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{p.active ? "Active" : "Coming soon"}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Niches */}
        <Card title="Target Niches" sub="Any business type — B2B or B2C, any industry">
          <div className="flex gap-2">
            <input ref={nicheRef} data-testid="input-niche" type="text" value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNiche())}
              placeholder="e.g. Dental Clinic, Roofing, Chiropractor, Gym…"
              className="flex-1 px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
            <button onClick={addNiche} data-testid="button-add-niche"
              className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg font-bold text-lg hover:bg-[hsl(142,70%,40%)] transition">+</button>
          </div>
          {niches.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {niches.map((n) => <Tag key={n} label={n} onRemove={() => removeNiche(n)} />)}
            </div>
          )}
        </Card>

        {/* Country + Cities */}
        <Card title="Location" sub="Choose country and cities — no limitations">
          {/* Country picker */}
          <div className="space-y-2 mb-4">
            <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Country</label>
            <input type="text" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search country…"
              className="w-full px-3.5 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
            <div className="max-h-36 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-1.5 pr-1">
              {filteredCountries.map((c) => (
                <button key={c} onClick={() => { setCountry(c); setCountrySearch(""); }}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition text-left truncate ${country === c ? "bg-[hsl(var(--primary)/0.15)] border-[hsl(var(--primary)/0.4)] text-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* City controls */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Cities</label>
            <div className="flex gap-2 flex-wrap">
              <button onClick={addRecommendedCities}
                className="px-3 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:text-white hover:border-[hsl(var(--primary)/0.4)] transition whitespace-nowrap">
                Add {COUNTRY_CITIES[country]?.length ?? 0} major {country} cities
              </button>
              <button onClick={addAllCities}
                className="px-3 py-1.5 text-xs bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--muted-foreground))] hover:text-white hover:border-[hsl(var(--primary)/0.4)] transition whitespace-nowrap">
                Add all countries
              </button>
              {cities.length > 0 && (
                <button onClick={() => setCities([])}
                  className="px-3 py-1.5 text-xs bg-[hsl(var(--muted))] border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition whitespace-nowrap">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input ref={cityRef} data-testid="input-city" type="text" value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCity())}
                placeholder="Type any city, state, country…"
                className="flex-1 px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
              <button onClick={addCity} data-testid="button-add-city"
                className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg font-bold text-lg hover:bg-[hsl(142,70%,40%)] transition">+</button>
            </div>
            {cities.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                No cities added — will auto-use {COUNTRY_CITIES[country]?.length ?? 0} {country} cities on launch.
              </p>
            )}
            {cities.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 max-h-40 overflow-y-auto">
                {cities.map((c) => <Tag key={c} label={c} onRemove={() => removeCity(c)} color="blue" />)}
              </div>
            )}
          </div>
        </Card>

        {/* Filters */}
        <Card title="Scrape Filters" sub="Target low-visibility, high-potential businesses">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Max Reviews <span className="text-[hsl(var(--muted-foreground))] font-normal">(skip established businesses over this)</span>
              </label>
              <input data-testid="input-max-reviews" type="number" min={1} max={100000}
                value={maxReviews} onChange={(e) => setMaxReviews(parseInt(e.target.value) || 40)}
                className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">30–50 = hidden gems · 200+ = established · 0 = no filter</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Target Lead Volume</label>
              <div className="flex gap-2 flex-wrap">
                {[500, 1000, 5000, 10000, 50000, 100000].map((v) => (
                  <button key={v} data-testid={`volume-${v}`} onClick={() => setTargetVolume(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${targetVolume === v ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-white border border-[hsl(var(--border))]"}`}>
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
              <input type="number" value={targetVolume} onChange={(e) => setTargetVolume(parseInt(e.target.value) || 500)}
                className="mt-2 w-32 px-2.5 py-1.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm" />
            </div>
          </div>
        </Card>

        {/* Summary */}
        {combinations > 0 && (
          <div className="bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.2)] rounded-xl px-5 py-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-white font-medium">
              <svg className="w-4 h-4 text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {niches.length} niche{niches.length !== 1 ? "s" : ""} × {citiesLabel} = {combinations.toLocaleString()} queries
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Targeting up to <span className="text-white font-medium">{targetVolume.toLocaleString()} leads</span> with ≤{maxReviews} reviews, starting from Google Maps <span className="text-white font-medium">page 3+</span>.
              Emails found by visiting business websites — real contacts only, no fakes.
              Runs in the cloud — close your browser, leads keep coming.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { ram: "16GB VPS", time: targetVolume <= 5000 ? "~10-20 min" : targetVolume <= 50000 ? "~35-45 min" : "~70-80 min" },
                { ram: "32GB VPS", time: targetVolume <= 5000 ? "~5-12 min" : targetVolume <= 50000 ? "~18-25 min" : "~35-45 min" },
                { ram: "64GB VPS", time: targetVolume <= 5000 ? "~3-6 min"  : targetVolume <= 50000 ? "~10-15 min" : "~20-28 min" },
              ].map((e) => (
                <div key={e.ram} className="bg-[hsl(var(--muted)/0.5)] rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{e.ram}</div>
                  <div className="text-sm font-semibold text-white">{e.time}</div>
                </div>
              ))}
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

        <button data-testid="button-launch" onClick={launch} disabled={launching}
          className="w-full py-4 bg-[hsl(var(--primary))] hover:bg-[hsl(142,70%,40%)] text-[hsl(var(--primary-foreground))] font-bold text-base rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[hsl(var(--primary)/0.2)]">
          {launching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Launching…
            </span>
          ) : "🚀 Launch Cloud Scraper"}
        </button>
      </main>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {sub && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Tag({ label, onRemove, color = "green" }: { label: string; onRemove: () => void; color?: "green" | "blue" }) {
  const cls = color === "green"
    ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]"
    : "bg-blue-500/10 text-blue-300 border-blue-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${cls}`}>
      {label}
      <button onClick={onRemove} className="hover:opacity-70 transition font-bold leading-none ml-0.5">×</button>
    </span>
  );
}
