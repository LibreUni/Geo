import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import "flag-icons/css/flag-icons.min.css";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json";
import countryData from "./data/countries.json";
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
} from "lucide-react";

type ViewMode = "practice" | "quiz";
type QuizMode = "locate" | "flag" | "facts";
type MapView = "borders" | "flagFills";
type ResultState = "idle" | "correct" | "wrong";
type RelationshipKind = "self" | "tension" | "mild-tension" | "ally" | "union" | "territory";

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
const MAX_MAP_ZOOM = 18;
const MAX_COUNTRY_HIT_AREA = WIDTH * HEIGHT * 0.6;
const SMALL_COUNTRY_HIT_AREA = 16;
const SMALL_COUNTRY_HIT_RADIUS = 9;
const MIN_SMALL_COUNTRY_HIT_RADIUS = 0.65;
const BASE_COUNTRY_STROKE_WIDTH = 0.55;
const MIN_COUNTRY_STROKE_WIDTH = 0.08;
const projection = geoEqualEarth().fitExtent(
  [
    [20, 20],
    [WIDTH - 20, HEIGHT - 20],
  ],
  { type: "Sphere" },
);
const path = geoPath(projection);
const geographies = (
  feature(
    atlas as unknown as Parameters<typeof feature>[0],
    (atlas as { objects: { countries: unknown } }).objects.countries as Parameters<typeof feature>[1],
  ) as GeoJSON.FeatureCollection<GeoJSON.Geometry, { id?: string; name?: string }>
).features as Geography[];

function geoId(geo: Geography) {
  const rawId = geo.id;
  if (rawId !== undefined && rawId !== null) return String(rawId).padStart(3, "0");
  return `geo:${geo.properties?.name ?? "Unknown"}`;
}

