import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import "flag-icons/css/flag-icons.min.css";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { geoEqualEarth, geoMercator, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import countryData from "./data/countries.json";
import subdivisionsAtlas from "./data/subdivisions-shapes.json";
import subdivisionsMetadata from "./data/subdivisions-metadata.json";
import {
  CheckCircle2,
  Check,
  ChevronDown,
  ExternalLink,
  Globe2,
  HelpCircle,
  Layers,
  ListFilter,
  MapPinned,
  Maximize2,
  Menu,
  RotateCcw,
  Search,
  XCircle,
  X,
  ZoomIn,
  ZoomOut,
  Clock,
  Trophy,
  Play,
  Award,
  ArrowRight,
  Info,
  Compass,
  Repeat,
  Type,
  MoveDown,
  Settings,
} from "lucide-react";

type ViewMode = "practice" | "quiz";
type QuizMode = "locate" | "flag" | "facts";
type MapView = "borders" | "flagFills";
type ResultState = "idle" | "correct" | "wrong";
type RelationshipKind = "self" | "tension" | "mild-tension" | "ally" | "union" | "territory";
type DetailLevel = "full" | "basic" | "minimal";
type MapDetailLevel = "minimal" | "standard" | "detailed";
type ProjectionType = "equal-earth" | "mercator" | "orthographic";

const sovereignToParentCode: Record<string, string> = {
  "Finland": "FIN",
  "United States": "USA",
  "France": "FRA",
  "Netherlands": "NLD",
  "Kingdom of the Netherlands": "NLD",
  "Kingdom of Denmark": "DNK",
  "Denmark": "DNK",
  "United Kingdom": "GBR",
  "Australia": "AUS",
  "New Zealand": "NZL",
  "Norway": "NOR",
  "China": "CHN",
  "India": "IND",
  "Canada": "CAN",
  "Brazil": "BRA",
  "Russia": "RUS"
};

function getParentCode(country: Country): string | null {
  if (!country.sovereignty?.sovereignState) return null;
  return sovereignToParentCode[country.sovereignty.sovereignState] ?? null;
}

type Country = {
  cca3: string;
  alpha2: string;
  ccn3: string;
  mapName: string;
  name: string;
  official: string;
  capital: string;
  region: string;
  subregion: string;
  population: number;
  area: number;
  primaryLanguages: string[];
  otherLanguages: string[];
  currencies: string[];
  emoji: string;
  latlng: [number, number] | null;
  sovereignty?: {
    label: string;
    sovereignState?: string;
    disputed?: boolean;
    note?: string;
  };
  wikipedia?: {
    title: string;
    summary: string;
    sourceUrl: string;
  };
  emblemUrl?: string | null;
  established?: string | null;
  highestPoint?: string | null;
  namedAfter?: string | null;
};

type Geography = GeoJSON.Feature<GeoJSON.Geometry, { id?: string; name?: string }>;
type MapGeometry = {
  id: string;
  clipId: string;
  name: string;
  d?: string;
  area: number;
  bounds: [[number, number], [number, number]];
  centroid: [number, number] | null;
};

const WIDTH = 1100;
const HEIGHT = 620;
const MIN_MAP_ZOOM = 0.82;
const MAX_MAP_ZOOM = 120;
const MAX_COUNTRY_HIT_AREA = WIDTH * HEIGHT * 0.6;
const SMALL_COUNTRY_HIT_AREA = 16;
const SMALL_COUNTRY_HIT_RADIUS = 9;
const MIN_SMALL_COUNTRY_HIT_RADIUS = 0.65;
const QUIZ_SMALL_COUNTRY_MARKER_SCALE_LIMIT = 11;
const BASE_COUNTRY_STROKE_WIDTH = 0.55;
const MIN_COUNTRY_STROKE_WIDTH = 0.08;

const usStateNameToCode: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
  "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
  "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
  "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
  "District of Columbia": "DC"
};

const baseGeographies = (
  feature(
    atlas as unknown as Parameters<typeof feature>[0],
    (atlas as { objects: { countries: unknown } }).objects.countries as Parameters<typeof feature>[1],
  ) as GeoJSON.FeatureCollection<GeoJSON.Geometry, { id?: string; name?: string }>
).features as Geography[];

function geoId(geo: Geography) {
  const rawId = geo.id;
  if (rawId !== undefined && rawId !== null) {
    const s = String(rawId);
    return /^\d+$/.test(s) ? s.padStart(3, "0") : s;
  }
  return `geo:${geo.properties?.name ?? "Unknown"}`;
}

