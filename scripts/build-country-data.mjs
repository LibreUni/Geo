import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import countries from "world-countries";

const require = createRequire(import.meta.url);
const fallbackPopulationRows = require("country-json/src/country-by-population.json");

const WORLD_BANK_POPULATION_URL =
  "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=2024&per_page=400";

const primaryLanguageOverrides = {
  AGO: ["Portuguese"],
  AND: ["Catalan"],
  BEL: ["Dutch", "French", "German"],
  BLZ: ["English"],
  CAN: ["English", "French"],
  CHE: ["German", "French", "Italian", "Romansh"],
  COM: ["Comorian", "Arabic", "French"],
  CPV: ["Portuguese"],
  DNK: ["Danish"],
  ERI: ["Tigrinya", "Arabic", "English"],
  ETH: ["Amharic"],
  FRO: ["Faroese", "Danish"],
  GRL: ["Greenlandic", "Danish"],
  IRL: ["English", "Irish"],
  ISR: ["Hebrew", "Arabic"],
  LUX: ["Luxembourgish", "French", "German"],
  MUS: ["Mauritian Creole", "English", "French"],
  NOR: ["Norwegian"],
  SGP: ["English", "Malay", "Mandarin", "Tamil"],
  SOM: ["Somali", "Arabic"],
  STP: ["Portuguese"],
  SYC: ["Seychellois Creole", "English", "French"],
  TLS: ["Tetum", "Portuguese"],
  ZAF: ["Zulu", "Xhosa", "Afrikaans", "English"],
};

const mapNameAliases = {
  CPV: "Cabo Verde",
  COD: "Dem. Rep. Congo",
  COG: "Congo",
  CZE: "Czechia",
  SWZ: "eSwatini",
  USA: "United States of America",
};

const fallbackPopulationNameAliases = {
  "Pitcairn Islands": "Pitcairn",
  "Saint Helena, Ascension and Tristan da Cunha": "Saint Helena",
  "South Georgia": "South Georgia and the South Sandwich Islands",
  "Vatican City": "Holy See (Vatican City State)",
};

const supplementalPopulationFallbacks = {
  "Åland Islands": 30129,
  "Caribbean Netherlands": 30397,
  "French Southern and Antarctic Lands": 400,
  Guernsey: 67556,
  Jersey: 103267,
  Réunion: 885700,
  "Saint Barthélemy": 10967,
  Taiwan: 23420442,
};

