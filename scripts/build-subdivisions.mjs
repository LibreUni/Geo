import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(__dirname, "../src/data");
const flagsDir = join(__dirname, "../public/flags");
const emblemsDir = join(__dirname, "../public/emblems");

mkdirSync(dataDir, { recursive: true });
mkdirSync(flagsDir, { recursive: true });
mkdirSync(emblemsDir, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadFile(url, destName) {
  console.log(`Downloading ${url} -> ${destName}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  const text = await res.text();
  writeFileSync(join(dataDir, destName), text);
  console.log(`Saved ${destName}`);
}

async function downloadImage(url, destPath) {
  let retries = 3;
  let delayMs = 3000;
  
  while (retries > 0) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "GeoLearn/1.0 (geography learning app; mailto:admin@example.local)"
        }
      });
      
      if (res.status === 429) {
        console.warn(`Rate limited (429) on ${url}. Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        retries--;
        delayMs *= 2;
        continue;
      }
      
      if (!res.ok) {
        console.warn(`Failed to download image ${url}: ${res.statusText} (${res.status})`);
        return false;
      }
      
      const buffer = await res.arrayBuffer();
      writeFileSync(destPath, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.warn(`Error downloading image ${url} to ${destPath}:`, err);
      retries--;
      await delay(delayMs);
      delayMs *= 2;
    }
  }
  return false;
}

async function fetchWikipediaSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GeoLearn/1.0 (geography learning app; mailto:admin@example.local)"
      }
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (typeof data.extract === "string" && data.extract.trim()) {
      return {
        title: data.title || title,
        summary: data.extract,
        sourceUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
      };
    }
  } catch (err) {
    console.error(`Error fetching Wikipedia summary for ${title}:`, err);
  }
  return null;
}

