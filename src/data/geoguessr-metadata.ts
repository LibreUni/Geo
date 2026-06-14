/**
 * Geoguessr-focused metadata and helper maps.
 * Provides data on driving sides, license plate styles, internet ccTLDs, and calling codes.
 */

// Set of 3-letter codes (cca3) for countries and territories that drive on the left.
export const LEFT_DRIVING_COUNTRIES = new Set([
  // Europe
  "GBR", "IRL", "MLT", "CYP",
  // Asia
  "JPN", "THA", "IDN", "MYS", "SGP", "BRN", "TLS", "IND", "PAK", "BGD", "LKA", "NPL", "BTN", "MDV",
  // Africa
  "ZAF", "NAM", "BWA", "LSO", "SWZ", "ZWE", "MOZ", "ZMB", "MWI", "TZA", "KEN", "UGA", "MUS", "SYC",
  // Oceania
  "AUS", "NZL", "FJI", "PNG", "SLB", "WSM", "TON", "TUV", "KIR", "NRU",
  // South America
  "GUY", "SUR",
  // Caribbean / Atlantic / Territories
  "JAM", "BHS", "BRB", "TTO", "ATG", "DMA", "GRD", "KNA", "LCA", "VCT",
  "VIR", "VGB", "CYM", "BMU", "FLK", "AIA", "MSR", "TCA", "HKG", "MAC",
  "CXR", "CCK", "NFK", "COK", "NIU", "TKL", "PCN", "SHN"
]);

// Map of 3-letter codes (cca3) to their international calling codes.
export const CALLING_CODES: Record<string, string> = {
  // North America
  USA: "+1", CAN: "+1", MEX: "+52", GRL: "+299", PMR: "+508",
  // Central America & Caribbean
  GTM: "+502", BLZ: "+501", HND: "+504", SLV: "+503", NIC: "+505", CRI: "+506", PAN: "+507",
  CUB: "+53", JAM: "+1", HTI: "+509", DOM: "+1", BHS: "+1",
  // South America
  COL: "+57", VEN: "+58", GUY: "+592", SUR: "+597", GUF: "+594",
  ECU: "+593", PER: "+51", BOL: "+591", BRA: "+55", PRY: "+595",
  CHL: "+56", ARG: "+54", URY: "+598", FLK: "+500",
  // Western Europe
  GBR: "+44", IRL: "+353", FRA: "+33", NLD: "+31", BEL: "+32", LUX: "+352", DEU: "+49",
  CHE: "+41", AUT: "+43", LIE: "+423", MCO: "+377", AND: "+376",
  // Northern Europe
  ISL: "+354", NOR: "+47", SWE: "+46", DNK: "+45", FIN: "+358",
  EST: "+372", LVA: "+371", LTU: "+370", FRO: "+298",
  // Southern Europe
  ESP: "+34", PRT: "+351", ITA: "+39", GRC: "+30", MLT: "+356", CYP: "+357",
  ALB: "+355", MKD: "+389", MNE: "+382", SRB: "+381", HRV: "+385", SVN: "+386",
  BIH: "+387", SMR: "+378", VAT: "+39", GIB: "+350",
  // Eastern Europe
  POL: "+48", CZE: "+420", SVK: "+421", HUN: "+36", ROU: "+40", BGR: "+359",
  UKR: "+380", BLR: "+375", MDA: "+373", RUS: "+7",
  // Central Asia & Caucasus
  KAZ: "+7", UZB: "+998", TJK: "+992", TKM: "+993", KGZ: "+996",
  ARM: "+374", AZE: "+994", GEO: "+995",
  // East Asia
  CHN: "+86", JPN: "+81", KOR: "+82", PRK: "+850", TWN: "+886", HKG: "+852", MAC: "+853", MNG: "+976",
  // Southeast Asia
  THA: "+66", IDN: "+62", MYS: "+60", SGP: "+65", PHL: "+63", VNM: "+84", MMR: "+95",
  KHM: "+855", LAO: "+856", BRN: "+673", TLS: "+670",
  // South Asia
  IND: "+91", PAK: "+92", BGD: "+880", LKA: "+94", NPL: "+977", BTN: "+975", MDV: "+960", AFG: "+93",
  // Middle East
  TUR: "+90", SYR: "+963", LBN: "+961", ISR: "+972", PSE: "+970", JOR: "+962",
  IRQ: "+964", SAU: "+966", YEM: "+967", OMN: "+968", ARE: "+971", QAT: "+974",
  BHR: "+973", KWT: "+965", IRN: "+98",
  // Oceania
  AUS: "+61", NZL: "+64", PNG: "+675", FJI: "+679", SLB: "+677", VUT: "+678",
  NCL: "+687", PYF: "+689", WSM: "+685", TON: "+676", KIR: "+686", TUV: "+688",
  NRU: "+674", FSM: "+691", MHL: "+692", PLW: "+680", GUM: "+1", MNP: "+1",
  ASM: "+1", WLF: "+681",
  // Africa
  EGY: "+20", MAR: "+212", DZA: "+213", TUN: "+216", LBY: "+218", SDN: "+249",
  SSD: "+211", ERI: "+291", ETH: "+251", DJI: "+253", SOM: "+252", KEN: "+254",
  UGA: "+256", TZA: "+255", RWA: "+250", BDI: "+257", MOZ: "+258", MWI: "+265",
  ZMB: "+260", ZWE: "+263", NAM: "+264", BWA: "+267", ZAF: "+27", LSO: "+266",
  SWZ: "+268", AGO: "+244", MDG: "+261", MUS: "+230", SYC: "+248", COM: "+269",
  CPV: "+238", SEN: "+221", GMB: "+220", GIN: "+224", GNB: "+245", SLE: "+232",
  LBR: "+231", CIV: "+225", GHA: "+233", TGO: "+228", BEN: "+229", NER: "+227",
  NGA: "+234", CMR: "+237", TCD: "+235", CAF: "+236", GNQ: "+240", GAB: "+241",
  COG: "+242", COD: "+243", STP: "+239", SHN: "+290"
};