const sovereigntyByCode = {
  AIA: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  ALA: {
    label: "Autonomous region",
    sovereignState: "Finland",
  },
  ASM: {
    label: "Unincorporated territory",
    sovereignState: "United States",
  },
  ATA: {
    label: "Antarctic Treaty area",
    note: "No country has universally recognized sovereignty over Antarctica.",
  },
  ATF: {
    label: "Overseas territory",
    sovereignState: "France",
  },
  ABW: {
    label: "Constituent country",
    sovereignState: "Kingdom of the Netherlands",
  },
  BES: {
    label: "Special municipality",
    sovereignState: "Netherlands",
  },
  BLM: {
    label: "Overseas collectivity",
    sovereignState: "France",
  },
  BMU: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  BVT: {
    label: "Dependency",
    sovereignState: "Norway",
  },
  CCK: {
    label: "External territory",
    sovereignState: "Australia",
  },
  COK: {
    label: "Self-governing state in free association",
    sovereignState: "New Zealand",
    note: "Cook Islands conducts many affairs itself while maintaining free association with New Zealand.",
  },
  CUW: {
    label: "Constituent country",
    sovereignState: "Kingdom of the Netherlands",
  },
  CXR: {
    label: "External territory",
    sovereignState: "Australia",
  },
  CYM: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  FLK: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
    disputed: true,
    note: "Sovereignty is disputed by Argentina, where the islands are known as Islas Malvinas.",
  },
  FRO: {
    label: "Autonomous territory",
    sovereignState: "Kingdom of Denmark",
  },
  GGY: {
    label: "Crown Dependency",
    sovereignState: "United Kingdom",
    note: "The UK is responsible for defense and international representation.",
  },
  GIB: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
    disputed: true,
    note: "Spain disputes British sovereignty over Gibraltar.",
  },
  GLP: {
    label: "Overseas department and region",
    sovereignState: "France",
  },
  GRL: {
    label: "Autonomous territory",
    sovereignState: "Kingdom of Denmark",
  },
  GUF: {
    label: "Overseas department and region",
    sovereignState: "France",
  },
  GUM: {
    label: "Unincorporated territory",
    sovereignState: "United States",
  },
  HKG: {
    label: "Special administrative region",
    sovereignState: "China",
  },
  HMD: {
    label: "External territory",
    sovereignState: "Australia",
  },
  IMN: {
    label: "Crown Dependency",
    sovereignState: "United Kingdom",
    note: "The UK is responsible for defense and international representation.",
  },
  IOT: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
    disputed: true,
    note: "Sovereignty is disputed by Mauritius.",
  },
  JEY: {
    label: "Crown Dependency",
    sovereignState: "United Kingdom",
    note: "The UK is responsible for defense and international representation.",
  },
  MAC: {
    label: "Special administrative region",
    sovereignState: "China",
  },
  MAF: {
    label: "Overseas collectivity",
    sovereignState: "France",
  },
  MNP: {
    label: "Commonwealth in political union",
    sovereignState: "United States",
  },
  MSR: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  MTQ: {
    label: "Overseas department and region",
    sovereignState: "France",
  },
  MYT: {
    label: "Overseas department and region",
    sovereignState: "France",
    disputed: true,
    note: "Comoros disputes French sovereignty over Mayotte.",
  },
  NCL: {
    label: "Special collectivity",
    sovereignState: "France",
  },
  NCY: {
    label: "Disputed self-declared state",
    disputed: true,
    note: "Recognized only by Turkey; internationally treated as part of Cyprus.",
  },
  NFK: {
    label: "External territory",
    sovereignState: "Australia",
  },
  NIU: {
    label: "Self-governing state in free association",
    sovereignState: "New Zealand",
    note: "Niue conducts many affairs itself while maintaining free association with New Zealand.",
  },
  PCN: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  PRI: {
    label: "Unincorporated territory",
    sovereignState: "United States",
  },
  PSE: {
    label: "Disputed state",
    disputed: true,
    note: "Palestine has broad international recognition, but borders and sovereignty remain disputed.",
  },
  PYF: {
    label: "Overseas collectivity",
    sovereignState: "France",
  },
  REU: {
    label: "Overseas department and region",
    sovereignState: "France",
  },
  SGS: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
    disputed: true,
    note: "Sovereignty is disputed by Argentina.",
  },
  SHN: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  SJM: {
    label: "Norwegian territory",
    sovereignState: "Norway",
  },
  SOL: {
    label: "Disputed self-declared state",
    disputed: true,
    note: "Somaliland governs itself, but is internationally treated as part of Somalia.",
  },
  SPM: {
    label: "Overseas collectivity",
    sovereignState: "France",
  },
  SXM: {
    label: "Constituent country",
    sovereignState: "Kingdom of the Netherlands",
  },
  TCA: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  TKL: {
    label: "Dependent territory",
    sovereignState: "New Zealand",
  },
  TWN: {
    label: "Disputed state",
    disputed: true,
    note: "Taiwan is self-governed as the Republic of China; the People's Republic of China claims it.",
  },
  UMI: {
    label: "Outlying islands",
    sovereignState: "United States",
  },
  VGB: {
    label: "British overseas territory",
    sovereignState: "United Kingdom",
  },
  VIR: {
    label: "Unincorporated territory",
    sovereignState: "United States",
  },
  WLF: {
    label: "Overseas collectivity",
    sovereignState: "France",
  },
  ESH: {
    label: "Disputed territory",
    disputed: true,
    note: "Western Sahara is claimed by Morocco and by the Sahrawi Arab Democratic Republic.",
  },
  XKX: {
    label: "Disputed state",
    disputed: true,
    note: "Kosovo is recognized by many countries, while Serbia continues to claim it.",
  },
};