function clipId(id: string) {
  return `flag-clip-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function projectedGeometry(geo: Geography): MapGeometry {
  const id = geoId(geo);
  const [x, y] = path.centroid(geo);
  return {
    id,
    clipId: clipId(id),
    name: geo.properties?.name ?? "Unknown",
    d: path(geo) ?? undefined,
    area: path.area(geo),
    bounds: path.bounds(geo),
    centroid: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null,
  };
}

const mapGeographies = geographies.map(projectedGeometry);
const geographyByNumeric = new Map(mapGeographies.map((geo) => [geo.id, geo]));
const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const formatArea = (area: number) => `${formatNumber.format(Math.round(area))} km2`;
const regions = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania", "Antarctic"];

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

function loadCountries(): Country[] {
  return (countryData as Country[]).filter((country) => country.ccn3 && geographyByNumeric.has(country.ccn3));
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
  const countries = useMemo(loadCountries, []);
  const [view, setView] = useState<ViewMode>("practice");
  const [countryBrowserOpen, setCountryBrowserOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [query, setQuery] = useState("");
  const [mapView, setMapView] = useState<MapView>("borders");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState<QuizMode>("locate");
  const [quizCountry, setQuizCountry] = useState<Country | null>(null);
  const [choices, setChoices] = useState<Country[]>([]);
  const [result, setResult] = useState<ResultState>("idle");
  const [lastGuess, setLastGuess] = useState<Country | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });

  const countryByNumeric = useMemo(
    () => new Map(countries.map((country) => [country.ccn3, country])),
    [countries],
  );
  const countryByCode = useMemo(
    () => new Map(countries.map((country) => [country.cca3, country])),
    [countries],
  );

  const filteredCountries = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return countries.filter((country) => {
      const regionMatch = selectedRegion === "All" || country.region === selectedRegion;
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
  const selectedRelationships = useMemo(
    () => (selectedCountry ? relationshipSummary(selectedCountry, countries) : null),
    [countries, selectedCountry],
  );
  const quizPool = useMemo(
    () => countries.filter((country) => Boolean(country.alpha2) && (selectedRegion === "All" || country.region === selectedRegion)),
    [countries, selectedRegion],
  );

  function nextQuestion(mode = quizMode) {
    if (quizPool.length < 4) return;
    const target = pickRandom(quizPool, quizCountry ?? undefined);
    const distractors = shuffled(quizPool.filter((country) => country.cca3 !== target.cca3)).slice(0, 3);
    setQuizCountry(target);
    setChoices(shuffled([target, ...distractors]));
    setResult("idle");
    setLastGuess(null);
    setQuizMode(mode);
    setSelectedCode(null);
  }

  useEffect(() => {
    if (view === "quiz" && quizPool.length >= 4 && !quizCountry) {
      nextQuestion(quizMode);
    }
  }, [view, quizPool.length]);

  function checkAnswer(country: Country) {
    if (!quizCountry || result !== "idle") return;
    const correct = country.cca3 === quizCountry.cca3;
    setResult(correct ? "correct" : "wrong");
    setLastGuess(country);
    setSelectedCode(country.cca3);
    setScore((current) => ({
      correct: current.correct + (correct ? 1 : 0),
      total: current.total + 1,
      streak: correct ? current.streak + 1 : 0,
    }));
  }

  function changeQuizMode(mode: QuizMode) {
    setQuizMode(mode);
    setScore({ correct: 0, total: 0, streak: 0 });
    setQuizCountry(null);
    setTimeout(() => nextQuestion(mode), 0);
  }

  function selectFromMap(country: Country) {
    if (view === "quiz" && quizMode === "locate" && quizCountry) {
      checkAnswer(country);
      return;
    }
    setSelectedCode(country.cca3);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <Globe2 size={30} aria-hidden="true" />
          <div>
            <h1>GeoLearn</h1>
            <p>{countries.length ? `${countries.length} countries loaded` : "World countries, flags, facts, and map practice"}</p>
          </div>
        </div>
        <nav className="mode-switch" aria-label="Mode">
          <button className={view === "practice" ? "active" : ""} onClick={() => setView("practice")}>
            <MapPinned size={18} />
            <span>Practice</span>
          </button>
          <button className={view === "quiz" ? "active" : ""} onClick={() => setView("quiz")}>
            <HelpCircle size={18} />
            <span>Quizzes</span>
          </button>
        </nav>
      </header>

      <WorldMap
        countries={countries}
        countryByNumeric={countryByNumeric}
        filteredCountries={filteredCountries}
        selectedCountry={selectedCountry}
        selectedRelationships={selectedRelationships}
        quizCountry={view === "quiz" && quizMode === "locate" ? quizCountry : null}
        result={result}
        mapView={mapView}
        onCountrySelect={selectFromMap}
        onMapClear={() => setSelectedCode(null)}
      />

      <section className="floating-controls" aria-label="Map and country controls">
        <button className="control-button primary" type="button" onClick={() => setCountryBrowserOpen(true)}>
          <Menu size={18} aria-hidden="true" />
          Countries
          <span>{filteredCountries.length}</span>
        </button>
        <AppSelect
          ariaLabel="Map style"
          icon={<Layers size={18} aria-hidden="true" />}
          value={mapView}
          options={[
            { value: "borders", label: "Borders" },
            { value: "flagFills", label: "Flag fills" },
          ]}
          onChange={(value) => setMapView(value as MapView)}
        />
      </section>

      <CountryBrowser
        countries={filteredCountries}
        open={countryBrowserOpen}
        query={query}
        selectedCountry={selectedCountry}
        selectedRegion={selectedRegion}
        onOpenChange={setCountryBrowserOpen}
        onQueryChange={setQuery}
        onRegionChange={setSelectedRegion}
        onSelect={(country) => {
          setSelectedCode(country.cca3);
          setCountryBrowserOpen(false);
        }}
      />

      {view === "practice" && selectedCountry ? (
        <PracticePanel selectedCountry={selectedCountry} relationships={selectedRelationships} countries={countries} />
      ) : view === "quiz" ? (
        <QuizPanel
          mode={quizMode}
          country={quizCountry}
          choices={choices}
          result={result}
          lastGuess={lastGuess}
          score={score}
          onModeChange={changeQuizMode}
          onChoice={checkAnswer}
          onNext={() => nextQuestion()}
          onReset={() => setScore({ correct: 0, total: 0, streak: 0 })}
        />
      ) : null}
    </main>
  );
}

function WorldMap({
  countries,
  countryByNumeric,
  filteredCountries,
  selectedCountry,
  selectedRelationships,
  quizCountry,
  result,
  mapView,
  onCountrySelect,
  onMapClear,
}: {
  countries: Country[];
  countryByNumeric: Map<string, Country>;
  filteredCountries: Country[];
  selectedCountry: Country | null;
  selectedRelationships: ReturnType<typeof relationshipSummary> | null;
  quizCountry: Country | null;
  result: ResultState;
  mapView: MapView;
  onCountrySelect: (country: Country) => void;
  onMapClear: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const wasDraggingRef = useRef(false);
  const [mapTransform, setMapTransform] = useState({ scale: 1, x: 0, y: 0 });
  const filteredCodes = useMemo(() => new Set(filteredCountries.map((country) => country.cca3)), [filteredCountries]);
  const showFlagFills = mapView === "flagFills";
  const smallCountryHitboxes = useMemo(
    () =>
      mapGeographies
        .map((geo) => ({ geo, country: countryByNumeric.get(geo.id) }))
        .filter(
          (item): item is { geo: MapGeometry; country: Country } =>
            Boolean(item.country) &&
            filteredCodes.has(item.country!.cca3) &&
            item.geo.area > 0 &&
            item.geo.area < SMALL_COUNTRY_HIT_AREA &&
            Boolean(item.geo.centroid),
        ),
    [countryByNumeric, filteredCodes],
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
    };
    wasDraggingRef.current = false;
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.pointerId !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) * WIDTH) / rect.width;
    const dy = ((event.clientY - drag.startY) * HEIGHT) / rect.height;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDraggingRef.current = true;
    setMapTransform((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      window.setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    }
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
      return projection([lon, lat]);
    }
    const geo = geographyByNumeric.get(country.ccn3);
    return geo?.centroid ?? null;
  }

  function needsQuizMarker(country: Country) {
    const geo = geographyByNumeric.get(country.ccn3);
    return !geo || geo.area < 18;
  }

  function smallCountryHitRadius() {
    return Math.max(MIN_SMALL_COUNTRY_HIT_RADIUS, SMALL_COUNTRY_HIT_RADIUS / mapTransform.scale);
  }

  const quizMarkerPoint = quizCountry && needsQuizMarker(quizCountry) ? getMarkerPoint(quizCountry) : null;
  const countryStrokeWidth = Math.max(
    MIN_COUNTRY_STROKE_WIDTH,
    BASE_COUNTRY_STROKE_WIDTH / Math.pow(mapTransform.scale, 1.35),
  );

  return (
    <section className="map-panel" aria-label="World map">
      <div className="map-tools" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomAt(mapTransform.scale * 1.45)} aria-label="Zoom in">
          <ZoomIn size={18} />
        </button>
        <button type="button" onClick={() => zoomAt(mapTransform.scale / 1.45)} aria-label="Zoom out">
          <ZoomOut size={18} />
        </button>
        <button type="button" onClick={() => setMapTransform({ scale: 1, x: 0, y: 0 })} aria-label="Reset map zoom">
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
        <rect className="ocean" width={WIDTH} height={HEIGHT} rx="0" onClick={clearMapSelection} />
        <g transform={`translate(${mapTransform.x} ${mapTransform.y}) scale(${mapTransform.scale})`}>
          {showFlagFills && (
            <>
              <defs>
                {mapGeographies.map((geo) => (
                  <clipPath key={geo.id} id={geo.clipId}>
                    <path d={geo.d} />
                  </clipPath>
                ))}
              </defs>
              {mapGeographies.map((geo) => {
                const country = countryByNumeric.get(geo.id);
                if (!country?.alpha2 || !filteredCodes.has(country.cca3)) return null;
                const [[x0, y0], [x1, y1]] = geo.bounds;
                if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
                return (
                  <foreignObject
                    key={`flag-${geo.id}`}
                    className="country-flag-fill"
                    x={x0}
                    y={y0}
                    width={Math.max(1, x1 - x0)}
                    height={Math.max(1, y1 - y0)}
                    clipPath={`url(#${geo.clipId})`}
                  >
                    <span className={`fi fi-${country.alpha2.toLowerCase()}`} />
                  </foreignObject>
                );
              })}
            </>
          )}
          {mapGeographies.map((geo) => {
            const country = countryByNumeric.get(geo.id);
            const isSelected = country?.cca3 === selectedCountry?.cca3;
            const isTarget = country?.cca3 === quizCountry?.cca3;
            const relation = relationshipKind(selectedCountry, country);
            const visible = country ? filteredCodes.has(country.cca3) : false;
            const hasSaneHitArea = geo.area < MAX_COUNTRY_HIT_AREA;
            const className = [
              "country",
              !hasSaneHitArea ? "no-hit" : "",
              showFlagFills && country?.alpha2 && visible ? "flagged" : "",
              visible ? "visible" : "muted",
              relation ? `relationship-${relation}` : "",
              isSelected ? "selected" : "",
              result !== "idle" && isTarget ? "answer" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <path
                key={geo.id}
                className={className}
                d={geo.d}
                strokeWidth={countryStrokeWidth}
                onClick={() => country && hasSaneHitArea && selectCountry(country)}
              >
                <title>{country?.name ?? geo.name}</title>
              </path>
            );
          })}
          {smallCountryHitboxes.map(({ geo, country }) => (
            <circle
              key={`hit-${country.cca3}`}
              className="island-hitbox"
              cx={geo.centroid![0]}
              cy={geo.centroid![1]}
              r={smallCountryHitRadius()}
              onClick={() => selectCountry(country)}
            >
              <title>{country.name}</title>
            </circle>
          ))}
          {quizCountry && quizMarkerPoint && (
            <g
              className="quiz-target-marker"
              transform={`translate(${quizMarkerPoint[0]} ${quizMarkerPoint[1]})`}
              onClick={() => selectCountry(quizCountry)}
            >
              <circle r="18" />
              <path d="M0 -8v16M-8 0h16" />
              <title>{quizCountry.name}</title>
            </g>
          )}
        </g>
      </svg>
      {selectedCountry && selectedRelationships && (
        <MapLegend
          country={selectedCountry}
          activeTensions={selectedRelationships.tensions.length}
          historicalTensions={selectedRelationships.mildTensions.length}
          allies={selectedRelationships.allies.length}
          unions={selectedRelationships.unions.length}
        />
      )}
    </section>
  );
}