// Map of 3-letter codes (cca3) to their primary license plate style.
export const LICENSE_PLATES: Record<string, string> = {
  // Blue Left Band (Euroband)
  DEU: "euroband", ESP: "euroband", POL: "euroband", ROU: "euroband", SWE: "euroband",
  PRT: "euroband", AUT: "euroband", CZE: "euroband", HUN: "euroband", GRC: "euroband",
  BGR: "euroband", SVK: "euroband", DNK: "euroband", FIN: "euroband", IRL: "euroband",
  HRV: "euroband", LTU: "euroband", LVA: "euroband", SVN: "euroband", EST: "euroband",
  TUR: "euroband", UKR: "euroband", SRB: "euroband", MNE: "euroband", MKD: "euroband",
  MDA: "euroband", GEO: "euroband", GIB: "euroband", AND: "euroband", SMR: "euroband",
  CYP: "euroband", MLT: "euroband",
  
  // Double Blue Bands (Left & Right)
  ITA: "double-blue-band", FRA: "double-blue-band", ALB: "double-blue-band",
  
  // Blue Top Band (Mercosur)
  BRA: "mercosur", ARG: "mercosur", URY: "mercosur", PRY: "mercosur", BOL: "mercosur",
  
  // Yellow (Front & Rear)
  NLD: "yellow-both", LUX: "yellow-both", ISR: "yellow-both", COL: "yellow-both",
  LKA: "yellow-both",
  
  // Yellow Rear, White Front
  GBR: "yellow-rear", HKG: "yellow-rear", MAC: "yellow-rear", KEN: "yellow-rear",
  
  // White with Red Text / Borders
  BEL: "red-text",
  
  // Black Background
  LIE: "black-bg", IDN: "black-bg", MYS: "black-bg"
};

// Metadata describing plate styles
export const LICENSE_PLATE_STYLES: Record<string, { label: string; color: string }> = {
  "euroband": { label: "Blue Left Band (Euroband)", color: "#3b82f6" },
  "double-blue-band": { label: "Double Blue Bands (IT, FR, AL)", color: "#1d4ed8" },
  "mercosur": { label: "Blue Top Band (Mercosur)", color: "#60a5fa" },
  "yellow-both": { label: "Yellow (Front & Rear)", color: "#fbbf24" },
  "yellow-rear": { label: "Yellow Rear, White Front (UK, etc.)", color: "#f59e0b" },
  "red-text": { label: "Red Text / Border (Belgium)", color: "#ef4444" },
  "black-bg": { label: "Black Background (Liechtenstein, IDN, MYS)", color: "#334155" },
  "white-standard": { label: "Standard White (Universal)", color: "#e2e8f0" }
};