const supplementalCountries = [
  {
    cca3: "XKX",
    alpha2: "XK",
    ccn3: "geo:Kosovo",
    mapName: "Kosovo",
    name: "Kosovo",
    official: "Republic of Kosovo",
    capital: "Pristina",
    region: "Europe",
    subregion: "Southeast Europe",
    population: 1762000,
    area: 10887,
    primaryLanguages: ["Albanian", "Serbian"],
    otherLanguages: [],
    currencies: ["Euro"],
    emoji: "🇽🇰",
    latlng: [42.6026, 20.903],
  },
  {
    cca3: "SOL",
    alpha2: "",
    ccn3: "geo:Somaliland",
    mapName: "Somaliland",
    name: "Somaliland",
    official: "Republic of Somaliland",
    capital: "Hargeisa",
    region: "Africa",
    subregion: "Eastern Africa",
    population: 5700000,
    area: 176120,
    primaryLanguages: ["Somali", "Arabic"],
    otherLanguages: ["English"],
    currencies: ["Somaliland shilling"],
    emoji: "🏳️",
    latlng: [9.55, 44.05],
  },
  {
    cca3: "NCY",
    alpha2: "",
    ccn3: "geo:N. Cyprus",
    mapName: "N. Cyprus",
    name: "Northern Cyprus",
    official: "Turkish Republic of Northern Cyprus",
    capital: "North Nicosia",
    region: "Asia",
    subregion: "Western Asia",
    population: 390000,
    area: 3355,
    primaryLanguages: ["Turkish"],
    otherLanguages: [],
    currencies: ["Turkish lira"],
    emoji: "🏳️",
    latlng: [35.28, 33.36],
  },
];

function sovereigntyFor(code) {
  const sovereignty = sovereigntyByCode[code];
  return sovereignty ? { sovereignty } : {};
}

async function fetchPopulationLookup() {
  const response = await fetch(WORLD_BANK_POPULATION_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch World Bank population data: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload[1] : null;
  if (!Array.isArray(rows)) {
    throw new Error("World Bank population response did not include data rows");
  }

  return new Map(
    rows
      .filter((row) => /^[A-Z]{3}$/.test(row.countryiso3code) && Number.isFinite(row.value))
      .map((row) => [row.countryiso3code, row.value]),
  );
}

const fallbackPopulationByName = new Map(
  fallbackPopulationRows
    .filter((row) => typeof row.country === "string" && Number.isFinite(row.population))
    .map((row) => [row.country, row.population]),
);

function fallbackPopulationFor(country) {
  const name = country.name.common;
  const fallbackName = fallbackPopulationNameAliases[name] ?? name;
  return fallbackPopulationByName.get(fallbackName) ?? supplementalPopulationFallbacks[name] ?? 0;
}

function alpha2ToEmoji(alpha2) {
  if (!/^[A-Z]{2}$/.test(alpha2)) return "🏳️";
  return [...alpha2].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

function languageLists(country) {
  const languages = Object.values(country.languages ?? {});
  const primary = primaryLanguageOverrides[country.cca3] ?? languages.slice(0, 1);
  const primarySet = new Set(primary);
  return {
    primaryLanguages: primary,
    otherLanguages: languages.filter((language) => !primarySet.has(language)),
  };
}

const populationByCode = await fetchPopulationLookup();

function normalize(country) {
  const { primaryLanguages, otherLanguages } = languageLists(country);
  return {
    cca3: country.cca3,
    alpha2: country.cca2 ?? "",
    ccn3: country.ccn3 ?? `geo:${mapNameAliases[country.cca3] ?? country.name.common}`,
    mapName: mapNameAliases[country.cca3] ?? country.name.common,
    name: country.name.common,
    official: country.name.official,
    capital: country.capital?.[0] ?? "",
    region: country.region ?? "Unknown",
    subregion: country.subregion ?? "Unknown subregion",
    population: country.population ?? populationByCode.get(country.cca3) ?? fallbackPopulationFor(country),
    area: country.area ?? 0,
    primaryLanguages,
    otherLanguages,
    currencies: Object.values(country.currencies ?? {}).map((currency) => currency.name),
    emoji: alpha2ToEmoji(country.cca2 ?? ""),
    latlng: Array.isArray(country.latlng) && country.latlng.length >= 2 ? [country.latlng[0], country.latlng[1]] : null,
    ...sovereigntyFor(country.cca3),
  };
}

const normalizedCountries = countries
  .map(normalize)
  .filter((country) => country.name !== "Kosovo");
const byCode = new Map(normalizedCountries.map((country) => [country.cca3, country]));

for (const country of supplementalCountries) {
  byCode.set(country.cca3, { ...country, ...sovereigntyFor(country.cca3) });
}

const output = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  new URL("../src/data/countries.json", import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);