function MapLegend({
  country,
  activeTensions,
  historicalTensions,
  allies,
  unions,
}: {
  country: Country;
  activeTensions: number;
  historicalTensions: number;
  allies: number;
  unions: number;
}) {
  return (
    <div className="map-legend" aria-label={`Relationship colors for ${country.name}`}>
      <span><i className="legend-self" /> Selected</span>
      {allies > 0 && <span><i className="legend-ally" /> Allies {allies}</span>}
      {unions > 0 && <span><i className="legend-union" /> Unions {unions}</span>}
      {activeTensions > 0 && <span><i className="legend-tension" /> Active Tensions {activeTensions}</span>}
      {historicalTensions > 0 && <span><i className="legend-mild-tension" /> Mild/Historical Tensions {historicalTensions}</span>}
    </div>
  );
}

function PracticePanel({
  selectedCountry,
  relationships,
  countries,
}: {
  selectedCountry: Country;
  relationships: ReturnType<typeof relationshipSummary> | null;
  countries: Country[];
}) {
  return (
    <aside className="side-panel">
      <CountryCard country={selectedCountry} relationships={relationships} countries={countries} />
    </aside>
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
              options={regions.map((region) => ({ value: region, label: region }))}
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

function CountryCard({
  country,
  relationships,
  countries,
}: {
  country: Country;
  relationships: ReturnType<typeof relationshipSummary> | null;
  countries: Country[];
}) {
  const phrasebook = findPhrasebook(country);
  return (
    <article className="country-card">
      <div className="flag-frame">
        <FlagIcon country={country} />
      </div>
      <h2>{country.name}</h2>
      <p>{country.official}</p>
      <dl>
        {country.sovereignty && (
          <div>
            <dt>{country.sovereignty.disputed ? "Status" : "Sovereignty"}</dt>
            <dd>
              <SovereigntyNote country={country} />
            </dd>
          </div>
        )}
        <div>
          <dt>Capital</dt>
          <dd>{country.capital}</dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>{country.subregion}, {country.region}</dd>
        </div>
        <div>
          <dt>Population</dt>
          <dd>{formatNumber.format(country.population)}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{formatArea(country.area)}</dd>
        </div>
        <div>
          <dt>Languages</dt>
          <dd><LanguageList country={country} /></dd>
        </div>
        <div>
          <dt>Currencies</dt>
          <dd>{country.currencies.join(", ") || "Not listed"}</dd>
        </div>
      </dl>
      {phrasebook && (
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
      {relationships && hasGeopoliticalRelationships(country, countries) && (
        <section className="info-section">
          <h3>Key Relationships & Status</h3>
          <RelationshipHighlights selectedCountry={country} countries={countries} />
        </section>
      )}
      {country.wikipedia && (
        <section className="info-section country-summary">
          <h3>Overview</h3>
          <p>{country.wikipedia.summary}</p>
          <a href={country.wikipedia.sourceUrl} target="_blank" rel="noreferrer">
            Source: Wikipedia, {country.wikipedia.title}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </section>
      )}
    </article>
  );
}

function hasGeopoliticalRelationships(selectedCountry: Country, countries: Country[]): boolean {
  // 1. Tensions
  const hasTensions = tensionsList.some((t) => t.countries.includes(selectedCountry.cca3));
  if (hasTensions) return true;

  // 2. Unions
  const hasUnions = Object.values(unionGroups).some((members) => members.includes(selectedCountry.cca3));
  if (hasUnions) return true;

  // 3. Alliances
  const hasAlliances = Object.values(allyGroups).some((members) => members.includes(selectedCountry.cca3));
  if (hasAlliances) return true;

  // 4. Territory link (to sovereign state)
  if (selectedCountry.sovereignty?.sovereignState) return true;

  // 5. Territory link (has external territories)
  const hasExternalTerritories = countries.some(
    (c) => c.sovereignty?.sovereignState === selectedCountry.name
  );
  if (hasExternalTerritories) return true;

  return false;
}

type HighlightItem = {
  type: "active-tension" | "mild-tension" | "ally" | "union" | "territory";
  text: string;
  detail?: string;
};

function RelationshipHighlights({
  selectedCountry,
  countries,
}: {
  selectedCountry: Country;
  countries: Country[];
}) {
  const countryByCode = useMemo(
    () => new Map(countries.map((c) => [c.cca3, c])),
    [countries]
  );

  const highlights = useMemo(() => {
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
        });
      }
    });

    // 2. Unions
    Object.entries(unionGroups).forEach(([groupName, members]) => {
      if (members.includes(selectedCountry.cca3)) {
        list.push({
          type: "union",
          text: groupName === "European Union" ? "European Union" : `Member of ${groupName}`,
        });
      }
    });

    // 3. Alliances
    Object.entries(allyGroups).forEach(([groupName, members]) => {
      if (members.includes(selectedCountry.cca3)) {
        list.push({
          type: "ally",
          text: groupName === "NATO" ? "NATO Alliance" : `Member of ${groupName} Alliance`,
        });
      }
    });

    // 4. Territory (Link to sovereign state)
    if (selectedCountry.sovereignty?.sovereignState) {
      list.push({
        type: "territory",
        text: `Territory of ${selectedCountry.sovereignty.sovereignState}`,
        detail: selectedCountry.sovereignty.label,
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
      });
    }

    return list;
  }, [selectedCountry, countries, countryByCode]);

  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className="highlights-list">
      {highlights.map((h, index) => (
        <div key={index} className={`relationship-preview ${h.type}`}>
          <strong>{h.text}</strong>
          {h.detail && <span>{h.detail}</span>}
        </div>
      ))}
    </div>
  );
}

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

