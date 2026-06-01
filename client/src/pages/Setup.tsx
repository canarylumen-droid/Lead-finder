import { useState, useRef } from "react";
import type { User } from "../App";

interface Props {
  user: User;
  onLaunched: () => void;
  onLogout: () => void;
  onGoToDashboard: () => void;
}

const COUNTRY_CITIES: Record<string, string[]> = {
  "USA":           ["New York, NY","Los Angeles, CA","Chicago, IL","Houston, TX","Phoenix, AZ","Philadelphia, PA","San Antonio, TX","Dallas, TX","San Diego, CA","Austin, TX","Jacksonville, FL","Miami, FL","Denver, CO","Nashville, TN","Atlanta, GA","Seattle, WA","Las Vegas, NV","Orlando, FL","Charlotte, NC","Boston, MA","Fort Worth, TX","Detroit, MI","Memphis, TN","Portland, OR","Baltimore, MD","Sacramento, CA","Minneapolis, MN","Tampa, FL","Tucson, AZ","Raleigh, NC"],
  "Canada":        ["Toronto, ON","Vancouver, BC","Montreal, QC","Calgary, AB","Ottawa, ON","Edmonton, AB","Winnipeg, MB","Hamilton, ON","Quebec City, QC","Halifax, NS","Victoria, BC","London, ON","Saskatoon, SK","Regina, SK","St. John's, NL"],
  "UK":            ["London","Birmingham","Manchester","Leeds","Glasgow","Sheffield","Bradford","Edinburgh","Liverpool","Bristol","Cardiff","Leicester","Nottingham","Coventry","Belfast","Derby","Plymouth","Stoke-on-Trent","Wolverhampton","Southampton"],
  "Australia":     ["Sydney, NSW","Melbourne, VIC","Brisbane, QLD","Perth, WA","Adelaide, SA","Gold Coast, QLD","Newcastle, NSW","Canberra, ACT","Wollongong, NSW","Hobart, TAS","Geelong, VIC","Townsville, QLD","Cairns, QLD","Darwin, NT","Ballarat, VIC"],
  "UAE":           ["Dubai","Abu Dhabi","Sharjah","Ajman","Ras Al Khaimah","Fujairah","Umm Al Quwain","Al Ain"],
  "India":         ["Mumbai","Delhi","Bangalore","Hyderabad","Chennai","Kolkata","Pune","Ahmedabad","Surat","Jaipur","Lucknow","Kanpur","Nagpur","Visakhapatnam","Indore","Thane","Bhopal","Patna","Vadodara","Ghaziabad"],
  "Germany":       ["Berlin","Hamburg","Munich","Cologne","Frankfurt","Stuttgart","Düsseldorf","Dortmund","Essen","Leipzig","Bremen","Dresden","Hanover","Nuremberg","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Mannheim"],
  "France":        ["Paris","Marseille","Lyon","Toulouse","Nice","Nantes","Strasbourg","Montpellier","Bordeaux","Lille","Rennes","Reims","Saint-Étienne","Toulon","Grenoble","Dijon","Angers","Nîmes","Villeurbanne","Le Mans"],
  "Netherlands":   ["Amsterdam","Rotterdam","The Hague","Utrecht","Eindhoven","Groningen","Tilburg","Almere","Breda","Nijmegen","Enschede","Haarlem","Arnhem","Zaanstad","Amersfoort"],
  "Singapore":     ["Singapore"],
  "New Zealand":   ["Auckland","Wellington","Christchurch","Hamilton","Tauranga","Dunedin","Palmerston North","Nelson","Rotorua","New Plymouth"],
  "Ireland":       ["Dublin","Cork","Limerick","Galway","Waterford","Drogheda","Dundalk","Swords","Bray","Navan"],
  "South Africa":  ["Johannesburg","Cape Town","Durban","Pretoria","Port Elizabeth","Bloemfontein","East London","Pietermaritzburg","Polokwane","Kimberley"],
  "Philippines":   ["Manila","Quezon City","Cebu","Davao","Caloocan","Zamboanga","Taguig","Antipolo","Pasig","Makati"],
  "Malaysia":      ["Kuala Lumpur","George Town","Ipoh","Shah Alam","Petaling Jaya","Kota Kinabalu","Kuching","Johor Bahru","Subang Jaya","Klang"],
  "Saudi Arabia":  ["Riyadh","Jeddah","Mecca","Medina","Dammam","Al Khobar","Tabuk","Buraidah","Khamis Mushait","Al Hufuf"],
  "Pakistan":      ["Karachi","Lahore","Faisalabad","Rawalpindi","Islamabad","Gujranwala","Peshawar","Multan","Hyderabad","Quetta"],
  "Nigeria":       ["Lagos","Kano","Ibadan","Abuja","Port Harcourt","Benin City","Maiduguri","Zaria","Jos","Kaduna"],
  "Kenya":         ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Thika","Malindi","Kitale","Garissa","Kakamega"],
  "Brazil":        ["São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza","Belo Horizonte","Manaus","Curitiba","Recife","Porto Alegre"],
  "Mexico":        ["Mexico City","Guadalajara","Monterrey","Puebla","Tijuana","León","Ciudad Juárez","Zapopan","Mérida","Cancún"],
  "Spain":         ["Madrid","Barcelona","Valencia","Seville","Zaragoza","Málaga","Murcia","Palma","Las Palmas","Bilbao"],
  "Italy":         ["Rome","Milan","Naples","Turin","Palermo","Genoa","Bologna","Florence","Bari","Catania"],
  "Portugal":      ["Lisbon","Porto","Braga","Coimbra","Funchal","Setúbal","Amadora","Almada","Famalicão","Agualva-Cacém"],
  "Sweden":        ["Stockholm","Gothenburg","Malmö","Uppsala","Västerås","Örebro","Linköping","Helsingborg","Jönköping","Norrköping"],
  "Norway":        ["Oslo","Bergen","Trondheim","Stavanger","Drammen","Fredrikstad","Kristiansand","Sandnes","Ålesund","Tromsø"],
  "Denmark":       ["Copenhagen","Aarhus","Odense","Aalborg","Esbjerg","Randers","Kolding","Horsens","Vejle","Roskilde"],
  "Switzerland":   ["Zurich","Geneva","Basel","Bern","Lausanne","Winterthur","Lucerne","St. Gallen","Lugano","Biel"],
  "Austria":       ["Vienna","Graz","Linz","Salzburg","Innsbruck","Klagenfurt","Villach","Wels","Sankt Pölten","Steyr"],
  "Poland":        ["Warsaw","Kraków","Łódź","Wrocław","Poznań","Gdańsk","Szczecin","Bydgoszcz","Lublin","Białystok"],
  "Czech Republic":["Prague","Brno","Ostrava","Plzeň","Liberec","Olomouc","Ústí nad Labem","České Budějovice","Hradec Králové","Pardubice"],
  "Hungary":       ["Budapest","Debrecen","Miskolc","Szeged","Pécs","Győr","Nyíregyháza","Kecskemét","Székesfehérvár","Szombathely"],
  "Romania":       ["Bucharest","Cluj-Napoca","Timișoara","Iași","Constanța","Craiova","Brașov","Galați","Ploiești","Oradea"],
  "Greece":        ["Athens","Thessaloniki","Patras","Heraklion","Larissa","Volos","Ioannina","Chania","Chalcis","Agrinion"],
  "Turkey":        ["Istanbul","Ankara","İzmir","Bursa","Adana","Gaziantep","Konya","Antalya","Kayseri","Diyarbakır"],
  "Egypt":         ["Cairo","Alexandria","Giza","Shubra El-Kheima","Port Said","Suez","Luxor","Mansoura","El-Mahalla El-Kubra","Tanta"],
  "Japan":         ["Tokyo","Yokohama","Osaka","Nagoya","Sapporo","Fukuoka","Kobe","Kawasaki","Kyoto","Saitama"],
  "South Korea":   ["Seoul","Busan","Incheon","Daegu","Daejeon","Gwangju","Suwon","Ulsan","Changwon","Seongnam"],
  "China":         ["Shanghai","Beijing","Guangzhou","Shenzhen","Chengdu","Chongqing","Hangzhou","Wuhan","Xi'an","Tianjin"],
  "Indonesia":     ["Jakarta","Surabaya","Bandung","Medan","Bekasi","Palembang","Makassar","Semarang","Depok","Tangerang"],
  "Thailand":      ["Bangkok","Chiang Mai","Pattaya","Phuket","Khon Kaen","Hat Yai","Nakhon Ratchasima","Udon Thani","Nonthaburi","Pak Kret"],
  "Vietnam":       ["Ho Chi Minh City","Hanoi","Da Nang","Haiphong","Cần Thơ","Biên Hòa","Nha Trang","Buôn Ma Thuột","Vũng Tàu","Quy Nhơn"],
};

