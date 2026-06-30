import { COUNTRY_CITIES } from "./client/src/lib/locationData.ts";

const NICHES = [
  "Water damage restoration","Fire damage restoration","Flood restoration service",
  "Emergency water removal","Smoke damage repair","HVAC contractor","HVAC & Plumbing",
  "Emergency plumber","AC repair service","Heating & cooling","Residential plumbing",
  "Commercial plumber","Drain cleaning service","Roofing contractor","Roof repair",
  "Emergency roof leak","Solar panel installer","Solar energy system","Residential solar",
  "Roof replacement","Roofing & Solar","Med spa","Dental clinic","Cosmetic dentistry",
  "Dermatology clinic","Orthodontist","Aesthetic clinic","Family dental practice",
  "Pest control","Home pest control","Termite inspection","Bed bug removal",
  "Rodent control","Commercial pest control","Landscaping","Commercial landscaping",
  "Lawn care service","Home remodeler","Kitchen remodeling","Bathroom renovator",
  "Electrician","Residential electrician","Restaurant","Fine dining","Casual dining",
  "Local bistro","Catering service","Home remodelers","General Contractor","Home renovation",
  "Basement remodeling contractor","Home addition builder","Historic home restoration",
  "Plastic Surgeon","Cosmetic Surgeon","Cosmetic Surgery Clinic","Facelift specialist",
  "Breast augmentation","Liposuction clinic","Rhinoplasty surgeon","Tummy tuck",
  "Epoxy Flooring","Concrete Coating","Garage floor coating","Commercial epoxy flooring",
  "Industrial floor coating contractor","Concrete sealing service","Metallic epoxy installer",
];

// Build city→country map for USA + UK only
const cityCountryMap: Record<string, string> = {};
for (const country of ["USA", "UK"]) {
  const cities = COUNTRY_CITIES[country] ?? [];
  for (const city of cities) {
    cityCountryMap[city] = country;
  }
}

console.log(`Niches: ${NICHES.length}`);
console.log(`Cities: ${Object.keys(cityCountryMap).length}`);
console.log(`Total queries: ${NICHES.length * Object.keys(cityCountryMap).length}`);

const payload = {
  niches: NICHES,
  cityCountryMap,
  targetVolume: 5000,
  maxReviews: 25,
  includePhone: true,
};

const res = await fetch("http://localhost:5000/api/sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-user-id": "2",
  },
  body: JSON.stringify(payload),
});

const data = await res.json();
if (res.ok) {
  console.log("✅ Scrape launched! Session ID:", data.session?.id);
  console.log("Status:", data.session?.status);
} else {
  console.error("❌ Failed:", data);
}