function QuizPanel({
  mode,
  country,
  choices,
  result,
  lastGuess,
  score,
  onModeChange,
  onChoice,
  onNext,
  onReset,
}: {
  mode: QuizMode;
  country: Country | null;
  choices: Country[];
  result: ResultState;
  lastGuess: Country | null;
  score: { correct: number; total: number; streak: number };
  onModeChange: (mode: QuizMode) => void;
  onChoice: (country: Country) => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;
  return (
    <aside className="side-panel quiz-panel">
      <div className="quiz-tabs" role="tablist" aria-label="Quiz type">
        <button className={mode === "locate" ? "active" : ""} onClick={() => onModeChange("locate")}>Locate</button>
        <button className={mode === "flag" ? "active" : ""} onClick={() => onModeChange("flag")}>Flag</button>
        <button className={mode === "facts" ? "active" : ""} onClick={() => onModeChange("facts")}>Facts</button>
      </div>

      <div className="scoreboard">
        <span>{score.correct}/{score.total}</span>
        <span>{accuracy}%</span>
        <span>{score.streak} streak</span>
        <button onClick={onReset} aria-label="Reset score"><RotateCcw size={16} /></button>
      </div>

      {country && (
        <div className="prompt">
          {mode === "locate" && (
            <>
              <h2>Find {country.name}</h2>
              <p>Click the country on the map.</p>
            </>
          )}
          {mode === "flag" && (
            <>
              <div className="quiz-flag"><FlagIcon country={country} /></div>
              <h2>Which country uses this flag?</h2>
            </>
          )}
          {mode === "facts" && (
            <>
              <h2>Which country matches?</h2>
              <ul className="fact-list">
                <li>Capital: {country.capital}</li>
                <li>Region: {country.subregion}, {country.region}</li>
                <li>Primary language: {country.primaryLanguages.join(", ") || "Not listed"}</li>
                <li>Population: {formatNumber.format(country.population)}</li>
                <li>Area: {formatArea(country.area)}</li>
              </ul>
            </>
          )}
        </div>
      )}

      {mode !== "locate" && (
        <div className="choices">
          {choices.map((choice) => (
            <button key={choice.cca3} onClick={() => onChoice(choice)} disabled={result !== "idle"}>
              <span>{choice.emoji}</span>
              {choice.name}
            </button>
          ))}
        </div>
      )}

      {result !== "idle" && country && (
        <div className={`result ${result}`}>
          {result === "correct" ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span>
            {result === "correct"
              ? `Correct: ${country.name}`
              : `That was ${lastGuess?.name ?? "not it"}. Answer: ${country.name}.`}
          </span>
          <button onClick={onNext}>Next</button>
        </div>
      )}
    </aside>
  );
}

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
}: {
  ariaLabel: string;
  icon: ReactNode;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  stretch?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
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