const ALL_COUNTRIES = Object.keys(COUNTRY_CITIES).sort();

const PLATFORMS = [
  { id: "google-maps", label: "Google Maps", icon: "🗺️", active: true },
  { id: "linkedin",    label: "LinkedIn",    icon: "💼", active: false },
  { id: "instagram",   label: "Instagram",   icon: "📸", active: false },
  { id: "twitter",     label: "Twitter / X", icon: "𝕏",  active: false },
];

export default function Setup({ user, onLaunched, onLogout, onGoToDashboard }: Props) {
  const [niches, setNiches]               = useState<string[]>([]);
  const [nicheInput, setNicheInput]       = useState("");
  const [cities, setCities]               = useState<string[]>([]);
  const [cityInput, setCityInput]         = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["USA"]);
  const [maxReviews, setMaxReviews]       = useState(40);
  const [targetVolume, setTargetVolume]   = useState(500);
  const [error, setError]                 = useState("");
  const [launching, setLaunching]         = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const nicheRef = useRef<HTMLInputElement>(null);
  const cityRef  = useRef<HTMLInputElement>(null);

  const filteredCountries = ALL_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  // Build city→country map from selected countries
  function buildCityCountryMap(countriesList: string[], citiesList: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const city of citiesList) {
      for (const country of countriesList) {
        if (COUNTRY_CITIES[country]?.includes(city)) {
          map[city] = country;
          break;
        }
      }
      if (!map[city]) map[city] = countriesList[0] ?? "Unknown";
    }
    return map;
  }

  function toggleCountry(c: string) {
    if (selectedCountries.includes(c)) {
      // Deselect — also remove cities belonging only to this country
      const newCountries = selectedCountries.filter((x) => x !== c);
      setSelectedCountries(newCountries.length === 0 ? [c] : newCountries); // keep at least 1
      // Remove cities that were from this country and not in any remaining selected country
      const removedCities = COUNTRY_CITIES[c] ?? [];
      const remainingCitySet = new Set(
        newCountries.flatMap((cn) => COUNTRY_CITIES[cn] ?? [])
      );
      setCities((prev) => prev.filter((city) => !removedCities.includes(city) || remainingCitySet.has(city)));
    } else {
      // Select — auto-add this country's cities
      const newCountries = [...selectedCountries, c];
      setSelectedCountries(newCountries);
      const newCities = COUNTRY_CITIES[c] ?? [];
      setCities((prev) => Array.from(new Set([...prev, ...newCities])));
    }
  }

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
  function removeCity(c: string)  { setCities(cities.filter((x) => x !== c)); }

  function addAllCountries() {
    setSelectedCountries(ALL_COUNTRIES);
    const allCities = Object.values(COUNTRY_CITIES).flat();
    setCities(Array.from(new Set(allCities)));
  }

  function clearCountries() {
    setSelectedCountries(["USA"]);
    setCities(COUNTRY_CITIES["USA"] ?? []);
  }

  async function launch() {
    setError("");
    if (niches.length === 0) return setError("Add at least one niche.");
    if (cities.length === 0) return setError("Select at least one country or add a city.");
    setLaunching(true);
    try {
      const cityCountryMap = buildCityCountryMap(selectedCountries, cities);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": String(user.id) },
        body: JSON.stringify({
          niches,
          cities,
          countries: selectedCountries,
          cityCountryMap,
          maxReviews,
          targetVolume,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.message || "Failed to launch");
      onLaunched();
    } catch { setError("Server error. Make sure the backend is running."); }
    finally  { setLaunching(false); }
  }

  const combinations  = niches.length * cities.length;
  const totalCities   = cities.length;

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
            Targets hidden local businesses from Google Maps page 3+ with low visibility.
            Email is found by visiting their website automatically. Deploys anywhere — only needs DATABASE_URL.
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
        <Card title="Target Niches" sub="Any business type — e.g. Plumber, Dentist, Roofing, Gym, Chiropractor">
          <div className="flex gap-2">
            <input ref={nicheRef} data-testid="input-niche" type="text" value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNiche())}
              placeholder="e.g. Plumber, Dental Clinic, Roofing…"
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

        {/* Countries + Cities */}
        <Card title="Location" sub="Select one or more countries — cities load automatically">
          {/* Country multi-select */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                Countries
                <span className="ml-2 px-1.5 py-0.5 bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] rounded text-[10px] font-bold">
                  {selectedCountries.length} selected
                </span>
              </label>
              <div className="flex gap-2">
                <button onClick={addAllCountries}
                  className="text-[10px] px-2 py-1 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded text-[hsl(var(--muted-foreground))] hover:text-white transition">
                  All countries
                </button>
                <button onClick={clearCountries}
                  className="text-[10px] px-2 py-1 bg-[hsl(var(--muted))] border border-red-500/20 rounded text-red-400 hover:bg-red-500/10 transition">
                  Reset
                </button>
              </div>
            </div>

            <input type="text" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search country…"
              className="w-full px-3.5 py-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />

            <div className="max-h-48 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-1.5 pr-1">
              {filteredCountries.map((c) => {
                const selected = selectedCountries.includes(c);
                return (
                  <button key={c} onClick={() => toggleCountry(c)} data-testid={`country-${c}`}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition text-left truncate ${selected
                      ? "bg-[hsl(var(--primary)/0.18)] border-[hsl(var(--primary)/0.5)] text-[hsl(var(--primary))] font-semibold ring-1 ring-[hsl(var(--primary)/0.2)]"
                      : "bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-white hover:border-[hsl(var(--border)/0.8)]"}`}>
                    {selected && <span className="mr-1">✓</span>}{c}
                  </button>
                );
              })}
            </div>

            {/* Selected countries as tags */}
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedCountries.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]">
                    {c}
                    <button onClick={() => toggleCountry(c)} className="hover:opacity-70 transition font-bold leading-none ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* City list (auto-populated + manual) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                Cities
                <span className="ml-2 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded text-[10px] font-bold">
                  {totalCities} loaded
                </span>
              </label>
              {cities.length > 0 && (
                <button onClick={() => setCities([])}
                  className="text-[10px] px-2 py-1 bg-[hsl(var(--muted))] border border-red-500/20 rounded text-red-400 hover:bg-red-500/10 transition">
                  Clear cities
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input ref={cityRef} data-testid="input-city" type="text" value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCity())}
                placeholder="Add any custom city…"
                className="flex-1 px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white placeholder-[hsl(var(--muted-foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
              <button onClick={addCity} data-testid="button-add-city"
                className="px-4 py-2.5 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg font-bold text-lg hover:bg-[hsl(142,70%,40%)] transition">+</button>
            </div>

            {cities.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Select a country above to auto-load its cities, or type a custom city.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2 max-h-40 overflow-y-auto">
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
                Max Reviews <span className="text-[hsl(var(--muted-foreground))] font-normal">(0 = no filter)</span>
              </label>
              <input data-testid="input-max-reviews" type="number" min={0} max={100000}
                value={maxReviews} onChange={(e) => setMaxReviews(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)] transition" />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">30–50 = hidden gems · 200+ = all businesses · 0 = no filter</p>
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
              {niches.length} niche{niches.length !== 1 ? "s" : ""} × {totalCities} cities ({selectedCountries.length} countr{selectedCountries.length !== 1 ? "ies" : "y"}) = {combinations.toLocaleString()} queries
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Targeting up to <span className="text-white font-medium">{targetVolume.toLocaleString()} leads</span>
              {maxReviews > 0 ? ` with ≤${maxReviews} reviews` : ""}, starting from Google Maps <span className="text-white font-medium">page 3+</span>.
              Emails found in parallel by visiting business websites. CSV columns: <span className="text-white">Niche → Business Name → City → Country → Address → Phone → Email → Website</span>.
            </p>
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