async function main() {
  try {
    // 1. Download global admin-1 dataset from martynafford
    await downloadFile(
      "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_1_states_provinces.json",
      "global-admin1.json"
    );
    
    // 2. Load the boundary files to map ISO codes to local English names (failsafe for Wikidata label issues)
    const globalAdmin1Path = join(dataDir, "global-admin1.json");
    const globalAdmin1Data = JSON.parse(readFileSync(globalAdmin1Path, "utf8"));
    
    const russiaRegionsPath = join(dataDir, "russia-regions-shapes.json");
    const russiaRegionsData = JSON.parse(readFileSync(russiaRegionsPath, "utf8"));
    const russiaGeoJSON = feature(russiaRegionsData, russiaRegionsData.objects.name);
    
    const nameByIso = new Map();
    
    // Map names from Natural Earth
    globalAdmin1Data.features.forEach(f => {
      const iso = f.properties.iso_3166_2;
      const name = f.properties.name;
      if (iso && name) {
        nameByIso.set(iso, name);
      }
    });
    
    // Map names from Russia regions
    russiaGeoJSON.features.forEach(f => {
      const iso2 = f.properties.ISO_2;
      const name = f.properties.NAME_1;
      if (iso2 && name) {
        nameByIso.set(`RU-${iso2}`, name);
      }
    });
    
    // Add manual entries/fallbacks
    nameByIso.set("RU-CRI", "Crimea");
    nameByIso.set("RU-SEV", "Sevastopol");
    nameByIso.set("US-DC", "District of Columbia");

    // 3. Query Wikidata for details, including flag, emblem, inception, highest point, and named after
    console.log("Fetching subnational metadata from Wikidata...");
    const query = `
SELECT DISTINCT ?item ?itemLabel ?isoCode ?capitalLabel ?population ?area ?wikipediaTitle ?parent ?flag ?coatOfArms ?inception ?highestPointLabel ?elevation ?namedAfterLabel WHERE {
  {
    ?item wdt:P31 wd:Q35657. # US State
    BIND("USA" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q144795. # US Federal District
    BIND("USA" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q11828004. # Canadian Province
    BIND("CAN" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q9357527. # Canadian Territory
    BIND("CAN" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q5852411. # Australian State
    BIND("AUS" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q14192234. # Australian Territory
    BIND("AUS" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q485258. # Federative unit of Brazil
    BIND("BRA" AS ?parent)
  } UNION {
    ?item wdt:P31 wd:Q27495502. # Federal district of Brazil
    BIND("BRA" AS ?parent)
  } UNION {
    ?item wdt:P17 wd:Q159; # Russia
          wdt:P300 ?russianIsoCode.
    FILTER(STRSTARTS(?russianIsoCode, "RU-"))
    BIND("RUS" AS ?parent)
  }
  
  ?item wdt:P300 ?isoCode.
  OPTIONAL { ?item wdt:P36 ?capital. ?capital rdfs:label ?capitalLabel. FILTER(LANG(?capitalLabel) = "en") }
  OPTIONAL { ?item wdt:P1082 ?population. }
  OPTIONAL { ?item wdt:P2046 ?area. }
  OPTIONAL { ?item wdt:P41 ?flag. }
  OPTIONAL { ?item wdt:P94 ?coatOfArms. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL {
    ?item wdt:P610 ?highestPoint.
    ?highestPoint rdfs:label ?highestPointLabel.
    FILTER(LANG(?highestPointLabel) = "en")
    OPTIONAL { ?highestPoint wdt:P2044 ?elevation. }
  }
  OPTIONAL {
    ?item wdt:P138 ?namedAfter.
    ?namedAfter rdfs:label ?namedAfterLabel.
    FILTER(LANG(?namedAfterLabel) = "en")
  }
  
  OPTIONAL {
    ?wikipediaTitleLink schema:about ?item;
                         schema:isPartOf <https://en.wikipedia.org/>;
                         schema:name ?wikipediaTitle.
  }
  
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?isoCode
`;

    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
    const wikidataRes = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "GeoLearnApp/1.0 (https://example.local; mailto:admin@example.local)"
      }
    });

    if (!wikidataRes.ok) {
      throw new Error(`Wikidata query failed: ${wikidataRes.statusText}`);
    }

    const wikidataJson = await wikidataRes.json();
    const rawResults = wikidataJson.results.bindings.map(b => ({
      wikiId: b.item.value.split("/").pop(),
      name: b.itemLabel.value,
      iso: b.isoCode.value,
      capital: b.capitalLabel ? b.capitalLabel.value : "",
      population: b.population ? parseInt(b.population.value, 10) : 0,
      area: b.area ? Math.round(parseFloat(b.area.value)) : 0,
      wikipediaTitle: b.wikipediaTitle ? b.wikipediaTitle.value : "",
      parent: b.parent ? b.parent.value : "",
      flag: b.flag ? b.flag.value : "",
      coatOfArms: b.coatOfArms ? b.coatOfArms.value : "",
      inception: b.inception ? b.inception.value : "",
      highestPointLabel: b.highestPointLabel ? b.highestPointLabel.value : "",
      elevation: b.elevation ? Math.round(parseFloat(b.elevation.value)) : null,
      namedAfterLabel: b.namedAfterLabel ? b.namedAfterLabel.value : ""
    }));

    // Resolve duplicates (wikidata can return multiple rows due to multiple historical population values or inceptions)
    const uniqueMap = new Map();
    rawResults.forEach(r => {
      const existing = uniqueMap.get(r.iso);
      if (!existing) {
        uniqueMap.set(r.iso, r);
      } else {
        // Keep the one with larger population, or fill missing fields if available
        const updatePop = r.population > existing.population;
        const updateFlag = !existing.flag && r.flag;
        const updateArms = !existing.coatOfArms && r.coatOfArms;
        
        if (updatePop || updateFlag || updateArms) {
          uniqueMap.set(r.iso, {
            ...existing,
            ...r,
            population: Math.max(existing.population, r.population),
            area: Math.max(existing.area, r.area),
            flag: r.flag || existing.flag,
            coatOfArms: r.coatOfArms || existing.coatOfArms,
            inception: r.inception || existing.inception,
            highestPointLabel: r.highestPointLabel || existing.highestPointLabel,
            elevation: r.elevation !== null ? r.elevation : existing.elevation,
            namedAfterLabel: r.namedAfterLabel || existing.namedAfterLabel
          });
        }
      }
    });

    // Manually add Crimea if missing from SPARQL republics
    if (!uniqueMap.has("RU-CRI")) {
      uniqueMap.set("RU-CRI", {
        wikiId: "Q144709",
        name: "Crimea",
        iso: "RU-CRI",
        capital: "Simferopol",
        population: 1912000,
        area: 26100,
        wikipediaTitle: "Republic of Crimea",
        parent: "RUS",
        flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Crimea.svg",
        coatOfArms: "https://commons.wikimedia.org/wiki/Special:FilePath/Emblem%20of%20Crimea.svg",
        inception: "1991-02-12T00:00:00Z",
        highestPointLabel: "Roman-Kosh",
        elevation: 1545,
        namedAfterLabel: ""
      });
    }

    // Manually add Sevastopol if missing from SPARQL's Russia country filter
    if (!uniqueMap.has("RU-SEV")) {
      uniqueMap.set("RU-SEV", {
        wikiId: "Q7525",
        name: "Sevastopol",
        iso: "RU-SEV",
        capital: "Sevastopol",
        population: 547820,
        area: 864,
        wikipediaTitle: "Sevastopol",
        parent: "RUS",
        flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Sevastopol.svg",
        coatOfArms: "https://commons.wikimedia.org/wiki/Special:FilePath/COA%20of%20Sevastopol.svg",
        inception: "",
        highestPointLabel: "",
        elevation: null,
        namedAfterLabel: ""
      });
    }

    const finalSubdivisions = Array.from(uniqueMap.values());

    // Enrich with names from shapefiles if Wikidata returned a QID or empty string
    finalSubdivisions.forEach(sub => {
      const geoName = nameByIso.get(sub.iso);
      if (geoName && (sub.name.startsWith("Q") || !sub.name || sub.name.trim() === "")) {
        sub.name = geoName;
      }
      // Clean up Wikidata specific terms (e.g. "Komi Republic" -> "Komi")
      if (sub.name === "Komi Republic") sub.name = "Komi";
      if (sub.name === "Mari El Republic") sub.name = "Mari El";
      if (sub.name === "Republic of Adygea") sub.name = "Adygea";
      if (sub.name === "Republic of Bashkortostan") sub.name = "Bashkortostan";
      if (sub.name === "Republic of Buryatia") sub.name = "Buryatia";
      if (sub.name === "Republic of Dagestan") sub.name = "Dagestan";
      if (sub.name === "Republic of Ingushetia") sub.name = "Ingushetia";
      if (sub.name === "Kabardino-Balkar Republic") sub.name = "Kabardino-Balkaria";
      if (sub.name === "Republic of Kalmykia") sub.name = "Kalmykia";
      if (sub.name === "Karachay-Cherkess Republic") sub.name = "Karachay-Cherkessia";
      if (sub.name === "Republic of Karelia") sub.name = "Karelia";
      if (sub.name === "Republic of North Ossetia-Alania") sub.name = "North Ossetia–Alania";
      if (sub.name === "Republic of North Ossetia–Alania") sub.name = "North Ossetia–Alania";
      if (sub.name === "Republic of Tatarstan") sub.name = "Tatarstan";
      if (sub.name === "Tuva Republic") sub.name = "Tuva";
      if (sub.name === "Udmurt Republic") sub.name = "Udmurtia";
      if (sub.name === "Republic of Khakassia") sub.name = "Khakassia";
      if (sub.name === "Chechen Republic") sub.name = "Chechnya";
      if (sub.name === "Chuvash Republic") sub.name = "Chuvashia";
      if (sub.iso === "RU-MOW" && !sub.capital) sub.capital = "Moscow";
      if (sub.iso === "RU-SPE" && !sub.capital) sub.capital = "Saint Petersburg";
    });

    // 4. Fetch Wikipedia summaries and download flags/emblems sequentially
    console.log(`Enriching ${finalSubdivisions.length} subdivisions with Wikipedia summaries and assets...`);
    
    for (let i = 0; i < finalSubdivisions.length; i++) {
      const sub = finalSubdivisions[i];
      const wikiTitle = sub.wikipediaTitle || sub.name;
      console.log(`[${i+1}/${finalSubdivisions.length}] Processing: "${sub.name}"...`);
      
      // A. Wikipedia Summary
      let summaryData = await fetchWikipediaSummary(wikiTitle);
      
      // Fallback to name if wikiTitle failed
      if (!summaryData && wikiTitle !== sub.name) {
        summaryData = await fetchWikipediaSummary(sub.name);
      }
      
      // Secondary fallback
      if (!summaryData && sub.parent === "USA") {
        summaryData = await fetchWikipediaSummary(`${sub.name} (state)`);
      }
      if (!summaryData && sub.parent === "RUS") {
        summaryData = await fetchWikipediaSummary(`${sub.name} Republic`);
      }

      if (summaryData) {
        sub.wikipedia = summaryData;
      } else {
        console.warn(`Could not get Wikipedia summary for: ${sub.name}`);
        sub.wikipedia = {
          title: sub.name,
          summary: `${sub.name} is a subnational division of ${sub.parent === "USA" ? "the United States" : sub.parent === "CAN" ? "Canada" : sub.parent === "AUS" ? "Australia" : sub.parent === "BRA" ? "Brazil" : "Russia"}.`,
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(sub.name)}`
        };
      }

      // B. Determine parent alpha2 code for fallbacks
      let parentAlpha2 = "US";
      if (sub.parent === "CAN") parentAlpha2 = "CA";
      if (sub.parent === "AUS") parentAlpha2 = "AU";
      if (sub.parent === "BRA") parentAlpha2 = "BR";
      if (sub.parent === "RUS") parentAlpha2 = "RU";

      // C. Download Flag SVG
      const flagDest = join(flagsDir, `${sub.iso.toLowerCase()}.svg`);
      let flagDownloaded = false;
      if (sub.flag) {
        flagDownloaded = await downloadImage(sub.flag, flagDest);
      }
      
      if (!flagDownloaded) {
        // Fallback: Copy parent country's flag SVG
        const parentFlagPath = join(flagsDir, `${parentAlpha2.toLowerCase()}.svg`);
        if (existsSync(parentFlagPath)) {
          copyFileSync(parentFlagPath, flagDest);
          console.log(`  -> Copied parent flag (${parentAlpha2.toLowerCase()}.svg) as fallback`);
        } else {
          console.warn(`  -> Parent flag not found for fallback!`);
        }
      } else {
        console.log(`  -> Downloaded subdivision flag`);
      }

      // D. Download Coat of Arms / Emblem
      let emblemPath = null;
      if (sub.coatOfArms) {
        let ext = "svg";
        const cleanUrl = sub.coatOfArms.split("?")[0];
        const parts = cleanUrl.split(".");
        if (parts.length > 1) {
          const parsedExt = parts.pop().toLowerCase();
          if (["svg", "png", "jpg", "jpeg", "webp"].includes(parsedExt)) {
            ext = parsedExt;
          }
        }
        
        const emblemDest = join(emblemsDir, `${sub.iso.toLowerCase()}.${ext}`);
        const emblemDownloaded = await downloadImage(sub.coatOfArms, emblemDest);
        if (emblemDownloaded) {
          emblemPath = `/emblems/${sub.iso.toLowerCase()}.${ext}`;
          console.log(`  -> Downloaded emblem: ${emblemPath}`);
        }
      }
      sub.emblemUrl = emblemPath;

      // E. Format Inception Date
      let established = null;
      if (sub.inception) {
        const dateStr = sub.inception.split("T")[0];
        const yearStr = dateStr.split("-")[0];
        const yearVal = parseInt(yearStr, 10);
        if (!isNaN(yearVal)) {
          established = yearVal < 0 ? `${Math.abs(yearVal)} BC` : `${yearVal}`;
        }
      }
      sub.established = established;

      // F. Format Highest Point
      let highestPoint = null;
      if (sub.highestPointLabel) {
        highestPoint = sub.highestPointLabel;
        if (sub.elevation !== null && sub.elevation !== undefined) {
          highestPoint += ` (${sub.elevation.toLocaleString()} m)`;
        }
      }
      sub.highestPoint = highestPoint;

      // G. Format Named After
      sub.namedAfter = sub.namedAfterLabel || null;

      await delay(1000); // Be polite to Wikidata/Wikipedia
    }

    const russianEuropeIsoCodes = new Set([
      "RU-AD", "RU-ARK", "RU-AST", "RU-BA", "RU-BEL", "RU-BRY", "RU-CE", "RU-CRI",
      "RU-CU", "RU-DA", "RU-IN", "RU-IVA", "RU-KB", "RU-KC", "RU-KDA", "RU-KGD",
      "RU-KIR", "RU-KL", "RU-KLU", "RU-KO", "RU-KOS", "RU-KR", "RU-KRS", "RU-LEN",
      "RU-LIP", "RU-ME", "RU-MO", "RU-MOW", "RU-MOS", "RU-MUR", "RU-NEN", "RU-NGR",
      "RU-NIZ", "RU-ORL", "RU-ORE", "RU-PE", "RU-PNZ", "RU-PSK", "RU-ROS", "RU-RYA",
      "RU-SA", "RU-SAM", "RU-SAR", "RU-SE", "RU-SEV", "RU-SMO", "RU-SPE", "RU-STA",
      "RU-TA", "RU-TAM", "RU-TUL", "RU-TVE", "RU-UD", "RU-ULY", "RU-VGG", "RU-VLA",
      "RU-VLG", "RU-VOR", "RU-YAR"
    ]);

    const russianShapeNameOverrides = new Map([
      ["RU-AD", "Adygea"],
      ["RU-AL", "Altai Republic"],
      ["RU-ARK", "Arkhangelsk Oblast"],
      ["RU-AST", "Astrakhan Oblast"],
      ["RU-BU", "Buryatia"],
      ["RU-CE", "Chechnya"],
      ["RU-CHU", "Chukotka Autonomous Okrug"],
      ["RU-CU", "Chuvashia"],
      ["RU-KB", "Kabardino-Balkaria"],
      ["RU-KC", "Karachay-Cherkessia"],
      ["RU-KDA", "Krasnodar Krai"],
      ["RU-KGD", "Kaliningrad Oblast"],
      ["RU-KHA", "Khabarovsk Krai"],
      ["RU-KHM", "Khanty-Mansi Autonomous Okrug"],
      ["RU-KK", "Khakassia"],
      ["RU-KL", "Kalmykia"],
      ["RU-KR", "Karelia"],
      ["RU-KYA", "Krasnoyarsk Krai"],
      ["RU-ME", "Mari El"],
      ["RU-MO", "Mordovia"],
      ["RU-MOW", "Moscow"],
      ["RU-MOS", "Moscow Oblast"],
      ["RU-NIZ", "Nizhny Novgorod Oblast"],
      ["RU-ORE", "Orenburg Oblast"],
      ["RU-ORL", "Oryol Oblast"],
      ["RU-PER", "Perm Krai"],
      ["RU-PRI", "Primorsky Krai"],
      ["RU-SE", "North Ossetia-Alania"],
      ["RU-SEV", "Sevastopol"],
      ["RU-SPE", "Saint Petersburg"],
      ["RU-TVE", "Tver Oblast"],
      ["RU-TY", "Tuva"],
      ["RU-TYU", "Tyumen Oblast"],
      ["RU-UD", "Udmurtia"],
      ["RU-ULY", "Ulyanovsk Oblast"],
      ["RU-YAN", "Yamalo-Nenets Autonomous Okrug"],
      ["RU-YEV", "Jewish Autonomous Oblast"],
      ["RU-ZAB", "Zabaykalsky Krai"]
    ]);

    const republicsList = new Set([
      "RU-AD", "RU-AL", "RU-BA", "RU-BU", "RU-CE", "RU-CU", "RU-DA", "RU-IN",
      "RU-KB", "RU-KC", "RU-KK", "RU-KL", "RU-KO", "RU-KR", "RU-ME", "RU-MO",
      "RU-SA", "RU-SE", "RU-TA", "RU-TY", "RU-UD", "RU-CRI"
    ]);

    const russianNamedTypes = new Set([
      ...republicsList,
      "RU-MOW", "RU-SPE", "RU-SEV",
      "RU-KHM", "RU-NEN", "RU-CHU", "RU-YAN",
      "RU-YEV",
      "RU-ALT", "RU-KAM", "RU-KHA", "RU-KDA", "RU-KYA", "RU-PER", "RU-PRI", "RU-STA", "RU-ZAB"
    ]);

    function normalizeRussianShapeName(iso, name) {
      if (russianShapeNameOverrides.has(iso)) return russianShapeNameOverrides.get(iso);
      if (russianNamedTypes.has(iso)) return name;
      return `${name.replace(/'$/, "")} Oblast`;
    }

    const subdivisionIsoSet = new Set(finalSubdivisions.map(sub => sub.iso));
    russiaGeoJSON.features.forEach(f => {
      const iso = `RU-${f.properties.ISO_2}`;
      if (subdivisionIsoSet.has(iso)) return;
      const name = normalizeRussianShapeName(iso, f.properties.NAME_1 || iso);
      const wikipediaUrlTitle = name.replaceAll(" ", "_");
      finalSubdivisions.push({
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
          sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaUrlTitle)}`
        },
        emblemUrl: null,
        established: null,
        highestPoint: null,
        namedAfter: null,
        inferredRegion: russianEuropeIsoCodes.has(iso) ? "Europe" : "Asia"
      });
      subdivisionIsoSet.add(iso);
    });

    // Save subdivisions metadata
    finalSubdivisions.sort((a, b) => a.iso.localeCompare(b.iso));
    
    // Clean up temporary query fields from final JSON file
    const outputSubdivisions = finalSubdivisions.map(sub => ({
      wikiId: sub.wikiId,
      name: sub.name,
      iso: sub.iso,
      capital: sub.capital,
      population: sub.population,
      area: sub.area,
      wikipediaTitle: sub.wikipediaTitle,
      parent: sub.parent,
      wikipedia: sub.wikipedia,
      emblemUrl: sub.emblemUrl,
      established: sub.established,
      highestPoint: sub.highestPoint,
      namedAfter: sub.namedAfter,
      ...(sub.inferredRegion ? { inferredRegion: sub.inferredRegion } : {})
    }));

    writeFileSync(
      join(dataDir, "subdivisions-metadata.json"),
      JSON.stringify(outputSubdivisions, null, 2) + "\n"
    );
    console.log(`Saved subdivisions-metadata.json (${outputSubdivisions.length} items)`);

    // 5. Generate unified subdivisions-shapes.json (GeoJSON file)
    console.log("Filtering and combining shapes into subdivisions-shapes.json...");
    const combinedFeatures = [];
    const validSubdivisionIsos = new Set(outputSubdivisions.map(sub => sub.iso));
    
    // Extract US, Canada, Australia, and Brazil from Natural Earth GeoJSON
    globalAdmin1Data.features.forEach(f => {
      const props = f.properties;
      const adminCode = props.adm0_a3; // "USA", "CAN", "AUS", "BRA"
      const iso = props.iso_3166_2;
      
      if (["USA", "CAN", "AUS", "BRA"].includes(adminCode)) {
        let finalId = iso;
        let finalName = props.name || "";
        
        if (!validSubdivisionIsos.has(iso)) {
          finalId = adminCode;
        }
        
        combinedFeatures.push({
          type: "Feature",
          id: finalId,
          properties: {
            id: finalId,
            name: finalName,
            parent: adminCode
          },
          geometry: f.geometry
        });
      }
    });

    // Extract every Russian federal subject as its own clickable geography.
    russiaGeoJSON.features.forEach(f => {
      const iso2 = f.properties.ISO_2;
      const name = f.properties.NAME_1 || "";
      const isoCode = `RU-${iso2}`;
      
      combinedFeatures.push({
        type: "Feature",
        id: isoCode,
        properties: {
          id: isoCode,
          name: name,
          parent: "RUS"
        },
        geometry: f.geometry
      });
    });

    const subdivisionsGeoJSON = {
      type: "FeatureCollection",
      features: combinedFeatures
    };

    writeFileSync(
      join(dataDir, "subdivisions-shapes.json"),
      JSON.stringify(subdivisionsGeoJSON)
    );
    console.log(`Saved subdivisions-shapes.json (${combinedFeatures.length} features combined)`);
    console.log("Subdivisions build complete!");
    
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

main();
