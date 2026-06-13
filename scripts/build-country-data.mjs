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
  };
}

const normalizedCountries = countries
  .map(normalize)
  .filter((country) => country.name !== "Kosovo");
const byCode = new Map(normalizedCountries.map((country) => [country.cca3, country]));

for (const country of supplementalCountries) {
  byCode.set(country.cca3, country);
}

const output = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  new URL("../src/data/countries.json", import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);