function clipId(id: string) {
  return `flag-clip-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const baseGeographyIds = new Set(baseGeographies.map(geoId));

const subdivisionsGeographies = (subdivisionsAtlas.features || []) as Geography[];
const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const formatArea = (area: number) => `${formatNumber.format(Math.round(area))} km2`;
const RUSSIA_SUBDIVISION_REGION = "Russia (Federal Subjects)";
const LEGACY_RUSSIA_SUBDIVISION_REGION = "Russia (Republics)";
const regions = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania", "Antarctic", "United States (States)", "Canada (Provinces/Territories)", RUSSIA_SUBDIVISION_REGION];

function isRussiaSubdivisionRegion(region: string) {
  return region === RUSSIA_SUBDIVISION_REGION || region === LEGACY_RUSSIA_SUBDIVISION_REGION;
}

const russianRepublicIsoCodes = new Set([
  "RU-AD", "RU-AL", "RU-BA", "RU-BU", "RU-CE", "RU-CU", "RU-DA", "RU-IN",
  "RU-KB", "RU-KC", "RU-KK", "RU-KL", "RU-KO", "RU-KR", "RU-ME", "RU-MO",
  "RU-SA", "RU-SE", "RU-TA", "RU-TY", "RU-UD", "RU-CRI",
]);

const russianFederalCityIsoCodes = new Set(["RU-MOW", "RU-SPE", "RU-SEV"]);
const russianAutonomousOkrugIsoCodes = new Set(["RU-KHM", "RU-NEN", "RU-CHU", "RU-YAN"]);
const russianAutonomousOblastIsoCodes = new Set(["RU-YEV"]);
const russianKraiIsoCodes = new Set(["RU-ALT", "RU-KAM", "RU-KHA", "RU-KDA", "RU-KYA", "RU-PER", "RU-PRI", "RU-STA", "RU-ZAB"]);

const russianEuropeIsoCodes = new Set([
  "RU-AD", "RU-ARK", "RU-AST", "RU-BA", "RU-BEL", "RU-BRY", "RU-CE", "RU-CRI",
  "RU-CU", "RU-DA", "RU-IN", "RU-IVA", "RU-KB", "RU-KC", "RU-KDA", "RU-KGD",
  "RU-KIR", "RU-KL", "RU-KLU", "RU-KO", "RU-KOS", "RU-KR", "RU-KRS", "RU-LEN",
  "RU-LIP", "RU-ME", "RU-MO", "RU-MOW", "RU-MOS", "RU-MUR", "RU-NEN", "RU-NGR",
  "RU-NIZ", "RU-ORL", "RU-ORE", "RU-PE", "RU-PNZ", "RU-PSK", "RU-ROS", "RU-RYA",
  "RU-SA", "RU-SAM", "RU-SAR", "RU-SE", "RU-SEV", "RU-SMO", "RU-SPE", "RU-STA",
  "RU-TA", "RU-TAM", "RU-TUL", "RU-TVE", "RU-UD", "RU-ULY", "RU-VGG", "RU-VLA",
  "RU-VLG", "RU-VOR", "RU-YAR",
]);

const russianShapeNameOverrides: Record<string, string> = {
  "RU-AD": "Adygea",
  "RU-AL": "Altai Republic",
  "RU-ARK": "Arkhangelsk Oblast",
  "RU-AST": "Astrakhan Oblast",
  "RU-BU": "Buryatia",
  "RU-CE": "Chechnya",
  "RU-CHU": "Chukotka Autonomous Okrug",
  "RU-CU": "Chuvashia",
  "RU-KB": "Kabardino-Balkaria",
  "RU-KC": "Karachay-Cherkessia",
  "RU-KDA": "Krasnodar Krai",
  "RU-KGD": "Kaliningrad Oblast",
  "RU-KHA": "Khabarovsk Krai",
  "RU-KHM": "Khanty-Mansi Autonomous Okrug",
  "RU-KK": "Khakassia",
  "RU-KL": "Kalmykia",
  "RU-KR": "Karelia",
  "RU-KYA": "Krasnoyarsk Krai",
  "RU-ME": "Mari El",
  "RU-MO": "Mordovia",
  "RU-MOW": "Moscow",
  "RU-MOS": "Moscow Oblast",
  "RU-NIZ": "Nizhny Novgorod Oblast",
  "RU-ORE": "Orenburg Oblast",
  "RU-ORL": "Oryol Oblast",
  "RU-PER": "Perm Krai",
  "RU-PRI": "Primorsky Krai",
  "RU-SE": "North Ossetia-Alania",
  "RU-SEV": "Sevastopol",
  "RU-SPE": "Saint Petersburg",
  "RU-TVE": "Tver Oblast",
  "RU-TY": "Tuva",
  "RU-TYU": "Tyumen Oblast",
  "RU-UD": "Udmurtia",
  "RU-ULY": "Ulyanovsk Oblast",
  "RU-YAN": "Yamalo-Nenets Autonomous Okrug",
  "RU-YEV": "Jewish Autonomous Oblast",
  "RU-ZAB": "Zabaykalsky Krai",
};

function russianSubdivisionType(iso: string) {
  if (russianRepublicIsoCodes.has(iso)) return "Republic of Russia";
  if (russianFederalCityIsoCodes.has(iso)) return "Federal city of Russia";
  if (russianAutonomousOkrugIsoCodes.has(iso)) return "Autonomous okrug of Russia";
  if (russianAutonomousOblastIsoCodes.has(iso)) return "Autonomous oblast of Russia";
  if (russianKraiIsoCodes.has(iso)) return "Krai of Russia";
  return "Oblast of Russia";
}

function russianSubdivisionName(iso: string, name: string) {
  if (russianShapeNameOverrides[iso]) return russianShapeNameOverrides[iso];
  if (russianRepublicIsoCodes.has(iso) || russianFederalCityIsoCodes.has(iso) || russianAutonomousOkrugIsoCodes.has(iso) || russianAutonomousOblastIsoCodes.has(iso) || russianKraiIsoCodes.has(iso)) {
    return name;
  }
  return `${name.replace(/'$/, "")} Oblast`;
}

function makeRussiaSubdivisionFromShape(geo: Geography): any | null {
  const iso = String(geo.properties?.id ?? "");
  if (!iso.startsWith("RU-")) return null;
  const name = russianSubdivisionName(iso, geo.properties?.name ?? iso);
  const region = russianEuropeIsoCodes.has(iso) ? "Europe" : "Asia";
  return {
    wikiId: "",
    name,
    iso,
    capital: "",
    population: 0,
    area: 0,
    wikipediaTitle: name,
    parent: "RUS",
    wikipedia: {
      title: name,
      summary: `${name} is a federal subject of Russia.`,
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replaceAll(" ", "_"))}`,
    },
    emblemUrl: null,
    established: null,
    highestPoint: null,
    namedAfter: null,
    inferredRegion: region,
  };
}

type Phrase = { english: string; local: string; phonetic: string };

const phrasebookByLanguage: Record<string, { language: string; phrases: Phrase[] }> = {
  Afrikaans: {
    language: "Afrikaans",
    phrases: [
      { english: "Hello", local: "Hallo", phonetic: "hahl-loh" },
      { english: "Thank you", local: "Dankie", phonetic: "dahn-kee" },
      { english: "Please", local: "Asseblief", phonetic: "ahs-seh-bleef" },
    ],
  },
  Albanian: {
    language: "Albanian",
    phrases: [
      { english: "Hello", local: "Përshëndetje", phonetic: "pur-shun-det-yeh" },
      { english: "Thank you", local: "Faleminderit", phonetic: "fah-leh-meen-deh-reet" },
      { english: "Please", local: "Ju lutem", phonetic: "yoo loo-tem" },
    ],
  },
  Amharic: {
    language: "Amharic",
    phrases: [
      { english: "Hello", local: "ሰላም (Selam)", phonetic: "seh-lahm" },
      { english: "Thank you", local: "አመሰግናለሁ (Ameseginalehu)", phonetic: "ah-meh-seh-ghee-nah-leh-hoo" },
      { english: "Please", local: "እባክህ (Ebakeh)", phonetic: "eh-bah-kih" },
    ],
  },
  Arabic: {
    language: "Arabic",
    phrases: [
      { english: "Hello", local: "مرحباً (Marhaban)", phonetic: "mar-hah-bahn" },
      { english: "Thank you", local: "شكراً (Shukran)", phonetic: "shoo-kran" },
      { english: "Please", local: "من فضلك (Min fadlik)", phonetic: "meen fad-leek" },
    ],
  },
  Armenian: {
    language: "Armenian",
    phrases: [
      { english: "Hello", local: "Բարև (Barev)", phonetic: "bah-rev" },
      { english: "Thank you", local: "Շնորհակալություն (Shnorhakalutyun)", phonetic: "shnohr-hah-kah-loo-tyoon" },
      { english: "Please", local: "Խնդրեմ (Khndrem)", phonetic: "khuhn-drem" },
    ],
  },
  Azerbaijani: {
    language: "Azerbaijani",
    phrases: [
      { english: "Hello", local: "Salam", phonetic: "sah-lahm" },
      { english: "Thank you", local: "Təşəkkür edirəm", phonetic: "tah-shah-kyur eh-dee-rahm" },
      { english: "Please", local: "Zəhmət olmasa", phonetic: "zah-maht ohl-mah-sah" },
    ],
  },
  Bengali: {
    language: "Bengali",
    phrases: [
      { english: "Hello", local: "নমস্কার (Nomoskar)", phonetic: "noh-moh-shkar" },
      { english: "Thank you", local: "ধন্যবাদ (Dhonnobad)", phonetic: "dhon-noh-bahd" },
      { english: "Please", local: "দয়া করে (Doya kore)", phonetic: "doy-ah koh-reh" },
    ],
  },
  Catalan: {
    language: "Catalan",
    phrases: [
      { english: "Hello", local: "Hola", phonetic: "oh-lah" },
      { english: "Thank you", local: "Gràcies", phonetic: "grah-syahs" },
      { english: "Please", local: "Si us plau", phonetic: "see oos plow" },
    ],
  },
  Chinese: {
    language: "Chinese",
    phrases: [
      { english: "Hello", local: "你好 (Nǐ hǎo)", phonetic: "nee how" },
      { english: "Thank you", local: "谢谢 (Xièxiè)", phonetic: "shyeh-shyeh" },
      { english: "Please", local: "请 (Qǐng)", phonetic: "cheeng" },
    ],
  },
  Croatian: {
    language: "Croatian",
    phrases: [
      { english: "Hello", local: "Bok", phonetic: "bohk" },
      { english: "Thank you", local: "Hvala", phonetic: "hvah-lah" },
      { english: "Please", local: "Molim", phonetic: "moh-leem" },
    ],
  },
  Czech: {
    language: "Czech",
    phrases: [
      { english: "Hello", local: "Ahoj", phonetic: "ah-hoy" },
      { english: "Thank you", local: "Děkuji", phonetic: "dyeh-koo-yih" },
      { english: "Please", local: "Prosím", phonetic: "proh-seem" },
    ],
  },
  Danish: {
    language: "Danish",
    phrases: [
      { english: "Hello", local: "Hej", phonetic: "hie" },
      { english: "Thank you", local: "Tak", phonetic: "tahk" },
      { english: "Please", local: "Vær så venlig", phonetic: "vehr saw ven-lee" },
    ],
  },
  Dari: {
    language: "Dari",
    phrases: [
      { english: "Hello", local: "سلام (Salam)", phonetic: "sah-lahm" },
      { english: "Thank you", local: "تشکر (Tashakur)", phonetic: "tah-shah-koor" },
      { english: "Please", local: "لطفاً (Lotfan)", phonetic: "lot-fahn" },
    ],
  },
  Dutch: {
    language: "Dutch",
    phrases: [
      { english: "Hello", local: "Hallo", phonetic: "hahl-loh" },
      { english: "Thank you", local: "Dank je", phonetic: "dahnk yeh" },
      { english: "Please", local: "Alstublieft", phonetic: "ahl-stoo-bleeft" },
    ],
  },
  English: {
    language: "English",
    phrases: [
      { english: "Hello", local: "Hello", phonetic: "heh-loh" },
      { english: "Thank you", local: "Thank you", phonetic: "thangk yoo" },
      { english: "Please", local: "Please", phonetic: "pleez" },
    ],
  },
  Estonian: {
    language: "Estonian",
    phrases: [
      { english: "Hello", local: "Tere", phonetic: "teh-reh" },
      { english: "Thank you", local: "Aitäh", phonetic: "ie-tah" },
      { english: "Please", local: "Palun", phonetic: "pah-loon" },
    ],
  },
  Finnish: {
    language: "Finnish",
    phrases: [
      { english: "Hello", local: "Hei", phonetic: "hay" },
      { english: "Thank you", local: "Kiitos", phonetic: "kee-tohs" },
      { english: "Please", local: "Ole hyvä", phonetic: "oh-leh huu-vah" },
    ],
  },
  French: {
    language: "French",
    phrases: [
      { english: "Hello", local: "Bonjour", phonetic: "bohn-zhoor" },
      { english: "Thank you", local: "Merci", phonetic: "mair-see" },
      { english: "Please", local: "S'il vous plaît", phonetic: "seel voo pleh" },
    ],
  },
  Georgian: {
    language: "Georgian",
    phrases: [
      { english: "Hello", local: "გამარჯობა (Gamarjoba)", phonetic: "gah-mar-joh-bah" },
      { english: "Thank you", local: "მადლობა (Madloba)", phonetic: "mahd-loh-bah" },
      { english: "Please", local: "თუ შეიძლება (Tu sheidzleba)", phonetic: "too shayd-zleh-bah" },
    ],
  },
  German: {
    language: "German",
    phrases: [
      { english: "Hello", local: "Hallo", phonetic: "hahl-loh" },
      { english: "Thank you", local: "Danke", phonetic: "dahn-keh" },
      { english: "Please", local: "Bitte", phonetic: "bee-teh" },
    ],
  },
  Greek: {
    language: "Greek",
    phrases: [
      { english: "Hello", local: "Γεια σας (Yassas)", phonetic: "yah-sahs" },
      { english: "Thank you", local: "Ευχαριστώ (Efcharisto)", phonetic: "ef-khah-ree-stoh" },
      { english: "Please", local: "Παρακαλώ (Parakalo)", phonetic: "pah-rah-kah-loh" },
    ],
  },
  Hebrew: {
    language: "Hebrew",
    phrases: [
      { english: "Hello", local: "שלום (Shalom)", phonetic: "shah-lohm" },
      { english: "Thank you", local: "תوده (Toda)", phonetic: "toh-dah" },
      { english: "Please", local: "בבקשה (Bevakasha)", phonetic: "beh-vah-kah-shah" },
    ],
  },
  Hindi: {
    language: "Hindi",
    phrases: [
      { english: "Hello", local: "नमस्ते (Namaste)", phonetic: "nuh-mus-tay" },
      { english: "Thank you", local: "धन्यवाद (Dhanyavaad)", phonetic: "dhun-yuh-vaad" },
      { english: "Please", local: "कृपया (Kripya)", phonetic: "krip-yuh" },
    ],
  },
  Hungarian: {
    language: "Hungarian",
    phrases: [
      { english: "Hello", local: "Szia", phonetic: "see-oh" },
      { english: "Thank you", local: "Köszönöm", phonetic: "koe-soe-noem" },
      { english: "Please", local: "Kérem", phonetic: "kay-rem" },
    ],
  },
  Icelandic: {
    language: "Icelandic",
    phrases: [
      { english: "Hello", local: "Halló", phonetic: "hahl-loh" },
      { english: "Thank you", local: "Takk", phonetic: "tahk" },
      { english: "Please", local: "Vinsamlegast", phonetic: "veen-sahm-leh-gahst" },
    ],
  },
  Indonesian: {
    language: "Indonesian",
    phrases: [
      { english: "Hello", local: "Halo", phonetic: "hah-loh" },
      { english: "Thank you", local: "Terima kasih", phonetic: "teh-ree-mah kah-seeh" },
      { english: "Please", local: "Tolong", phonetic: "toh-lohng" },
    ],
  },
  Irish: {
    language: "Irish",
    phrases: [
      { english: "Hello", local: "Dia dhuit", phonetic: "dee-ah gwit" },
      { english: "Thank you", local: "Go raibh maith agat", phonetic: "gur-uh-mah-uh-gut" },
      { english: "Please", local: "Le do thoil", phonetic: "leh duh huh-il" },
    ],
  },
  Italian: {
    language: "Italian",
    phrases: [
      { english: "Hello", local: "Ciao", phonetic: "chow" },
      { english: "Thank you", local: "Grazie", phonetic: "grah-tsyeh" },
      { english: "Please", local: "Per favore", phonetic: "pair fah-voh-ray" },
    ],
  },
  Japanese: {
    language: "Japanese",
    phrases: [
      { english: "Hello", local: "こんにちは (Konnichiwa)", phonetic: "kohn-nee-chee-wah" },
      { english: "Thank you", local: "ありがとう (Arigatou)", phonetic: "ah-ree-gah-toh" },
      { english: "Please", local: "お願いします (Onegaishimasu)", phonetic: "oh-neh-gie-shee-mahs" },
    ],
  },
  Kazakh: {
    language: "Kazakh",
    phrases: [
      { english: "Hello", local: "Сәлем (Salem)", phonetic: "sah-lem" },
      { english: "Thank you", local: "Рақмет (Raqmet)", phonetic: "rahk-met" },
      { english: "Please", local: "Өтінемін (Otinebi)", phonetic: "oh-teen-eh-meen" },
    ],
  },
  Khmer: {
    language: "Khmer",
    phrases: [
      { english: "Hello", local: "ជំរាបសួរ (Choum reap sour)", phonetic: "chom-reap-soo-er" },
      { english: "Thank you", local: "អរគុណ (Orkun)", phonetic: "awr-koon" },
      { english: "Please", local: "សូម (Som)", phonetic: "sohm" },
    ],
  },
  Korean: {
    language: "Korean",
    phrases: [
      { english: "Hello", local: "안녕하세요 (Annyeonghaseyo)", phonetic: "ahn-nyung-hah-seh-yo" },
      { english: "Thank you", local: "감사합니다 (Gamsahamnida)", phonetic: "gahm-sah-hahm-nee-dah" },
      { english: "Please", local: "주세요 (Juseyo)", phonetic: "joo-seh-yo" },
    ],
  },
  Lao: {
    language: "Lao",
    phrases: [
      { english: "Hello", local: "ສະບາຍດີ (Sabaidee)", phonetic: "sah-bye-dee" },
      { english: "Thank you", local: "ຂอบໃຈ (Khop chai)", phonetic: "khop-chie" },
      { english: "Please", local: "ກະລຸນາ (Kaluna)", phonetic: "kah-loo-nah" },
    ],
  },
  Latvian: {
    language: "Latvian",
    phrases: [
      { english: "Hello", local: "Sveiki", phonetic: "svay-kee" },
      { english: "Thank you", local: "Paldies", phonetic: "pahl-dyehs" },
      { english: "Please", local: "Lūdzu", phonetic: "loo-dzoo" },
    ],
  },
  Lithuanian: {
    language: "Lithuanian",
    phrases: [
      { english: "Hello", local: "Labas", phonetic: "lah-bahs" },
      { english: "Thank you", local: "Ačiū", phonetic: "ah-choo" },
      { english: "Please", local: "Prašau", phonetic: "prah-show" },
    ],
  },
  Malay: {
    language: "Malay",
    phrases: [
      { english: "Hello", local: "Helo", phonetic: "heh-loh" },
      { english: "Thank you", local: "Terima kasih", phonetic: "teh-ree-mah kah-seeh" },
      { english: "Please", local: "Tolong", phonetic: "toh-lohng" },
    ],
  },
  Nepali: {
    language: "Nepali",
    phrases: [
      { english: "Hello", local: "नमस्ते (Namaste)", phonetic: "nuh-mus-tay" },
      { english: "Thank you", local: "धन्यवाद (Dhanyabad)", phonetic: "dhun-yuh-baad" },
      { english: "Please", local: "कृपया (Kripaya)", phonetic: "krip-uh-yah" },
    ],
  },
  Norwegian: {
    language: "Norwegian",
    phrases: [
      { english: "Hello", local: "Hei", phonetic: "hay" },
      { english: "Thank you", local: "Takk", phonetic: "tahk" },
      { english: "Please", local: "Vær så snill", phonetic: "vehr saw sneel" },
    ],
  },
  Pashto: {
    language: "Pashto",
    phrases: [
      { english: "Hello", local: "سلام (Salam)", phonetic: "sah-lahm" },
      { english: "Thank you", local: "مننه (Manana)", phonetic: "mah-nah-nah" },
      { english: "Please", local: "مهرباني وکړه (Mehrabani wakra)", phonetic: "meh-ruh-bah-nee wuk-ruh" },
    ],
  },
  Persian: {
    language: "Persian",
    phrases: [
      { english: "Hello", local: "سلام (Salam)", phonetic: "sah-lahm" },
      { english: "Thank you", local: "ممنون (Mamnoon)", phonetic: "mahm-noon" },
      { english: "Please", local: "لطفاً (Lotfan)", phonetic: "lot-fahn" },
    ],
  },
  Polish: {
    language: "Polish",
    phrases: [
      { english: "Hello", local: "Cześć", phonetic: "cheshch" },
      { english: "Thank you", local: "Dziękuję", phonetic: "djen-koo-yeh" },
      { english: "Please", local: "Proszę", phonetic: "proh-sheh" },
    ],
  },
  Portuguese: {
    language: "Portuguese",
    phrases: [
      { english: "Hello", local: "Olá", phonetic: "oh-lah" },
      { english: "Thank you", local: "Obrigado", phonetic: "oh-bree-gah-doh" },
      { english: "Please", local: "Por favor", phonetic: "poor fah-vohr" },
    ],
  },
  Romanian: {
    language: "Romanian",
    phrases: [
      { english: "Hello", local: "Salut", phonetic: "sah-loot" },
      { english: "Thank you", local: "Mulțumesc", phonetic: "mool-tsoo-mesk" },
      { english: "Please", local: "Vă rog", phonetic: "vuh rohg" },
    ],
  },
  Russian: {
    language: "Russian",
    phrases: [
      { english: "Hello", local: "Привет (Privet)", phonetic: "pree-vyet" },
      { english: "Thank you", local: "Спасибо (Spasibo)", phonetic: "spah-see-bah" },
      { english: "Please", local: "Пожалуйста (Pozhaluysta)", phonetic: "pah-zhahl-oo-stah" },
    ],
  },
  Serbian: {
    language: "Serbian",
    phrases: [
      { english: "Hello", local: "Здраво (Zdravo)", phonetic: "zdrah-voh" },
      { english: "Thank you", local: "Хвала (Hvala)", phonetic: "hvah-lah" },
      { english: "Please", local: "Молим (Molim)", phonetic: "moh-leem" },
    ],
  },
  Slovak: {
    language: "Slovak",
    phrases: [
      { english: "Hello", local: "Ahoj", phonetic: "ah-hoy" },
      { english: "Thank you", local: "Ďakujem", phonetic: "jah-koo-yem" },
      { english: "Please", local: "Prosím", phonetic: "proh-seem" },
    ],
  },
  Slovene: {
    language: "Slovene",
    phrases: [
      { english: "Hello", local: "Živjo", phonetic: "zheev-yoh" },
      { english: "Thank you", local: "Hvala", phonetic: "hvah-lah" },
      { english: "Please", local: "Prosim", phonetic: "proh-seem" },
    ],
  },
  Somali: {
    language: "Somali",
    phrases: [
      { english: "Hello", local: "Salaan", phonetic: "sah-lahn" },
      { english: "Thank you", local: "Mahadsanid", phonetic: "mah-hahd-sah-need" },
      { english: "Please", local: "Fadlan", phonetic: "fahd-lahn" },
    ],
  },
  Spanish: {
    language: "Spanish",
    phrases: [
      { english: "Hello", local: "Hola", phonetic: "oh-lah" },
      { english: "Thank you", local: "Gracias", phonetic: "grah-syahs" },
      { english: "Please", local: "Por favor", phonetic: "poor fah-vohr" },
    ],
  },
  Swahili: {
    language: "Swahili",
    phrases: [
      { english: "Hello", local: "Hujambo", phonetic: "hoo-jahm-boh" },
      { english: "Thank you", local: "Asante", phonetic: "ah-sahn-teh" },
      { english: "Please", local: "Tafadhali", phonetic: "tah-fah-dhah-lee" },
    ],
  },
  Swedish: {
    language: "Swedish",
    phrases: [
      { english: "Hello", local: "Hej", phonetic: "hey" },
      { english: "Thank you", local: "Tack", phonetic: "tahk" },
      { english: "Please", local: "Snälla", phonetic: "sneh-lah" },
    ],
  },
  Tamil: {
    language: "Tamil",
    phrases: [
      { english: "Hello", local: "வணக்கம் (Vanakkam)", phonetic: "vah-nahk-kahm" },
      { english: "Thank you", local: "நன்றி (Nandri)", phonetic: "nahn-dree" },
      { english: "Please", local: "தயவு செய்து (Dayavu seithu)", phonetic: "dah-yah-voo say-dhoo" },
    ],
  },
  Thai: {
    language: "Thai",
    phrases: [
      { english: "Hello", local: "สวัสดี (Sawatdee)", phonetic: "sah-wahd-dee" },
      { english: "Thank you", local: "ขอบคุณ (Khop khun)", phonetic: "khop-khoon" },
      { english: "Please", local: "กรุณา (Karuna)", phonetic: "kah-roo-nah" },
    ],
  },
  Turkish: {
    language: "Turkish",
    phrases: [
      { english: "Hello", local: "Merhaba", phonetic: "mair-hah-bah" },
      { english: "Thank you", local: "Teşekkürler", phonetic: "teh-sheh-kyur-ler" },
      { english: "Please", local: "Lütfen", phonetic: "lyoot-fen" },
    ],
  },
  Ukrainian: {
    language: "Ukrainian",
    phrases: [
      { english: "Hello", local: "Привіт (Pryvit)", phonetic: "pree-veet" },
      { english: "Thank you", local: "Дякую (Dyakuyu)", phonetic: "dyah-koo-yoo" },
      { english: "Please", local: "Будь ласка (Bud laska)", phonetic: "bood lahs-kah" },
    ],
  },
  Urdu: {
    language: "Urdu",
    phrases: [
      { english: "Hello", local: "اسلام علیکم (Assalam-o-alaikum)", phonetic: "uh-suh-laam-o-uh-lay-kum" },
      { english: "Thank you", local: "شکریہ (Shukriya)", phonetic: "shoo-kree-yah" },
      { english: "Please", local: "براہ مہربانی (Barah-e-meharbani)", phonetic: "bah-raah-ay-meh-hur-bah-nee" },
    ],
  },
  Vietnamese: {
    language: "Vietnamese",
    phrases: [
      { english: "Hello", local: "Xin chào", phonetic: "seen chow" },
      { english: "Thank you", local: "Cảm ơn", phonetic: "kahm uhn" },
      { english: "Please", local: "Làm ơn", phonetic: "lahm uhn" },
    ],
  },
  Zulu: {
    language: "Zulu",
    phrases: [
      { english: "Hello", local: "Sawubona", phonetic: "sah-woo-boh-nah" },
      { english: "Thank you", local: "Ngiyabonga", phonetic: "ngee-yah-boh-ngah" },
      { english: "Please", local: "Ngiyacela", phonetic: "ngee-yah-cheh-lah" },
    ],
  },
};

const unionGroups = {
  "European Union": ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"],
  "African Union": ["DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CMR", "CPV", "CAF", "TCD", "COM", "COG", "COD", "CIV", "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR", "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN", "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE", "ESH"],
  ASEAN: ["BRN", "KHM", "IDN", "LAO", "MYS", "MMR", "PHL", "SGP", "THA", "VNM"],
  Mercosur: ["ARG", "BRA", "PRY", "URY", "BOL"],
  CARICOM: ["ATG", "BHS", "BRB", "BLZ", "DMA", "GRD", "GUY", "HTI", "JAM", "MSR", "KNA", "LCA", "VCT", "SUR", "TTO"],
  "Gulf Cooperation Council": ["BHR", "KWT", "OMN", "QAT", "SAU", "ARE"],
};

const allyGroups = {
  NATO: ["ALB", "BEL", "BGR", "CAN", "HRV", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "ITA", "LVA", "LTU", "LUX", "MNE", "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE", "TUR", "GBR", "USA"],
};

type TensionType = "active" | "historical";
type TensionDetail = {
  countries: [string, string];
  type: TensionType;
  label: string;
};

const tensionsList: TensionDetail[] = [
  { countries: ["RUS", "UKR"], type: "active", label: "War & Invasion" },
  { countries: ["ISR", "PSE"], type: "active", label: "Israeli-Palestinian Conflict" },
  { countries: ["ARM", "AZE"], type: "active", label: "Nagorno-Karabakh Conflict" },
  { countries: ["KOR", "PRK"], type: "active", label: "Korean Division & Conflict" },
  { countries: ["CHN", "TWN"], type: "active", label: "Cross-Strait Dispute (Taiwan)" },
  { countries: ["SRB", "XKX"], type: "active", label: "Kosovo Sovereignty Dispute" },
  { countries: ["IND", "PAK"], type: "active", label: "Kashmir Border Conflict" },
  { countries: ["ARG", "GBR"], type: "historical", label: "Falkland Islands Dispute" },
  { countries: ["ARG", "FLK"], type: "historical", label: "Falkland Islands Dispute" },
  { countries: ["CHN", "IND"], type: "historical", label: "Sino-Indian Border Dispute" },
  { countries: ["CYP", "NCY"], type: "historical", label: "Northern Cyprus Dispute" },
  { countries: ["TUR", "NCY"], type: "historical", label: "Northern Cyprus Control" },
  { countries: ["GRC", "TUR"], type: "historical", label: "Aegean & Maritime Dispute" },
  { countries: ["GUY", "VEN"], type: "historical", label: "Guayana Esequiba Dispute" },
  { countries: ["JPN", "RUS"], type: "historical", label: "Kuril Islands Dispute" },
  { countries: ["MAR", "ESH"], type: "historical", label: "Western Sahara Conflict" },
  { countries: ["PAK", "SIA"], type: "active", label: "Siachen Glacier Dispute" },
];

function getTensionLabel(selectedCode: string, otherCode: string, otherName: string, detail: TensionDetail): string {
  const pairKey = [selectedCode, otherCode].sort().join("-");
  switch (pairKey) {
    case "RUS-UKR":
      return selectedCode === "RUS"
        ? "Invasion of Ukraine / War (since 2022)"
        : "Defending invasion by Russia / War (since 2022)";
    case "ISR-PSE":
      return selectedCode === "ISR" ? "Conflict with Palestine" : "Conflict with Israel";
    case "ARM-AZE":
      return `Nagorno-Karabakh Conflict with ${otherName}`;
    case "KOR-PRK":
      return `Conflict & split with ${otherName}`;
    case "CHN-TWN":
      return selectedCode === "CHN" ? "Sovereignty dispute over Taiwan" : "Sovereignty dispute with China";
    case "SRB-XKX":
      return selectedCode === "SRB" ? "Dispute over Kosovo's independence" : "Sovereignty dispute with Serbia";
    case "IND-PAK":
      return `Kashmir border conflict with ${otherName}`;
    case "ARG-GBR":
    case "ARG-FLK":
      if (selectedCode === "FLK") return "Sovereignty dispute between Argentina and UK";
      return `Falkland Islands dispute with ${otherName}`;
    case "FLK-GBR":
      return "Territory relationship (Falkland Islands & UK)";
    case "CHN-IND":
      return `Border dispute with ${otherName}`;
    case "CYP-NCY":
    case "NCY-TUR":
      if (selectedCode === "NCY") {
        return otherCode === "TUR" ? "Dependent on / supported by Turkey" : "Partition dispute with Cyprus";
      }
      if (selectedCode === "TUR") return "Military support / control of Northern Cyprus";
      return `Partition dispute with ${otherName}`;
    case "GRC-TUR":
      return `Aegean maritime disputes with ${otherName}`;
    case "GUY-VEN":
      return `Guayana Esequiba border dispute with ${otherName}`;
    case "JPN-RUS":
      return `Kuril Islands dispute with ${otherName}`;
    case "ESH-MAR":
      return selectedCode === "MAR" ? "Western Sahara conflict / control" : "Western Sahara sovereignty dispute with Morocco";
    case "PAK-SIA":
      return selectedCode === "PAK" ? "Sovereignty dispute over Siachen Glacier" : "Sovereignty dispute with Pakistan";
    default:
      return `${detail.label} with ${otherName}`;
  }
}

function hasActiveTension(selectedCode: string, code: string) {
  return tensionsList.some(
    (t) => t.type === "active" && t.countries.includes(selectedCode) && t.countries.includes(code)
  );
}

function hasHistoricalTension(selectedCode: string, code: string) {
  return tensionsList.some(
    (t) => t.type === "historical" && t.countries.includes(selectedCode) && t.countries.includes(code)
  );
}


function findPhrasebook(country: Country) {
  // Try to find a non-English primary language with a phrasebook first
  let language = country.primaryLanguages.find((lang) => lang !== "English" && phrasebookByLanguage[lang]);
  // If not found, try to find a non-English other language with a phrasebook
  if (!language) {
    language = country.otherLanguages.find((lang) => lang !== "English" && phrasebookByLanguage[lang]);
  }
  return language ? phrasebookByLanguage[language] : undefined;
}

function sharedGroupName(groups: Record<string, string[]>, selectedCode: string, code: string) {
  return Object.entries(groups).find(([, members]) => members.includes(selectedCode) && members.includes(code))?.[0] ?? null;
}

function hasTerritoryRelationship(selectedCountry: Country, country: Country) {
  const selectedSovereign = selectedCountry.sovereignty?.sovereignState;
  const countrySovereign = country.sovereignty?.sovereignState;
  return (
    selectedSovereign === country.name ||
    countrySovereign === selectedCountry.name ||
    (Boolean(selectedSovereign) && selectedSovereign === countrySovereign)
  );
}

function relationshipKind(selectedCountry: Country | null, country: Country | undefined): RelationshipKind | null {
  if (!selectedCountry || !country) return null;
  if (country.cca3 === selectedCountry.cca3) return "self";
  if (hasActiveTension(selectedCountry.cca3, country.cca3)) return "tension";
  if (hasHistoricalTension(selectedCountry.cca3, country.cca3)) return "mild-tension";
  if (sharedGroupName(allyGroups, selectedCountry.cca3, country.cca3)) return "ally";
  if (sharedGroupName(unionGroups, selectedCountry.cca3, country.cca3)) return "union";
  if (hasTerritoryRelationship(selectedCountry, country)) return "territory";
  return null;
}

function relationshipLabel(selectedCountry: Country, country: Country, kind: RelationshipKind) {
  if (kind === "self") return "Selected country";
  if (kind === "tension") return "Dispute or major diplomatic tension";
  if (kind === "mild-tension") return "Mild or historical dispute/tension";
  if (kind === "ally") return sharedGroupName(allyGroups, selectedCountry.cca3, country.cca3) ?? "Shared alliance";
  if (kind === "union") return sharedGroupName(unionGroups, selectedCountry.cca3, country.cca3) ?? "Shared union";
  return "Sovereignty or territory link";
}

function relationshipSummary(selectedCountry: Country, countries: Country[]) {
  const rows = countries
    .map((country) => {
      const kind = relationshipKind(selectedCountry, country);
      return kind && kind !== "self" ? { country, kind, label: relationshipLabel(selectedCountry, country, kind) } : null;
    })
    .filter((row): row is { country: Country; kind: Exclude<RelationshipKind, "self">; label: string } => Boolean(row));

  return {
    tensions: rows.filter((row) => row.kind === "tension"),
    mildTensions: rows.filter((row) => row.kind === "mild-tension"),
    allies: rows.filter((row) => row.kind === "ally"),
    unions: rows.filter((row) => row.kind === "union" || row.kind === "territory"),
  };
}

function pickRandom<T>(items: T[], except?: T): T {
  const pool = except ? items.filter((item) => item !== except) : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function App() {
  const [mapDetailLevel, setMapDetailLevel] = useState<MapDetailLevel>(() => {
    try {
      const saved = localStorage.getItem("geolearn_map_detail_level");
      if (saved === "minimal" || saved === "standard" || saved === "detailed") {
        return saved;
      }
    } catch (e) {
      console.error("Failed to load map detail level", e);
    }
    return "standard";
  });

  useEffect(() => {
    try {
      localStorage.setItem("geolearn_map_detail_level", mapDetailLevel);
    } catch (e) {
      console.error("Failed to save map detail level", e);
    }
  }, [mapDetailLevel]);

  const countries = useMemo(() => {
    const base = (countryData as Country[]).filter((c) => c.ccn3 && baseGeographyIds.has(c.ccn3));
    
    if (mapDetailLevel === "minimal") {
      return base.filter(c => !getParentCode(c));
    }
    
    if (mapDetailLevel === "detailed") {
      const baseFiltered = base.filter(c => c.cca3 !== "USA" && c.cca3 !== "CAN" && c.cca3 !== "AUS" && c.cca3 !== "BRA" && c.cca3 !== "RUS");
      const subdivisionRows = [...(subdivisionsMetadata as any[])];
      const metadataByIso = new Set(subdivisionRows.map((sub) => sub.iso));
      subdivisionsGeographies.forEach((geo) => {
        const fallback = makeRussiaSubdivisionFromShape(geo);
        if (fallback && !metadataByIso.has(fallback.iso)) {
          subdivisionRows.push(fallback);
          metadataByIso.add(fallback.iso);
        }
      });
      
      const subsMapped = subdivisionRows.map(sub => {
        const pCode = sub.parent;
        let parentName = "";
        let alpha2 = "";
        let region = "";
        let subregion = "";
        let primaryLanguages = ["English"];
        let currencies = ["USD"];
        let emoji = "";
        let sovereigntyLabel = "";
        
        if (pCode === "USA") {
          parentName = "United States";
          alpha2 = "US";
          region = "Americas";
          subregion = "North America";
          primaryLanguages = ["English"];
          currencies = ["United States dollar"];
          emoji = "🇺🇸";
          sovereigntyLabel = "State of the USA";
        } else if (pCode === "CAN") {
          parentName = "Canada";
          alpha2 = "CA";
          region = "Americas";
          subregion = "North America";
          primaryLanguages = ["English", "French"];
          currencies = ["Canadian dollar"];
          emoji = "🇨🇦";
          sovereigntyLabel = sub.iso.startsWith("CA-NT") || sub.iso.startsWith("CA-NU") || sub.iso.startsWith("CA-YT") ? "Territory of Canada" : "Province of Canada";
        } else if (pCode === "AUS") {
          parentName = "Australia";
          alpha2 = "AU";
          region = "Oceania";
          subregion = "Australia and New Zealand";
          primaryLanguages = ["English"];
          currencies = ["Australian dollar"];
          emoji = "🇦🇺";
          sovereigntyLabel = sub.iso.startsWith("AU-NT") || sub.iso.startsWith("AU-ACT") ? "Territory of Australia" : "State of Australia";
        } else if (pCode === "BRA") {
          parentName = "Brazil";
          alpha2 = "BR";
          region = "Americas";
          subregion = "South America";
          primaryLanguages = ["Portuguese"];
          currencies = ["Brazilian real"];
          emoji = "🇧🇷";
          sovereigntyLabel = sub.iso.startsWith("BR-DF") ? "Federal District of Brazil" : "State of Brazil";
        } else if (pCode === "RUS") {
          parentName = "Russia";
          alpha2 = "RU";
          region = sub.inferredRegion || (russianEuropeIsoCodes.has(sub.iso) ? "Europe" : "Asia");
          subregion = region === "Europe" ? "Eastern Europe" : "Northern Asia";
          primaryLanguages = ["Russian"];
          currencies = ["Russian ruble"];
          emoji = "🇷🇺";
          sovereigntyLabel = russianSubdivisionType(sub.iso);
        }
        
        return {
          cca3: sub.iso,
          alpha2,
          ccn3: sub.iso,
          mapName: sub.name,
          name: sub.name,
          official: `${sub.name}, ${parentName}`,
          capital: sub.capital,
          region,
          subregion,
          population: sub.population,
          area: sub.area,
          primaryLanguages,
          otherLanguages: [],
          currencies,
          emoji,
          latlng: null,
          sovereignty: {
            label: sovereigntyLabel,
            sovereignState: parentName
          },
          wikipedia: sub.wikipedia || null,
          emblemUrl: sub.emblemUrl || null,
          established: sub.established || null,
          highestPoint: sub.highestPoint || null,
          namedAfter: sub.namedAfter || null
        };
      });
      
      return [...baseFiltered, ...subsMapped];
    }
    
    return base;
  }, [mapDetailLevel]);

  const countryByNumeric = useMemo(() => {
    const m = new Map();
    countries.forEach((country) => {
      m.set(country.ccn3, country);
    });
    
    if (mapDetailLevel === "minimal") {
      const base = (countryData as Country[]).filter((c) => c.ccn3 && baseGeographyIds.has(c.ccn3));
      base.forEach((c) => {
        const parentCode = getParentCode(c);
        if (parentCode) {
          const parent = countries.find((p) => p.cca3 === parentCode);
          if (parent) {
            m.set(c.ccn3, parent);
          }
        }
      });
    }
    
    return m;
  }, [countries, mapDetailLevel]);
  const [view, setView] = useState<ViewMode>("practice");
  const [countryBrowserOpen, setCountryBrowserOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [query, setQuery] = useState("");
  const [mapView, setMapView] = useState<MapView>("borders");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(() => {
    try {
      const saved = localStorage.getItem("geolearn_detail_level");
      if (saved === "full" || saved === "basic" || saved === "minimal") {
        return saved;
      }
    } catch (e) {
      console.error("Failed to load detail level", e);
    }
    return "full";
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("geolearn_detail_level", detailLevel);
    } catch (e) {
      console.error("Failed to save detail level", e);
    }
  }, [detailLevel]);

  const [projectionType, setProjectionType] = useState<ProjectionType>(() => {
    try {
      const saved = localStorage.getItem("geolearn_projection_type");
      if (saved === "mercator" || saved === "orthographic" || saved === "equal-earth") {
        return saved as ProjectionType;
      }
    } catch (e) {
      console.error("Failed to load projection type", e);
    }
    return "equal-earth";
  });

  const [repeatMap, setRepeatMap] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("geolearn_repeat_map");
      if (saved !== null) {
        return saved === "true";
      }
    } catch (e) {
      console.error("Failed to load repeat map", e);
    }
    return true;
  });

  const [showCountryNames, setShowCountryNames] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("geolearn_show_country_names");
      if (saved !== null) {
        return saved === "true";
      }
    } catch (e) {
      console.error("Failed to load country names option", e);
    }
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem("geolearn_projection_type", projectionType);
    } catch (e) {
      console.error("Failed to save projection type", e);
    }
  }, [projectionType]);

  useEffect(() => {
    try {
      localStorage.setItem("geolearn_repeat_map", String(repeatMap));
    } catch (e) {
      console.error("Failed to save repeat map", e);
    }
  }, [repeatMap]);

  useEffect(() => {
    try {
      localStorage.setItem("geolearn_show_country_names", String(showCountryNames));
    } catch (e) {
      console.error("Failed to save country names option", e);
    }
  }, [showCountryNames]);
  const [quizMode, setQuizMode] = useState<QuizMode>("locate");
  const [quizCountry, setQuizCountry] = useState<Country | null>(null);
  const [choices, setChoices] = useState<Country[]>([]);
  const [result, setResult] = useState<ResultState>("idle");
  const [lastGuess, setLastGuess] = useState<Country | null>(null);

  // Advanced Immersive Quiz States
  const [quizStatus, setQuizStatus] = useState<"config" | "playing" | "summary">("config");
  const [quizRegion, setQuizRegion] = useState("All");
  const [quizRemaining, setQuizRemaining] = useState<Country[]>([]);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [quizHistory, setQuizHistory] = useState<Record<string, "first-try" | "second-try" | "third-try" | "failed">>({});
  const [quizAttempts, setQuizAttempts] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [revealingTarget, setRevealingTarget] = useState(false);
  const [quizTime, setQuizTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [savedScores, setSavedScores] = useState<any[]>([]);


  const countryByCode = useMemo(
    () => new Map(countries.map((country) => [country.cca3, country])),
    [countries],
  );

  const filteredCountries = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return countries.filter((country) => {
      let regionMatch = false;
      if (selectedRegion === "United States (States)") {
        regionMatch = country.sovereignty?.sovereignState === "United States";
      } else if (selectedRegion === "Canada (Provinces/Territories)") {
        regionMatch = country.sovereignty?.sovereignState === "Canada";
      } else if (isRussiaSubdivisionRegion(selectedRegion)) {
        regionMatch = country.sovereignty?.sovereignState === "Russia" && country.cca3 !== "RUS";
      } else {
        regionMatch = selectedRegion === "All" || country.region === selectedRegion;
      }
      const queryMatch =
        !terms ||
        country.name.toLowerCase().includes(terms) ||
        country.capital.toLowerCase().includes(terms) ||
        country.subregion.toLowerCase().includes(terms) ||
        country.sovereignty?.sovereignState?.toLowerCase().includes(terms) ||
        country.sovereignty?.label.toLowerCase().includes(terms);
      return regionMatch && queryMatch;
    });
  }, [countries, query, selectedRegion]);

  const selectedCountry = selectedCode ? countryByCode.get(selectedCode) ?? null : null;
  
  const selectedRelationships = useMemo(() => {
    if (view === "quiz" && quizStatus === "playing") return null;
    if (detailLevel !== "full") return null;
    return selectedCountry ? relationshipSummary(selectedCountry, countries) : null;
  }, [countries, selectedCountry, view, quizStatus, detailLevel]);

  const currentQuizPool = useMemo(() => {
    return countries.filter((country) => {
      let isSubdivisionMode = false;
      let matchesSubdivision = false;

      if (quizRegion === "United States (States)") {
        isSubdivisionMode = true;
        matchesSubdivision = country.sovereignty?.sovereignState === "United States";
      } else if (quizRegion === "Canada (Provinces/Territories)") {
        isSubdivisionMode = true;
        matchesSubdivision = country.sovereignty?.sovereignState === "Canada";
      } else if (isRussiaSubdivisionRegion(quizRegion)) {
        isSubdivisionMode = true;
        matchesSubdivision = country.sovereignty?.sovereignState === "Russia" && country.cca3 !== "RUS";
      }

      if (isSubdivisionMode) {
        if (!matchesSubdivision) return false;
        // In flag quiz, filter out subdivisions since they do not have distinct country flags
        if (quizMode === "flag" && country.cca3.includes("-")) {
          return false;
        }
        return true;
      }

      const regionMatch = quizRegion === "All" || country.region === quizRegion;
      if (!regionMatch) return false;
      // In flag quiz, filter out subdivisions since they do not have distinct country flags
      if (quizMode === "flag" && country.cca3.includes("-")) {
        return false;
      }
      return Boolean(country.alpha2);
    });
  }, [countries, quizRegion, quizMode]);

  const quizPoolCodes = useMemo(() => {
    return new Set(currentQuizPool.map((c) => c.cca3));
  }, [currentQuizPool]);

  // Load saved scores on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("geolearn_quiz_scores");
      if (saved) {
        setSavedScores(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load quiz scores", e);
    }
  }, []);

  // Reset quiz states when switching back to practice mode
  useEffect(() => {
    if (view === "practice") {
      setQuizCountry(null);
      setQuizHistory({});
      setWrongGuesses([]);
      setRevealingTarget(false);
      setQuizRemaining([]);
      setQuizStatus("config");
      setTimerActive(false);
    }
  }, [view]);

  // Force max detail level when playing subdivision modes
  useEffect(() => {
    const isSubdivisionMode =
      quizRegion === "United States (States)" ||
      quizRegion === "Canada (Provinces/Territories)" ||
      isRussiaSubdivisionRegion(quizRegion);
    if (isSubdivisionMode && mapDetailLevel !== "detailed") {
      setMapDetailLevel("detailed");
    }
  }, [quizRegion, mapDetailLevel]);

  // Timer Effect
  useEffect(() => {
    let interval: any = null;
    if (timerActive) {
      interval = setInterval(() => {
        setQuizTime((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive]);

  function saveQuizScore(accuracy: number, correctFirst: number, total: number, timeSpent: number, history: any) {
    const newScore = {
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toLocaleDateString(),
      region: quizRegion,
      mode: quizMode,
      mapDetail: mapDetailLevel,
      correct: correctFirst,
      total: total,
      time: timeSpent,
      breakdown: {
        firstTry: Object.values(history).filter((v) => v === "first-try").length,
        secondTry: Object.values(history).filter((v) => v === "second-try").length,
        thirdTry: Object.values(history).filter((v) => v === "third-try").length,
        failed: Object.values(history).filter((v) => v === "failed").length,
      },
    };
    const updated = [newScore, ...savedScores].slice(0, 50);
    setSavedScores(updated);
    try {
      localStorage.setItem("geolearn_quiz_scores", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save quiz scores", e);
    }
  }

  function clearScoresHistory() {
    setSavedScores([]);
    try {
      localStorage.removeItem("geolearn_quiz_scores");
    } catch (e) {
      console.error("Failed to clear quiz scores", e);
    }
  }

  function formatQuizTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function startQuiz() {
    if (currentQuizPool.length < 4) {
      alert("Selected region must have at least 4 countries to play.");
      return;
    }
    const shuffledPool = shuffled(currentQuizPool);
    setQuizRemaining(shuffledPool);
    setQuizCurrentIndex(0);
    setQuizCountry(shuffledPool[0]);
    setQuizAttempts(0);
    setWrongGuesses([]);
    setQuizHistory({});
    setResult("idle");
    setLastGuess(null);
    setRevealingTarget(false);
    setQuizTime(0);
    setTimerActive(true);
    setQuizStatus("playing");
    setSelectedCode(null);

    if (quizMode !== "locate") {
      const target = shuffledPool[0];
      const distractors = shuffled(currentQuizPool.filter((c) => c.cca3 !== target.cca3)).slice(0, 3);
      setChoices(shuffled([target, ...distractors]));
    }
  }

  function exitQuiz() {
    setTimerActive(false);
    setQuizStatus("config");
    setQuizRemaining([]);
    setQuizCountry(null);
    setQuizAttempts(0);
    setWrongGuesses([]);
    setResult("idle");
    setLastGuess(null);
    setRevealingTarget(false);
  }

  // Keyboard Escape Handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (view === "quiz") {
          if (quizStatus === "playing") {
            exitQuiz();
          } else {
            setView("practice");
          }
        } else if (selectedCode) {
          setSelectedCode(null);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [view, quizStatus, selectedCode]);

  function advanceQuiz(history: Record<string, "first-try" | "second-try" | "third-try" | "failed">) {
    const nextIndex = quizCurrentIndex + 1;
    if (nextIndex < quizRemaining.length) {
      setQuizCurrentIndex(nextIndex);
      const nextCountry = quizRemaining[nextIndex];
      setQuizCountry(nextCountry);
      setQuizAttempts(0);
      setWrongGuesses([]);
      setResult("idle");
      setLastGuess(null);

      if (quizMode !== "locate") {
        const distractors = shuffled(currentQuizPool.filter((c) => c.cca3 !== nextCountry.cca3)).slice(0, 3);
        setChoices(shuffled([nextCountry, ...distractors]));
      }
    } else {
      setTimerActive(false);
      setQuizStatus("summary");
      const total = quizRemaining.length;
      const correctFirst = Object.values(history).filter((v) => v === "first-try").length;
      const pct = Math.round((correctFirst / total) * 100);
      saveQuizScore(pct, correctFirst, total, quizTime, history);
    }
  }

  function selectFromMap(country: Country) {
    if (view === "quiz") {
      if (quizStatus !== "playing" || revealingTarget || result !== "idle") return;
      if (quizMode === "locate" && quizCountry) {
        if (country.cca3 === quizCountry.cca3) {
          const grade: "first-try" | "second-try" | "third-try" =
            quizAttempts === 0
              ? "first-try"
              : quizAttempts === 1
              ? "second-try"
              : "third-try";
          const newHistory = { ...quizHistory, [quizCountry.cca3]: grade };
          setQuizHistory(newHistory);
          advanceQuiz(newHistory);
        } else {
          const nextAttempts = quizAttempts + 1;
          setWrongGuesses((prev) => [...prev, country.cca3]);
          
          if (nextAttempts >= 3) {
            const newHistory = { ...quizHistory, [quizCountry.cca3]: "failed" as const };
            setQuizHistory(newHistory);
            advanceQuiz(newHistory);
          } else {
            setQuizAttempts(nextAttempts);
          }
        }
      }
      return;
    }
    setSelectedCode(country.cca3);
  }

  function checkMultipleChoice(choice: Country) {
    if (quizStatus !== "playing" || revealingTarget || result !== "idle" || !quizCountry) return;

    if (choice.cca3 === quizCountry.cca3) {
      setResult("correct");
      const grade: "first-try" | "second-try" | "third-try" =
        quizAttempts === 0
          ? "first-try"
          : quizAttempts === 1
          ? "second-try"
          : "third-try";
      const newHistory = { ...quizHistory, [quizCountry.cca3]: grade };
      setQuizHistory(newHistory);
      setTimeout(() => {
        advanceQuiz(newHistory);
      }, 1000);
    } else {
      const nextAttempts = quizAttempts + 1;
      setWrongGuesses((prev) => [...prev, choice.cca3]);
      
      if (nextAttempts >= 3) {
        const newHistory = { ...quizHistory, [quizCountry.cca3]: "failed" as const };
        setQuizHistory(newHistory);
        advanceQuiz(newHistory);
      } else {
        setQuizAttempts(nextAttempts);
      }
    }
  }

  function handleDontKnow() {
    if (quizStatus !== "playing" || revealingTarget || result !== "idle" || !quizCountry) return;

    const newHistory = { ...quizHistory, [quizCountry.cca3]: "failed" as const };
    setQuizHistory(newHistory);
    advanceQuiz(newHistory);
  }

  return (
    <main className="shell">
      {view === "quiz" && quizStatus !== "playing" && (
        <button
          className="icon-button"
          onClick={() => setView("practice")}
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            zIndex: 35,
            background: "rgba(255, 255, 255, 0.9)",
            borderRadius: "50%",
            boxShadow: "0 8px 24px rgba(22, 38, 52, 0.12)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            cursor: "pointer",
            width: "42px",
            height: "42px",
            display: "grid",
            placeItems: "center"
          }}
          aria-label="Exit Quiz and return to Practice"
        >
          <X size={20} />
        </button>
      )}

      {view === "quiz" && quizStatus === "playing" ? (
        <div className="quiz-active-hud">
          <div className="quiz-hud-prompt">
            {quizMode === "locate" && (
              <>
                <span>Locate on Map (Guesses left: {3 - quizAttempts})</span>
                <h2 className="quiz-hud-target-name">{quizCountry?.name}</h2>
              </>
            )}
            {quizMode === "flag" && (
              <>
                <span>Flag Quiz</span>
                <h2 className="quiz-hud-target-name">Which country uses this flag?</h2>
              </>
            )}
            {quizMode === "facts" && (
              <>
                <span>Facts Quiz</span>
                <h2 className="quiz-hud-target-name">Which country matches?</h2>
              </>
            )}
          </div>
          <div className="quiz-hud-progress-container">
            <div className="quiz-hud-stats-label">
              <span>Progress</span>
              <span>
                {quizCurrentIndex}/{quizRemaining.length}
              </span>
            </div>
            <div className="quiz-hud-progress-track">
              <div
                className="quiz-hud-progress-fill"
                style={{
                  width: `${quizRemaining.length ? (quizCurrentIndex / quizRemaining.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="quiz-hud-actions">
            <span className="quiz-hud-timer" title="Elapsed Time">
              <Clock size={16} />
              {formatQuizTime(quizTime)}
            </span>
            <button
              className="dont-know-btn"
              onClick={handleDontKnow}
              disabled={revealingTarget || result !== "idle"}
            >
              <HelpCircle size={15} />
              Don't Know
            </button>
            <button className="exit-quiz-btn" onClick={exitQuiz}>
              <X size={15} />
              Exit
            </button>
          </div>
        </div>
      ) : (
        <header className="topbar">
          <div className="brand">
            <Globe2 size={30} aria-hidden="true" />
            <div>
              <h1>Geo.LibreUni.Org</h1>
            </div>

            {!isMobile && !(view === "quiz" && quizStatus === "playing") && (
              <>
                <div className="brand-divider" />
                <div className="brand-controls">
                  <button
                    className="control-button primary"
                    type="button"
                    onClick={() => setCountryBrowserOpen(true)}
                  >
                    <Menu size={18} aria-hidden="true" />
                    Countries
                    <span>{filteredCountries.length}</span>
                  </button>
                  <button
                    className="control-button"
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings size={18} aria-hidden="true" />
                    Settings
                  </button>
                </div>
              </>
            )}
          </div>
          <nav className="mode-switch" aria-label="Mode">
            <button
              className={view === "practice" ? "active" : ""}
              onClick={() => setView("practice")}
            >
              <MapPinned size={18} />
              <span>Practice</span>
            </button>
            <button
              className={view === "quiz" ? "active" : ""}
              onClick={() => {
                setView("quiz");
                setQuizStatus("config");
              }}
            >
              <HelpCircle size={18} />
              <span>Quizzes</span>
            </button>
          </nav>
        </header>
      )}

      <WorldMap
        countries={countries}
        countryByNumeric={countryByNumeric}
        projectionType={projectionType}
        repeatMap={repeatMap}
        mapDetailLevel={mapDetailLevel}
        filteredCountries={filteredCountries}
        selectedCountry={selectedCountry}
        selectedRelationships={selectedRelationships}
        quizCountry={quizCountry}
        result={result}
        mapView={mapView}
        onCountrySelect={selectFromMap}
        onMapClear={() => setSelectedCode(null)}
        isQuizMode={view === "quiz"}
        quizStatus={quizStatus}
        quizHistory={quizHistory}
        quizPoolCodes={quizPoolCodes}
        wrongGuesses={wrongGuesses}
        revealingTarget={revealingTarget}
        showCountryNames={showCountryNames}
      />

      {isMobile && !(view === "quiz" && quizStatus === "playing") && (
        <section className="floating-controls" aria-label="Map and country controls">
          <button
            className="control-button primary"
            type="button"
            onClick={() => setCountryBrowserOpen(true)}
          >
            <Menu size={18} aria-hidden="true" />
            Countries
            <span>{filteredCountries.length}</span>
          </button>
          <button
            className="control-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} aria-hidden="true" />
            Settings
          </button>
        </section>
      )}

      <CountryBrowser
        countries={filteredCountries}
        open={countryBrowserOpen}
        query={query}
        selectedCountry={selectedCountry}
        selectedRegion={selectedRegion}
        onOpenChange={setCountryBrowserOpen}
        onQueryChange={setQuery}
        onRegionChange={(v) => {
          setSelectedRegion(v);
          if (
            v === "United States (States)" ||
            v === "Canada (Provinces/Territories)" ||
            isRussiaSubdivisionRegion(v)
          ) {
            setMapDetailLevel("detailed");
          }
        }}
        onSelect={(country) => {
          setSelectedCode(country.cca3);
          setCountryBrowserOpen(false);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        mapView={mapView}
        setMapView={setMapView}
        mapDetailLevel={mapDetailLevel}
        setMapDetailLevel={setMapDetailLevel}
        detailLevel={detailLevel}
        setDetailLevel={setDetailLevel}
        projectionType={projectionType}
        setProjectionType={setProjectionType}
        repeatMap={repeatMap}
        setRepeatMap={setRepeatMap}
        showCountryNames={showCountryNames}
        setShowCountryNames={setShowCountryNames}
        selectedRegion={selectedRegion}
        isRussiaSubdivisionRegion={isRussiaSubdivisionRegion}
      />

      {view === "practice" && selectedCountry ? (
        <PracticePanel
          selectedCountry={selectedCountry}
          relationships={selectedRelationships}
          countries={countries}
          detailLevel={detailLevel}
          isMobile={isMobile}
          onSelectCountry={(country) => setSelectedCode(country.cca3)}
        />
      ) : view === "quiz" && quizStatus === "config" ? (
        <div className="quiz-dashboard-overlay">
          <div className="quiz-dashboard-card">
            <div className="quiz-config-section">
              <h2>Configure Quiz</h2>
              <p>Test your geographical knowledge with custom parameters.</p>

              <div className="quiz-config-group">
                <label>Quiz Mode</label>
                <AppSelect
                  ariaLabel="Quiz Mode"
                  icon={<HelpCircle size={18} />}
                  value={quizMode}
                  options={[
                    { value: "locate", label: "Map Placement (Locate)" },
                    { value: "flag", label: "Flag Identification" },
                    { value: "facts", label: "Country Facts Match" },
                  ]}
                  onChange={(v) => setQuizMode(v as QuizMode)}
                />
              </div>

              <div className="quiz-config-group">
                <label>Target Region</label>
                <AppSelect
                  ariaLabel="Target Region"
                  icon={<ListFilter size={18} />}
                  value={quizRegion}
                  options={regions.map((r) => ({
                    value: r,
                    label: r === "All" ? "All Countries" : r
                  }))}
                  onChange={(v) => {
                    setQuizRegion(v);
                    if (
                      v === "United States (States)" ||
                      v === "Canada (Provinces/Territories)" ||
                      isRussiaSubdivisionRegion(v)
                    ) {
                      setMapDetailLevel("detailed");
                    }
                  }}
                />
              </div>

              <div className="quiz-config-group">
                <label>Map Detail</label>
                <AppSelect
                  ariaLabel="Map Detail"
                  icon={<Globe2 size={18} />}
                  value={mapDetailLevel}
                  disabled={
                    quizRegion === "United States (States)" ||
                    quizRegion === "Canada (Provinces/Territories)" ||
                    isRussiaSubdivisionRegion(quizRegion)
                  }
                  options={[
                    { value: "minimal", label: "Minimal (Colonies merged)" },
                    { value: "standard", label: "Standard" },
                    { value: "detailed", label: "Max Detail (States & Regions)" },
                  ]}
                  onChange={(v) => setMapDetailLevel(v as MapDetailLevel)}
                />
              </div>

              <div className="quiz-config-group" style={{ marginTop: "10px" }}>
                <span style={{ fontSize: "0.9rem", color: "#5d6a75" }}>
                  Pool Size: <strong>{currentQuizPool.length}</strong> countries
                </span>
              </div>

              <button className="start-quiz-btn" onClick={startQuiz}>
                <Play size={18} fill="currentColor" />
                Start Quiz
              </button>
            </div>

            <div className="quiz-scores-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Recent Attempts & Bests</h3>
                {savedScores.length > 0 && (
                  <button 
                    onClick={clearScoresHistory}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "#e74c3c",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Clear History
                  </button>
                )}
              </div>
              <div className="scores-list">
                {savedScores.length === 0 ? (
                  <div className="no-scores-msg">
                    <Trophy size={32} style={{ color: "#bdc3c7", marginBottom: "8px", display: "block", margin: "0 auto" }} />
                    No attempts recorded yet. Start a quiz to save your score!
                  </div>
                ) : (
                  savedScores.map((s) => (
                    <div key={s.id} className="score-row-item">
                      <div className="score-row-left">
                        <span className="score-row-region">
                          {s.region} ({s.mode}) · <small style={{ opacity: 0.85, fontWeight: "normal" }}>{s.mapDetail ? (s.mapDetail === "detailed" ? "Max Detail" : s.mapDetail === "minimal" ? "Min Detail" : "Standard") : "Standard"}</small>
                        </span>
                        <span className="score-row-meta">
                          {s.date} · first-try: {s.breakdown?.firstTry ?? s.correct}/{s.total}
                        </span>
                      </div>
                      <div className="score-row-right">
                        <span className="score-row-val">
                          {Math.round((s.correct / s.total) * 100)}%
                        </span>
                        <span className="score-row-time">{formatQuizTime(s.time)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : view === "quiz" && quizStatus === "summary" ? (
        <div className="quiz-dashboard-overlay">
          <div className="quiz-summary-card">
            <h2 className="quiz-summary-title">Quiz Complete!</h2>
            <p className="quiz-summary-subtitle">
              {quizRegion} region · {quizMode} mode · {mapDetailLevel === "detailed" ? "Max Detail" : mapDetailLevel === "minimal" ? "Min Detail" : "Standard"}
            </p>

            {(() => {
              const total = quizRemaining.length;
              const first = Object.values(quizHistory).filter((v) => v === "first-try").length;
              const second = Object.values(quizHistory).filter((v) => v === "second-try").length;
              const third = Object.values(quizHistory).filter((v) => v === "third-try").length;
              const failed = Object.values(quizHistory).filter((v) => v === "failed").length;
              const pct = total ? Math.round((first / total) * 100) : 0;
              
              let badgeClass = "";
              let badgeLabel = "";
              if (pct === 100) {
                badgeClass = "";
                badgeLabel = "Gold";
              } else if (pct >= 85) {
                badgeClass = "silver";
                badgeLabel = "Silver";
              } else if (pct >= 70) {
                badgeClass = "bronze";
                badgeLabel = "Bronze";
              } else {
                badgeClass = "red-badge";
                badgeLabel = "Finished";
              }

              return (
                <>
                  <div className={`quiz-summary-score-badge ${badgeClass}`}>
                    <span className="quiz-summary-score-pct">{pct}%</span>
                    <span className="quiz-summary-score-label">{badgeLabel}</span>
                  </div>

                  <div className="quiz-summary-grid">
                    <div className="quiz-summary-stat-box">
                      <span className="quiz-summary-stat-val">
                        {first}/{total}
                      </span>
                      <span className="quiz-summary-stat-lbl">1st Try Correct</span>
                    </div>
                    <div className="quiz-summary-stat-box">
                      <span className="quiz-summary-stat-val">
                        {formatQuizTime(quizTime)}
                      </span>
                      <span className="quiz-summary-stat-lbl">Time Elapsed</span>
                    </div>
                  </div>

                  <div className="quiz-attempts-breakdown">
                    <div className="quiz-breakdown-row">
                      <div className="label-flex">
                        <i className="bullet green" />
                        First attempt
                      </div>
                      <span className="value">{first}</span>
                    </div>
                    <div className="quiz-breakdown-row">
                      <div className="label-flex">
                        <i className="bullet yellow" />
                        Second attempt
                      </div>
                      <span className="value">{second}</span>
                    </div>
                    <div className="quiz-breakdown-row">
                      <div className="label-flex">
                        <i className="bullet orange" />
                        Third attempt
                      </div>
                      <span className="value">{third}</span>
                    </div>
                    <div className="quiz-breakdown-row">
                      <div className="label-flex">
                        <i className="bullet red" />
                        Failed / Revealed
                      </div>
                      <span className="value">{failed}</span>
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="quiz-summary-btns">
              <button className="quiz-summary-btn-primary" onClick={startQuiz}>
                Play Again
              </button>
              <button className="quiz-summary-btn-secondary" onClick={() => setQuizStatus("config")}>
                Configure New
              </button>
            </div>
          </div>
        </div>
      ) : view === "quiz" && quizStatus === "playing" && quizMode !== "locate" && quizCountry ? (
        <aside className="quiz-layout-sidebar glass">
          {quizMode === "flag" && (
            <div style={{ marginBottom: "20px" }}>
              <h2>Identify Flag</h2>
              <div className="quiz-flag" style={{ boxShadow: "0 4px 10px rgba(0,0,0,0.06)", height: "150px" }}>
                <FlagIcon country={quizCountry} />
              </div>
            </div>
          )}
          {quizMode === "facts" && (
            <div style={{ marginBottom: "20px" }}>
              <h2>Match Country Facts</h2>
              <div className="prompt" style={{ padding: "12px", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "8px", background: "rgba(255,255,255,0.5)" }}>
                <ul className="fact-list" style={{ paddingLeft: "16px", margin: "4px 0" }}>
                  <li style={{ marginBottom: "4px" }}>Capital: <strong>{quizCountry.capital}</strong></li>
                  <li style={{ marginBottom: "4px" }}>Region: <strong>{quizCountry.subregion}, {quizCountry.region}</strong></li>
                  <li style={{ marginBottom: "4px" }}>Primary Language: <strong>{quizCountry.primaryLanguages.join(", ") || "Not listed"}</strong></li>
                  <li style={{ marginBottom: "4px" }}>Population: <strong>{formatNumber.format(quizCountry.population)}</strong></li>
                  <li style={{ marginBottom: "4px" }}>Area: <strong>{formatArea(quizCountry.area)}</strong></li>
                </ul>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#7f8c8d", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Select Choice (Attempt {quizAttempts + 1}/3)
            </span>
            <div className="choices" style={{ marginTop: "4px" }}>
              {choices.map((choice) => {
                const isWrong = wrongGuesses.includes(choice.cca3);
                const isCorrectAnswer = choice.cca3 === quizCountry.cca3;
                const isClickedCorrect = result === "correct" && isCorrectAnswer;
                const isFailedReveal = result === "wrong" && isCorrectAnswer;
                
                let btnClass = "quiz-choice-btn";
                if (isClickedCorrect || isFailedReveal) {
                  btnClass += " correct-choice";
                } else if (isWrong) {
                  btnClass += " wrong-choice";
                }
                
                return (
                  <button
                    key={choice.cca3}
                    className={btnClass}
                    onClick={() => checkMultipleChoice(choice)}
                    disabled={result !== "idle" || isWrong}
                    style={{ width: "100%" }}
                  >
                    {choice.name}
                  </button>
                );
              })}
            </div>
          </div>
          {result !== "idle" && (
            <div 
              className={`result ${result}`} 
              style={{ 
                marginTop: "16px", 
                display: "flex", 
                alignItems: "center", 
                gap: "8px", 
                padding: "10px 12px", 
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontWeight: 600
              }}
            >
              {result === "correct" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span>
                {result === "correct"
                  ? "Correct!"
                  : `Incorrect! Answer: ${quizCountry.name}`}
              </span>
            </div>
          )}
        </aside>
      ) : null}
    </main>
  );
}

function WorldMap({
  countries,
  countryByNumeric,
  projectionType,
  repeatMap,
  mapDetailLevel,
  filteredCountries,
  selectedCountry,
  selectedRelationships,
  quizCountry,
  result,
  mapView,
  onCountrySelect,
  onMapClear,
  isQuizMode = false,
  quizStatus = "config",
  quizHistory = {},
  quizPoolCodes = new Set(),
  wrongGuesses = [],
  revealingTarget = false,
  showCountryNames = false,
}: {
  countries: Country[];
  countryByNumeric: Map<string, Country>;
  projectionType: ProjectionType;
  repeatMap: boolean;
  mapDetailLevel: MapDetailLevel;
  filteredCountries: Country[];
  selectedCountry: Country | null;
  selectedRelationships: ReturnType<typeof relationshipSummary> | null;
  quizCountry: Country | null;
  result: ResultState;
  mapView: MapView;
  onCountrySelect: (country: Country) => void;
  onMapClear: () => void;
  isQuizMode?: boolean;
  quizStatus?: "config" | "playing" | "summary";
  quizHistory?: Record<string, "first-try" | "second-try" | "third-try" | "failed">;
  quizPoolCodes?: Set<string>;
  wrongGuesses?: string[];
  revealingTarget?: boolean;
  showCountryNames?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  
  const [globeRotation, setGlobeRotation] = useState<[number, number]>([0, 0]);
  const [isDragging, setIsDragging] = useState(false);

  const activeGeographies = useMemo(() => {
    if (mapDetailLevel === "detailed") {
      const baseFiltered = baseGeographies.filter(
        (g) => {
          const id = geoId(g);
          return id !== "840" && id !== "643" && id !== "124" && id !== "036" && id !== "076";
        }
      );
      return [...baseFiltered, ...subdivisionsGeographies];
    }
    return baseGeographies;
  }, [mapDetailLevel]);

  const projection = useMemo(() => {
    let proj;
    if (projectionType === "mercator") {
      proj = geoMercator();
    } else if (projectionType === "orthographic") {
      proj = geoOrthographic().rotate([globeRotation[0], globeRotation[1], 0]);
    } else {
      proj = geoEqualEarth();
    }

    proj.fitExtent(
      [
        [20, 20],
        [WIDTH - 20, HEIGHT - 20],
      ],
      { type: "Sphere" }
    );
    
    // Set higher resampling threshold (precision) for vastly improved performance during interaction
    proj.precision(1.8);
    
    return proj;
  }, [projectionType, globeRotation]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const mapGeographies = useMemo((): MapGeometry[] => {
    return activeGeographies.map((geo): MapGeometry => {
      const isSub = geo.properties && ("id" in geo.properties);
      const id = isSub ? String(geo.properties.id) : geoId(geo);
      const d = path(geo) ?? undefined;
      
      let centroid: [number, number] | null = null;
      let area = 0;
      let bounds: [[number, number], [number, number]] = [[0, 0], [0, 0]];
      
      // Calculate geometric attributes only if the shape is on the visible side of the globe/map
      if (d) {
        const [x, y] = path.centroid(geo);
        centroid = Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
        area = path.area(geo);
        bounds = path.bounds(geo);
      }
      
      return {
        id,
        clipId: clipId(id),
        name: geo.properties?.name ?? "Unknown",
        d,
        area,
        bounds,
        centroid,
      };
    });
  }, [activeGeographies, path]);

  const geographyByNumeric = useMemo(() => {
    return new Map(mapGeographies.map((geo) => [geo.id, geo]));
  }, [mapGeographies]);

  const worldWidth = useMemo(() => {
    if (projectionType === "orthographic") return 0;
    const pt180 = projection([180, 0]);
    const ptMinus180 = projection([-180, 0]);
    const x180 = pt180 ? pt180[0] : 0;
    const xMinus180 = ptMinus180 ? ptMinus180[0] : 0;
    return Math.abs(x180 - xMinus180);
  }, [projection, projectionType]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originLon?: number;
    originLat?: number;
  } | null>(null);
  
  const wasDraggingRef = useRef(false);
  const zoomRefreshTimeoutRef = useRef<number | null>(null);
  const [mapTransform, setMapTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [mapRenderVersion, setMapRenderVersion] = useState(0);
  const filteredCodes = useMemo(() => new Set(filteredCountries.map((country) => country.cca3)), [filteredCountries]);
  const showFlagFills = mapView === "flagFills";

  useEffect(() => {
    return () => {
      if (zoomRefreshTimeoutRef.current !== null) {
        window.clearTimeout(zoomRefreshTimeoutRef.current);
      }
    };
  }, []);

  const targetCodes = useMemo(() => {
    return isQuizMode && (quizStatus === "playing" || quizStatus === "summary")
      ? quizPoolCodes
      : filteredCodes;
  }, [isQuizMode, quizStatus, quizPoolCodes, filteredCodes]);

  const smallCountryHitboxes = useMemo(
    () => {
      const countryTotalAreas = new Map<string, number>();
      mapGeographies.forEach((geo) => {
        const country = countryByNumeric.get(geo.id);
        if (country && country.ccn3 === geo.id) {
          const code = country.cca3;
          countryTotalAreas.set(code, (countryTotalAreas.get(code) || 0) + geo.area);
        }
      });

      return mapGeographies
        .map((geo) => {
          const rawCountry = countryByNumeric.get(geo.id);
          if (rawCountry && rawCountry.ccn3 !== geo.id) return { geo, country: undefined };
          return { geo, country: rawCountry };
        })
        .filter(
          (item): item is { geo: MapGeometry; country: Country } => {
            if (!item.country || !targetCodes.has(item.country.cca3)) return false;
            const totalArea = countryTotalAreas.get(item.country.cca3) || 0;
            return (
              totalArea > 0 &&
              totalArea < SMALL_COUNTRY_HIT_AREA &&
              Boolean(item.geo.centroid)
            );
          }
        );
    },
    [mapGeographies, countryByNumeric, targetCodes],
  );

  const selectedCountryMarker = useMemo(() => {
    if (!selectedCountry || isQuizMode) return null;

    const selectedGeographies = mapGeographies.filter((geo) => {
      const country = countryByNumeric.get(geo.id);
      return country?.cca3 === selectedCountry.cca3 && targetCodes.has(country.cca3);
    });
    if (!selectedGeographies.length) return null;

    const totalArea = selectedGeographies.reduce((sum, geo) => sum + geo.area, 0);
    const largestGeo = selectedGeographies.reduce((largest, geo) => (geo.area > largest.area ? geo : largest), selectedGeographies[0]);
    const markerPoint = getMarkerPoint(selectedCountry) ?? largestGeo.centroid;
    if (!markerPoint) return null;

    return {
      point: markerPoint,
      screenArea: totalArea * mapTransform.scale * mapTransform.scale,
    };
  }, [countryByNumeric, isQuizMode, mapGeographies, mapTransform.scale, selectedCountry, targetCodes]);

  const showSelectedCountryMarker = Boolean(
    selectedCountryMarker &&
    selectedCountryMarker.screenArea < 170 &&
    mapTransform.scale < 18
  );

  function clampZoom(scale: number) {
    return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, scale));
  }

  function clientPointToSvg(event: WheelEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: WIDTH / 2, y: HEIGHT / 2 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const screenMatrix = svg.getScreenCTM();
    return screenMatrix ? point.matrixTransform(screenMatrix.inverse()) : { x: WIDTH / 2, y: HEIGHT / 2 };
  }

  function scheduleZoomRenderRefresh() {
    if (zoomRefreshTimeoutRef.current !== null) {
      window.clearTimeout(zoomRefreshTimeoutRef.current);
    }

    zoomRefreshTimeoutRef.current = window.setTimeout(() => {
      zoomRefreshTimeoutRef.current = null;
      setMapRenderVersion((version) => version + 1);
    }, 120);
  }

  function zoomAt(nextScale: number, center = { x: WIDTH / 2, y: HEIGHT / 2 }) {
    setMapTransform((current) => {
      const scale = clampZoom(nextScale);
      const ratio = scale / current.scale;
      return {
        scale,
        x: center.x - (center.x - current.x) * ratio,
        y: center.y - (center.y - current.y) * ratio,
      };
    });
    scheduleZoomRenderRefresh();
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    zoomAt(mapTransform.scale * zoomFactor, clientPointToSvg(event));
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapTransform.x,
      originY: mapTransform.y,
      originLon: globeRotation[0],
      originLat: globeRotation[1],
    };
    wasDraggingRef.current = false;
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.pointerId !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) * WIDTH) / rect.width;
    const dy = ((event.clientY - drag.startY) * HEIGHT) / rect.height;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDraggingRef.current = true;

    if (projectionType === "orthographic") {
      const sensitivity = 0.45;
      const scale = mapTransform.scale;
      const newLon = (drag.originLon ?? 0) + (dx / scale) * sensitivity;
      const newLat = Math.max(-80, Math.min(80, (drag.originLat ?? 0) - (dy / scale) * sensitivity));
      setGlobeRotation([newLon, newLat]);
    } else {
      setMapTransform((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      window.setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    }
    setIsDragging(false);
  }

  function selectCountry(country: Country) {
    if (wasDraggingRef.current) return;
    onCountrySelect(country);
  }

  function clearMapSelection() {
    if (wasDraggingRef.current) return;
    onMapClear();
  }

  function getMarkerPoint(country: Country) {
    if (country.latlng) {
      const [lat, lon] = country.latlng;
      const pt = projection([lon, lat]);
      return pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) ? pt : null;
    }
    const geo = geographyByNumeric.get(country.ccn3);
    return geo?.centroid ?? null;
  }

  function needsQuizMarker(country: Country) {
    const geo = geographyByNumeric.get(country.ccn3);
    return !geo || geo.area < 18;
  }

  function smallCountryHitRadius() {
    const screenRadius = isQuizPlayingActive
      ? Math.max(5, 18 - Math.max(0, mapTransform.scale - 1) * 1.45)
      : Math.min(24, 9 * Math.max(1, Math.sqrt(mapTransform.scale)));
    return Math.max(MIN_SMALL_COUNTRY_HIT_RADIUS, screenRadius / mapTransform.scale);
  }

  function smallCountryMarkerOpacity() {
    if (!isQuizPlayingActive) return undefined;
    const fadeStart = QUIZ_SMALL_COUNTRY_MARKER_SCALE_LIMIT * 0.68;
    if (mapTransform.scale <= fadeStart) return 1;
    const fadeProgress = (mapTransform.scale - fadeStart) / (QUIZ_SMALL_COUNTRY_MARKER_SCALE_LIMIT - fadeStart);
    return Math.max(0.34, 1 - fadeProgress * 0.5);
  }

  const quizMarkerPoint = quizCountry && needsQuizMarker(quizCountry) ? getMarkerPoint(quizCountry) : null;
  const countryStrokeWidth = Math.max(
    MIN_COUNTRY_STROKE_WIDTH,
    BASE_COUNTRY_STROKE_WIDTH / Math.pow(mapTransform.scale, 1.35),
  );

  const isQuizPlayingActive = isQuizMode && (quizStatus === "playing" || quizStatus === "summary");

  let renderX = mapTransform.x;
  const isFlatRepeat = repeatMap && projectionType !== "orthographic" && worldWidth > 0;
  if (isFlatRepeat) {
    const scaledWidth = worldWidth * mapTransform.scale;
    renderX = ((mapTransform.x + scaledWidth / 2) % scaledWidth);
    if (renderX < 0) renderX += scaledWidth;
    renderX -= scaledWidth / 2;
  }

  function renderMapElements(xOffset = 0, keySuffix = "center", isVisible = true) {
    if (!isVisible) return null;
    const offsetKey = keySuffix !== "center" ? `-${keySuffix}` : "";
    return (
      <g key={`map-elements${offsetKey}`} transform={`translate(${xOffset}, 0)`}>
        {showFlagFills && (
          <>
            <defs>
              {mapGeographies.map((geo, idx) => {
                const country = countryByNumeric.get(geo.id);
                if (!country?.alpha2 || !targetCodes.has(country.cca3) || !geo.d) return null;
                return (
                  <clipPath key={`clip-${geo.id}-${idx}${offsetKey}`} id={`${geo.clipId}-${idx}${offsetKey}`}>
                    <path d={geo.d} />
                  </clipPath>
                );
              })}
            </defs>
            {mapGeographies.map((geo, idx) => {
              const country = countryByNumeric.get(geo.id);
              if (!country?.alpha2 || !targetCodes.has(country.cca3)) return null;
              const [[x0, y0], [x1, y1]] = geo.bounds;
              if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
              return (
                <image
                  key={`flag-${geo.id}-${idx}${offsetKey}`}
                  className="country-flag-fill"
                  x={x0}
                  y={y0}
                  width={Math.max(1, x1 - x0)}
                  height={Math.max(1, y1 - y0)}
                  href={country.cca3.includes("-") ? `/flags/${country.cca3.toLowerCase()}.svg` : `/flags/${country.alpha2.toLowerCase()}.svg`}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${geo.clipId}-${idx}${offsetKey})`}
                />
              );
            })}
          </>
        )}
        {mapGeographies.map((geo, idx) => {
          const country = countryByNumeric.get(geo.id);
          const visible = country ? targetCodes.has(country.cca3) : false;
          
          const isSelected = !isQuizPlayingActive && country?.cca3 === selectedCountry?.cca3;
          const relation = !isQuizPlayingActive && selectedRelationships ? relationshipKind(selectedCountry, country) : null;
          
          const isTarget = country?.cca3 === quizCountry?.cca3;
          const quizColor = (isQuizMode && country) ? quizHistory[country.cca3] : undefined;
          const isWrongGuess = (isQuizMode && country) ? wrongGuesses.includes(country.cca3) : false;
          const isRevealed = isQuizMode && revealingTarget && isTarget;
          
          const hasSaneHitArea = geo.area < MAX_COUNTRY_HIT_AREA;
          
          const className = [
            "country",
            !hasSaneHitArea ? "no-hit" : "",
            showFlagFills && country?.alpha2 && visible ? "flagged" : "",
            visible ? "visible" : "muted",
            relation ? `relationship-${relation}` : "",
            isSelected ? "selected" : "",
            quizColor ? `quiz-${quizColor}` : "",
            isWrongGuess ? "quiz-wrong-guess" : "",
            isRevealed ? "quiz-failed" : "",
          ]
            .filter(Boolean)
            .join(" ");
          
          return (
            <path
              key={`path-${geo.id}-${idx}${offsetKey}`}
              className={className}
              d={geo.d}
              style={{ strokeWidth: countryStrokeWidth }}
              onClick={() =>
                country &&
                hasSaneHitArea &&
                (!isQuizPlayingActive || quizPoolCodes.has(country.cca3)) &&
                selectCountry(country)
              }
            >
              {!isQuizPlayingActive && <title>{country?.name ?? geo.name}</title>}
            </path>
          );
        })}
        {mapTransform.scale < (isQuizPlayingActive ? QUIZ_SMALL_COUNTRY_MARKER_SCALE_LIMIT : 2.2) && smallCountryHitboxes.map(({ geo, country }) => {
          const markerPoint = getMarkerPoint(country) ?? geo.centroid;
          if (!markerPoint) return null;
          const quizColor = isQuizMode ? quizHistory[country.cca3] : undefined;
          const isWrongGuess = isQuizMode ? wrongGuesses.includes(country.cca3) : false;
          const isRevealed = isQuizMode && revealingTarget && country.cca3 === quizCountry?.cca3;
          
          const className = [
            "island-hitbox",
            isQuizPlayingActive ? "quiz-island-marker" : "",
            quizColor ? `quiz-${quizColor}` : "",
            isWrongGuess ? "quiz-wrong-guess" : "",
            isRevealed ? "quiz-failed" : "",
          ].filter(Boolean).join(" ");
          
          return (
            <circle
              key={`hit-${country.cca3}${offsetKey}`}
              className={className}
              cx={markerPoint[0]}
              cy={markerPoint[1]}
              r={smallCountryHitRadius()}
              style={{ opacity: smallCountryMarkerOpacity() }}
              onClick={() => (!isQuizPlayingActive || quizPoolCodes.has(country.cca3)) && selectCountry(country)}
            >
              {!isQuizPlayingActive && <title>{country.name}</title>}
            </circle>
          );
        })}
        {isQuizMode && quizCountry && quizMarkerPoint && (!isQuizPlayingActive || revealingTarget) && (
          <g
            className="quiz-target-marker"
            transform={`translate(${quizMarkerPoint[0]} ${quizMarkerPoint[1]})`}
            onClick={() => (!isQuizPlayingActive || quizPoolCodes.has(quizCountry.cca3)) && selectCountry(quizCountry)}
          >
            <circle r={Math.max(1.5, 18 / mapTransform.scale)} />
            <path d={`M0 -${Math.max(0.7, 8 / mapTransform.scale)}v${Math.max(0.7, 8 / mapTransform.scale) * 2}M-${Math.max(0.7, 8 / mapTransform.scale)} 0h${Math.max(0.7, 8 / mapTransform.scale) * 2}`} />
            {!isQuizPlayingActive && <title>{quizCountry.name}</title>}
          </g>
        )}
        {!isQuizPlayingActive && selectedCountry && selectedCountryMarker && showSelectedCountryMarker && (
          <g
            className="selected-country-marker"
            transform={`translate(${selectedCountryMarker.point[0]} ${selectedCountryMarker.point[1]})`}
            onClick={() => selectCountry(selectedCountry)}
          >
            <circle r={Math.max(1.8, 3.2 / mapTransform.scale)} />
            <g transform={`translate(0 ${-34 / mapTransform.scale})`}>
              <foreignObject
                x={-14 / mapTransform.scale}
                y={-17 / mapTransform.scale}
                width={28 / mapTransform.scale}
                height={28 / mapTransform.scale}
              >
                <div className="selected-country-marker-icon">
                  <MoveDown size={18} aria-hidden="true" />
                </div>
              </foreignObject>
            </g>
            <line
              x1="0"
              y1={-22 / mapTransform.scale}
              x2="0"
              y2={-5 / mapTransform.scale}
            />
            <title>{selectedCountry.name}</title>
          </g>
        )}
        {showCountryNames && !(isQuizMode && quizStatus === "playing") && (() => {
          const renderedLabels = new Set<string>();
          return mapGeographies.map((geo, idx) => {
            const country = countryByNumeric.get(geo.id);
            const visible = country ? targetCodes.has(country.cca3) : false;
            if (!visible || !country) return null;
            
            const isSmall = geo.area < 18;
            
            if (isSmall && renderedLabels.has(country.cca3)) return null;
            
            let labelPt: [number, number] | null = null;
            if (isSmall && country.latlng) {
              labelPt = getMarkerPoint(country);
            }
            if (!labelPt) {
              labelPt = geo.centroid;
            }
            if (!labelPt) return null;
            
            const screenArea = geo.area * mapTransform.scale * mapTransform.scale;
            
            if (isSmall) {
              if (mapTransform.scale < 2.2) return null;
            } else {
              if (screenArea < 120) return null;
            }
            
            if (isSmall) {
              renderedLabels.add(country.cca3);
            }
            
            const displayName = country.name;
            
            let textX = labelPt[0];
            let textY = labelPt[1];
            let textAnchor: "middle" | "start" = "middle";
            
            if (isSmall) {
              textX += 11 / mapTransform.scale;
              textY += 3 / mapTransform.scale;
              textAnchor = "start";
            } else {
              textY -= 3 / mapTransform.scale;
            }
            
            return (
              <text
                key={`label-${country.cca3}-${idx}${offsetKey}`}
                x={textX}
                y={textY}
                fontSize={10 / mapTransform.scale}
                strokeWidth={2.5 / mapTransform.scale}
                style={{ textAnchor }}
                className="country-label"
                onClick={() =>
                  (!isQuizPlayingActive || quizPoolCodes.has(country.cca3)) &&
                  selectCountry(country)
                }
              >
                {displayName}
              </text>
            );
          });
        })()}
      </g>
    );
  }

  return (
    <section className={`map-panel ${isQuizPlayingActive ? "quiz-playing-mode" : ""} ${isDragging ? "is-dragging" : ""}`} aria-label="World map">
      <div className="map-tools" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomAt(mapTransform.scale * 1.45)} aria-label="Zoom in">
          <ZoomIn size={18} />
        </button>
        <button type="button" onClick={() => zoomAt(mapTransform.scale / 1.45)} aria-label="Zoom out">
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            setMapTransform({ scale: 1, x: 0, y: 0 });
            setGlobeRotation([0, 0]);
            scheduleZoomRenderRefresh();
          }}
          aria-label="Reset map zoom"
        >
          <Maximize2 size={18} />
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Clickable world map"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <radialGradient id="globe-ocean-gradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#f0f8fa" />
            <stop offset="60%" stopColor="#d8edf3" />
            <stop offset="100%" stopColor="#b2dae5" />
          </radialGradient>
          <radialGradient id="globe-highlight-gradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.4)" stopOpacity="0.4" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0.15)" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        {projectionType !== "orthographic" && (
          <rect className="ocean" width={WIDTH} height={HEIGHT} rx="0" onClick={clearMapSelection} />
        )}

        <g key={`map-render-${mapRenderVersion}`} transform={`translate(${renderX} ${mapTransform.y}) scale(${mapTransform.scale})`}>
          {projectionType === "orthographic" && (
            <circle
              cx={WIDTH / 2}
              cy={HEIGHT / 2}
              r={projection.scale()}
              fill="url(#globe-ocean-gradient)"
              onClick={clearMapSelection}
              style={{ cursor: "pointer" }}
            />
          )}

          {renderMapElements(-worldWidth, "left", isFlatRepeat)}
          {renderMapElements(0, "center", true)}
          {renderMapElements(worldWidth, "right", isFlatRepeat)}

          {projectionType === "orthographic" && (
            <>
              <circle
                cx={WIDTH / 2}
                cy={HEIGHT / 2}
                r={projection.scale()}
                fill="url(#globe-highlight-gradient)"
                pointerEvents="none"
              />
              <circle
                cx={WIDTH / 2}
                cy={HEIGHT / 2}
                r={projection.scale()}
                fill="none"
                stroke="rgba(21, 53, 63, 0.22)"
                strokeWidth="1.2"
                pointerEvents="none"
              />
            </>
          )}
        </g>
      </svg>
      {/* MapLegend has been integrated into the bottom panel in practice mode */}
    </section>
  );
}

type HighlightItem = {
  type: "active-tension" | "mild-tension" | "ally" | "union" | "territory";
  text: string;
  detail?: string;
  relatedCountries: Country[];
};

function getRelationshipHighlights(
  selectedCountry: Country,
  countries: Country[],
  countryByCode: Map<string, Country>
): HighlightItem[] {
  const list: HighlightItem[] = [];

  // 1. Tensions
  tensionsList.forEach((t) => {
    if (t.countries.includes(selectedCountry.cca3)) {
      const otherCode = t.countries.find((code) => code !== selectedCountry.cca3)!;
      const otherCountry = countryByCode.get(otherCode);
      const otherName = otherCountry ? otherCountry.name : otherCode;
      const label = getTensionLabel(selectedCountry.cca3, otherCode, otherName, t);
      list.push({
        type: t.type === "active" ? "active-tension" : "mild-tension",
        text: label,
        relatedCountries: otherCountry ? [otherCountry] : [],
      });
    }
  });

  // 2. Unions
  Object.entries(unionGroups).forEach(([groupName, members]) => {
    if (members.includes(selectedCountry.cca3)) {
      list.push({
        type: "union",
        text: groupName === "European Union" ? "European Union" : `Member of ${groupName}`,
        relatedCountries: [],
      });
    }
  });

  // 3. Alliances
  Object.entries(allyGroups).forEach(([groupName, members]) => {
    if (members.includes(selectedCountry.cca3)) {
      list.push({
        type: "ally",
        text: groupName === "NATO" ? "NATO Alliance" : `Member of ${groupName} Alliance`,
        relatedCountries: [],
      });
    }
  });

  // 4. Territory (Link to sovereign state)
  if (selectedCountry.sovereignty?.sovereignState) {
    const sovereignName = selectedCountry.sovereignty.sovereignState;
    const sovereignCountry = countries.find((c) => c.name === sovereignName || c.official === sovereignName);
    list.push({
      type: "territory",
      text: `Territory of ${sovereignName}`,
      detail: selectedCountry.sovereignty.label,
      relatedCountries: sovereignCountry ? [sovereignCountry] : [],
    });
  }

  // 5. Territory (Has external territories)
  const territories = countries.filter(
    (c) => c.sovereignty?.sovereignState === selectedCountry.name
  );
  if (territories.length > 0) {
    const names = territories.map((t) => t.name).slice(0, 3).join(", ");
    const moreCount = territories.length - 3;
    list.push({
      type: "territory",
      text: `Sovereign of ${territories.length} external ${territories.length === 1 ? "territory" : "territories"}`,
      detail: `${names}${moreCount > 0 ? `, +${moreCount} more` : ""}`,
      relatedCountries: territories,
    });
  }

  return list;
}

function renderLabelWithLinks(
  text: string,
  relatedCountries: Country[],
  onSelectCountry: (country: Country) => void
) {
  if (!relatedCountries || relatedCountries.length === 0) return <span>{text}</span>;

  let parts: ReactNode[] = [text];

  relatedCountries.forEach((country) => {
    const name = country.name;
    const newParts: ReactNode[] = [];
    parts.forEach((part) => {
      if (typeof part !== "string") {
        newParts.push(part);
        return;
      }
      let currentPart = part;
      let index = currentPart.indexOf(name);
      while (index !== -1) {
        const before = currentPart.substring(0, index);
        const after = currentPart.substring(index + name.length);
        if (before) {
          newParts.push(before);
        }
        newParts.push(
          <button
            key={`${country.cca3}-${index}`}
            className="inline-country-link"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCountry(country);
            }}
          >
            {country.emoji} {name}
          </button>
        );
        currentPart = after;
        index = currentPart.indexOf(name);
      }
      if (currentPart) {
        newParts.push(currentPart);
      }
    });
    parts = newParts;
  });

  return <>{parts.map((p, idx) => <span key={idx}>{p}</span>)}</>;
}

function PracticePanel({
  selectedCountry,
  relationships,
  countries,
  detailLevel,
  isMobile,
  onSelectCountry,
}: {
  selectedCountry: Country;
  relationships: ReturnType<typeof relationshipSummary> | null;
  countries: Country[];
  detailLevel: DetailLevel;
  isMobile: boolean;
  onSelectCountry: (country: Country) => void;
}) {
  const countryByCode = useMemo(
    () => new Map(countries.map((c) => [c.cca3, c])),
    [countries]
  );

  const phrasebook = findPhrasebook(selectedCountry);
  const highlights = useMemo(
    () => getRelationshipHighlights(selectedCountry, countries, countryByCode),
    [selectedCountry, countries, countryByCode]
  );

  if (isMobile) {
    return (
      <aside className="mobile-info-panel side-panel">
        <div className="country-card">
          {selectedCountry.emblemUrl ? (
            <div className="banner-frame">
              <div className="flag-frame">
                <FlagIcon country={selectedCountry} />
              </div>
              <div className="emblem-frame">
                <img
                  src={selectedCountry.emblemUrl}
                  alt={`${selectedCountry.name} coat of arms`}
                  title={`${selectedCountry.name} coat of arms`}
                  className="emblem-img"
                />
              </div>
            </div>
          ) : (
            <div className="flag-frame">
              <FlagIcon country={selectedCountry} />
            </div>
          )}
          <h2>{selectedCountry.name}</h2>
          <p>{selectedCountry.official}</p>
          <dl>
            {selectedCountry.sovereignty && (
              <div>
                <dt>{selectedCountry.sovereignty.disputed ? "Status" : "Sovereignty"}</dt>
                <dd>
                  <SovereigntyNote country={selectedCountry} />
                </dd>
              </div>
            )}
            <div>
              <dt>Capital</dt>
              <dd>{selectedCountry.capital}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{selectedCountry.subregion}, {selectedCountry.region}</dd>
            </div>
            {detailLevel !== "minimal" && (
              <>
                <div>
                  <dt>Population</dt>
                  <dd>{formatNumber.format(selectedCountry.population)}</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{formatArea(selectedCountry.area)}</dd>
                </div>
                <div>
                  <dt>Languages</dt>
                  <dd><LanguageList country={selectedCountry} /></dd>
                </div>
                <div>
                  <dt>Currencies</dt>
                  <dd>{selectedCountry.currencies.join(", ") || "Not listed"}</dd>
                </div>
                {selectedCountry.established && (
                  <div>
                    <dt>Established</dt>
                    <dd>{selectedCountry.established}</dd>
                  </div>
                )}
                {selectedCountry.highestPoint && (
                  <div>
                    <dt>Highest Point</dt>
                    <dd>{selectedCountry.highestPoint}</dd>
                  </div>
                )}
                {selectedCountry.namedAfter && (
                  <div>
                    <dt>Named After</dt>
                    <dd>{selectedCountry.namedAfter}</dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {detailLevel !== "minimal" && phrasebook && (
            <section className="info-section">
              <h3>Local Phrases ({phrasebook.language})</h3>
              <table className="phrases-table">
                <thead>
                  <tr>
                    <th>English</th>
                    <th>Local Script</th>
                    <th>Pronunciation</th>
                  </tr>
                </thead>
                <tbody>
                  {phrasebook.phrases.map((phrase, idx) => (
                    <tr key={idx}>
                      <td>{phrase.english}</td>
                      <td className="local-script">{phrase.local}</td>
                      <td className="phonetic">{phrase.phonetic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {detailLevel === "full" && highlights.length > 0 && (
            <section className="info-section">
              <h3>Key Relationships & Status</h3>
              <div className="highlights-list">
                {highlights.map((h, index) => (
                  <div key={index} className={`relationship-preview ${h.type}`}>
                    <strong>
                      {renderLabelWithLinks(h.text, h.relatedCountries, onSelectCountry)}
                    </strong>
                    {h.detail && (
                      <span>
                        {renderLabelWithLinks(h.detail, h.relatedCountries, onSelectCountry)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {detailLevel !== "minimal" && selectedCountry.wikipedia && (
            <section className="info-section country-summary">
              <h3>Overview</h3>
              {selectedCountry.wikipedia.summary.split("\n\n").map((para, index) => (
                <p key={index}>{para}</p>
              ))}
              <a href={selectedCountry.wikipedia.sourceUrl} target="_blank" rel="noreferrer">
                Source: Wikipedia, {selectedCountry.wikipedia.title}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </section>
          )}
        </div>
      </aside>
    );
  }

  // Desktop View (Split Panels)
  return (
    <>
      {/* Left Panel - Core Facts & Cultural Phrases */}
      <aside className="left-info-panel side-panel">
        <div className="country-card">
          {selectedCountry.emblemUrl ? (
            <div className="banner-frame">
              <div className="flag-frame">
                <FlagIcon country={selectedCountry} />
              </div>
              <div className="emblem-frame">
                <img
                  src={selectedCountry.emblemUrl}
                  alt={`${selectedCountry.name} coat of arms`}
                  title={`${selectedCountry.name} coat of arms`}
                  className="emblem-img"
                />
              </div>
            </div>
          ) : (
            <div className="flag-frame">
              <FlagIcon country={selectedCountry} />
            </div>
          )}
          <h2>{selectedCountry.name}</h2>
          <p>{selectedCountry.official}</p>
          <dl>
            {selectedCountry.sovereignty && (
              <div>
                <dt>{selectedCountry.sovereignty.disputed ? "Status" : "Sovereignty"}</dt>
                <dd>
                  <SovereigntyNote country={selectedCountry} />
                </dd>
              </div>
            )}
            <div>
              <dt>Capital</dt>
              <dd>{selectedCountry.capital}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{selectedCountry.subregion}, {selectedCountry.region}</dd>
            </div>
            {detailLevel !== "minimal" && (
              <>
                <div>
                  <dt>Population</dt>
                  <dd>{formatNumber.format(selectedCountry.population)}</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{formatArea(selectedCountry.area)}</dd>
                </div>
                <div>
                  <dt>Languages</dt>
                  <dd><LanguageList country={selectedCountry} /></dd>
                </div>
                <div>
                  <dt>Currencies</dt>
                  <dd>{selectedCountry.currencies.join(", ") || "Not listed"}</dd>
                </div>
                {selectedCountry.established && (
                  <div>
                    <dt>Established</dt>
                    <dd>{selectedCountry.established}</dd>
                  </div>
                )}
                {selectedCountry.highestPoint && (
                  <div>
                    <dt>Highest Point</dt>
                    <dd>{selectedCountry.highestPoint}</dd>
                  </div>
                )}
                {selectedCountry.namedAfter && (
                  <div>
                    <dt>Named After</dt>
                    <dd>{selectedCountry.namedAfter}</dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {detailLevel !== "minimal" && phrasebook && (
            <section className="info-section">
              <h3>Local Phrases ({phrasebook.language})</h3>
              <table className="phrases-table">
                <thead>
                  <tr>
                    <th>English</th>
                    <th>Local Script</th>
                    <th>Pronunciation</th>
                  </tr>
                </thead>
                <tbody>
                  {phrasebook.phrases.map((phrase, idx) => (
                    <tr key={idx}>
                      <td>{phrase.english}</td>
                      <td className="local-script">{phrase.local}</td>
                      <td className="phonetic">{phrase.phonetic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </aside>

      {/* Right Panel - Wikipedia Summary */}
      {detailLevel !== "minimal" && selectedCountry.wikipedia && (
        <aside className="right-wikipedia-panel side-panel">
          <div className="country-card">
            <section className="country-summary">
              <h3>Overview</h3>
              {selectedCountry.wikipedia.summary.split("\n\n").map((para, index) => (
                <p key={index}>{para}</p>
              ))}
              <a href={selectedCountry.wikipedia.sourceUrl} target="_blank" rel="noreferrer">
                Source: Wikipedia, {selectedCountry.wikipedia.title}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </section>
          </div>
        </aside>
      )}

      {/* Bottom Panel - Legend + Badges */}
      {detailLevel === "full" && (relationships?.allies.length || relationships?.unions.length || relationships?.tensions.length || relationships?.mildTensions.length || highlights.length) ? (
        <div className="bottom-relationships-panel">
          {/* Integrated Map Legend */}
          <div className="bottom-legend-section">
            <span className="legend-title">Map Legend:</span>
            <span><i className="legend-self" /> Selected</span>
            {relationships && relationships.allies.length > 0 && <span><i className="legend-ally" /> Allies ({relationships.allies.length})</span>}
            {relationships && relationships.unions.length > 0 && <span><i className="legend-union" /> Unions ({relationships.unions.length})</span>}
            {relationships && relationships.tensions.length > 0 && <span><i className="legend-tension" /> Tensions ({relationships.tensions.length})</span>}
            {relationships && relationships.mildTensions.length > 0 && <span><i className="legend-mild-tension" /> Mild Tensions ({relationships.mildTensions.length})</span>}
          </div>

          {/* Vertical Separator if there are badges */}
          {highlights.length > 0 && <div className="bottom-panel-separator" />}

          {/* Badges Container */}
          {highlights.length > 0 && (
            <div className="bottom-badges-section">
              {highlights.map((h, index) => (
                <div key={index} className={`relationship-badge ${h.type}`}>
                  <strong>
                    {renderLabelWithLinks(h.text, h.relatedCountries, onSelectCountry)}
                  </strong>
                  {h.detail && (
                    <span className="badge-detail">
                      ({renderLabelWithLinks(h.detail, h.relatedCountries, onSelectCountry)})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function CountryBrowser({
  countries,
  open,
  query,
  selectedCountry,
  selectedRegion,
  onOpenChange,
  onQueryChange,
  onRegionChange,
  onSelect,
}: {
  countries: Country[];
  open: boolean;
  query: string;
  selectedCountry: Country | null;
  selectedRegion: string;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onRegionChange: (region: string) => void;
  onSelect: (country: Country) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="country-drawer" aria-describedby={undefined}>
          <div className="drawer-header">
            <div>
              <Dialog.Title>Countries</Dialog.Title>
              <p>{countries.length} matches</p>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close country browser">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="drawer-controls">
            <label className="searchbox">
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search country, capital, or region"
              />
            </label>
             <AppSelect
              ariaLabel="Region"
              icon={<ListFilter size={18} aria-hidden="true" />}
              value={selectedRegion}
              options={regions.map((region) => ({
                value: region,
                label: region
              }))}
              onChange={onRegionChange}
              stretch
            />
          </div>

          <div className="country-list" aria-label="Countries">
            {countries.map((country) => (
              <button
                key={country.cca3}
                className={country.cca3 === selectedCountry?.cca3 ? "country-row active" : "country-row"}
                onClick={() => onSelect(country)}
              >
                <span className="row-flag">{country.emoji}</span>
                <span>
                  <strong>{country.name}</strong>
                  <small>{country.capital} · {country.sovereignty?.sovereignState ?? country.region}</small>
                </span>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  mapView,
  setMapView,
  mapDetailLevel,
  setMapDetailLevel,
  detailLevel,
  setDetailLevel,
  projectionType,
  setProjectionType,
  repeatMap,
  setRepeatMap,
  showCountryNames,
  setShowCountryNames,
  selectedRegion,
  isRussiaSubdivisionRegion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapView: MapView;
  setMapView: (view: MapView) => void;
  mapDetailLevel: MapDetailLevel;
  setMapDetailLevel: (level: MapDetailLevel) => void;
  detailLevel: DetailLevel;
  setDetailLevel: (level: DetailLevel) => void;
  projectionType: ProjectionType;
  setProjectionType: (type: ProjectionType) => void;
  repeatMap: boolean;
  setRepeatMap: (repeat: boolean) => void;
  showCountryNames: boolean;
  setShowCountryNames: (show: boolean) => void;
  selectedRegion: string;
  isRussiaSubdivisionRegion: (region: string) => boolean;
}) {
  const isSubdivisionMode =
    selectedRegion === "United States (States)" ||
    selectedRegion === "Canada (Provinces/Territories)" ||
    isRussiaSubdivisionRegion(selectedRegion);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="settings-dialog" aria-describedby={undefined}>
          <div className="drawer-header">
            <div>
              <Dialog.Title style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Settings size={20} /> Settings
              </Dialog.Title>
              <p>Configure map preferences and detail levels</p>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close settings">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="settings-form">
            <div className="settings-section">
              <h3>Map View</h3>

              <div className="settings-field">
                <div className="field-info">
                  <label>Map View Mode</label>
                  <span>Color countries by flag or default borders.</span>
                </div>
                <AppSelect
                  ariaLabel="Map style"
                  icon={<Layers size={18} aria-hidden="true" />}
                  value={mapView}
                  options={[
                    { value: "borders", label: "Borders" },
                    { value: "flagFills", label: "Flag fills" },
                  ]}
                  onChange={(value) => setMapView(value as MapView)}
                  stretch
                />
              </div>

              <div className="settings-field">
                <div className="field-info">
                  <label>Map Projection</label>
                  <span>Choose mathematical projection grid.</span>
                </div>
                <AppSelect
                  ariaLabel="Projection"
                  icon={<Compass size={18} aria-hidden="true" />}
                  value={projectionType}
                  options={[
                    { value: "equal-earth", label: "Equal Earth" },
                    { value: "mercator", label: "Mercator" },
                    { value: "orthographic", label: "3D Globe" },
                  ]}
                  onChange={(value) => setProjectionType(value as ProjectionType)}
                  stretch
                />
              </div>

              {(projectionType === "equal-earth" || projectionType === "mercator") && (
                <div className="settings-switch-field">
                  <div className="field-info">
                    <label>Repeat Map</label>
                    <span>Allow map to repeat horizontally.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={repeatMap}
                    onChange={(e) => setRepeatMap(e.target.checked)}
                  />
                </div>
              )}

              <div className="settings-switch-field">
                <div className="field-info">
                  <label>Country Names</label>
                  <span>Display country names directly on map labels.</span>
                </div>
                <input
                  type="checkbox"
                  checked={showCountryNames}
                  onChange={(e) => setShowCountryNames(e.target.checked)}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Details & Granularity</h3>

              <div className="settings-field">
                <div className="field-info">
                  <label>Map Boundary Detail</label>
                  <span>Set geographic granularity (countries vs. states/regions).</span>
                </div>
                <AppSelect
                  ariaLabel="Map detail"
                  icon={<Globe2 size={18} aria-hidden="true" />}
                  value={mapDetailLevel}
                  disabled={isSubdivisionMode}
                  options={[
                    { value: "minimal", label: "Minimal Detail (Colonies merged)" },
                    { value: "standard", label: "Standard Detail (Default country lines)" },
                    { value: "detailed", label: "Max Detail (Subdivisions & regions)" },
                  ]}
                  onChange={(value) => setMapDetailLevel(value as MapDetailLevel)}
                  stretch
                />
                {isSubdivisionMode && (
                  <span className="field-hint">Locked to Max Detail for sub-national regions.</span>
                )}
              </div>

              <div className="settings-field">
                <div className="field-info">
                  <label>Practice Sidebar Info Level</label>
                  <span>Configure volume of facts shown for selected countries.</span>
                </div>
                <AppSelect
                  ariaLabel="Detail level"
                  icon={<Info size={18} aria-hidden="true" />}
                  value={detailLevel}
                  options={[
                    { value: "full", label: "Full Details (History, phrases, full summary)" },
                    { value: "basic", label: "Basic Facts (Capital, region, language list)" },
                    { value: "minimal", label: "Minimal Info (Capital and basic metrics only)" },
                  ]}
                  onChange={(value) => setDetailLevel(value as DetailLevel)}
                  stretch
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Legacy CountryCard, hasGeopoliticalRelationships, and RelationshipHighlights components have been removed.
// Their layout has been refactored into the modular PracticePanel component.

function SovereigntyNote({ country }: { country: Country }) {
  const sovereignty = country.sovereignty;
  if (!sovereignty) return null;

  return (
    <span className={sovereignty.disputed ? "sovereignty-note disputed" : "sovereignty-note"}>
      <strong>
        {sovereignty.sovereignState ? `${sovereignty.sovereignState} · ${sovereignty.label}` : sovereignty.label}
      </strong>
      {sovereignty.note && <small>{sovereignty.note}</small>}
    </span>
  );
}

// Obsolete QuizPanel has been replaced by immersive config, active HUD, choices sidebar and summary cards.

export { App };

function LanguageList({ country }: { country: Country }) {
  if (!country.primaryLanguages.length && !country.otherLanguages.length) return <>Not listed</>;
  return (
    <span className="language-list">
      {country.primaryLanguages.map((language) => (
        <strong key={language}>{language}</strong>
      ))}
      {country.otherLanguages.map((language) => (
        <span key={language}>{language}</span>
      ))}
    </span>
  );
}

function FlagIcon({ country }: { country: Country }) {
  if (country.cca3.includes("-")) {
    const flagUrl = `/flags/${country.cca3.toLowerCase()}.svg`;
    return (
      <img
        src={flagUrl}
        alt={`${country.name} flag`}
        title={`${country.name} flag`}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={(e) => {
          if (country.alpha2) {
            e.currentTarget.src = `/flags/${country.alpha2.toLowerCase()}.svg`;
          }
        }}
      />
    );
  }

  if (!country.alpha2) {
    return (
      <span
        className="flag-placeholder"
        role="img"
        aria-label={`${country.name} flag not available`}
        title={`${country.name} flag not available`}
      >
        {country.emoji}
      </span>
    );
  }

  return (
    <span
      className={`fi fi-${country.alpha2.toLowerCase()}`}
      role="img"
      aria-label={`${country.name} flag`}
      title={`${country.name} flag`}
    />
  );
}

function AppSelect({
  ariaLabel,
  icon,
  options,
  value,
  onChange,
  stretch = false,
  disabled = false,
}: {
  ariaLabel: string;
  icon: ReactNode;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  stretch?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger className={stretch ? "select-trigger stretch" : "select-trigger"} aria-label={ariaLabel}>
        {icon}
        <Select.Value />
        <Select.Icon className="select-chevron">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={8}>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item className="select-item" key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="select-indicator">
                  <Check size={15} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
