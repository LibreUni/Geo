import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(__dirname, "../src/data");

mkdirSync(dataDir, { recursive: true });

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

    // 3. Query Wikidata for details
    console.log("Fetching subnational metadata from Wikidata...");
    const query = `
SELECT DISTINCT ?item ?itemLabel ?isoCode ?capitalLabel ?population ?area ?wikipediaTitle ?parent WHERE {
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
    ?item wdt:P31 wd:Q41162. # Russian Republic
    BIND("RUS" AS ?parent)
  }
  
  ?item wdt:P300 ?isoCode.
  OPTIONAL { ?item wdt:P36 ?capital. ?capital rdfs:label ?capitalLabel. FILTER(LANG(?capitalLabel) = "en") }
  OPTIONAL { ?item wdt:P1082 ?population. }
  OPTIONAL { ?item wdt:P2046 ?area. }
  
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
      parent: b.parent ? b.parent.value : ""
    }));

    // Resolve duplicates (sometimes item has multiple capitals/populations in history)
    const uniqueMap = new Map();
    rawResults.forEach(r => {
      const existing = uniqueMap.get(r.iso);
      if (!existing || (r.population > existing.population)) {
        uniqueMap.set(r.iso, r);
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
        parent: "RUS"
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
    });

    // 4. Fetch Wikipedia summaries sequentially
    console.log(`Enriching ${finalSubdivisions.length} subdivisions with Wikipedia summaries...`);
    for (let i = 0; i < finalSubdivisions.length; i++) {
      const sub = finalSubdivisions[i];
      const wikiTitle = sub.wikipediaTitle || sub.name;
      console.log(`[${i+1}/${finalSubdivisions.length}] Fetching summary for: "${wikiTitle}"...`);
      
      let summaryData = await fetchWikipediaSummary(wikiTitle);
      
      // Fallback to name if wikiTitle failed
      if (!summaryData && wikiTitle !== sub.name) {
        summaryData = await fetchWikipediaSummary(sub.name);
      }
      
      // Secondary fallback (e.g. "Washington, D.C." -> "Washington D.C." or adding (state) for US states if needed)
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
      
      await delay(50); // Be polite to Wikipedia
    }

    // Save subdivisions metadata
    finalSubdivisions.sort((a, b) => a.iso.localeCompare(b.iso));
    writeFileSync(
      join(dataDir, "subdivisions-metadata.json"),
      JSON.stringify(finalSubdivisions, null, 2) + "\n"
    );
    console.log(`Saved subdivisions-metadata.json (${finalSubdivisions.length} items)`);

    // 5. Generate unified subdivisions-shapes.json (GeoJSON file)
    console.log("Filtering and combining shapes into subdivisions-shapes.json...");
    const combinedFeatures = [];
    
    const validSubdivisionIsos = new Set(finalSubdivisions.map(sub => sub.iso));
    
    // Extract US, Canada, Australia, and Brazil from Natural Earth GeoJSON
    globalAdmin1Data.features.forEach(f => {
      const props = f.properties;
      const adminCode = props.adm0_a3; // "USA", "CAN", "AUS", "BRA"
      const iso = props.iso_3166_2;
      
      if (["USA", "CAN", "AUS", "BRA"].includes(adminCode)) {
        let finalId = iso;
        let finalName = props.name || "";
        
        // Exclude features that are not in our metadata (e.g. tiny external islands or Jervis Bay)
        if (!validSubdivisionIsos.has(iso)) {
          // Map to parent sovereign code so it highlights/belongs to parent
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

    // Extract Russia regions ( republics vs rest of Russia )
    const republicsList = new Set([
      "RU-AD", "RU-AL", "RU-BA", "RU-BU", "RU-CE", "RU-CU", "RU-DA", "RU-IN", 
      "RU-KB", "RU-KC", "RU-KK", "RU-KL", "RU-KO", "RU-KR", "RU-ME", "RU-MO", 
      "RU-SA", "RU-SE", "RU-TA", "RU-TY", "RU-UD", "RU-CRI"
    ]);

    russiaGeoJSON.features.forEach(f => {
      const iso2 = f.properties.ISO_2;
      const name = f.properties.NAME_1 || "";
      const isoCode = `RU-${iso2}`;
      
      let finalId = "643"; // "643" is the numeric code of Russia in the world atlas (maps to parent "RUS")
      if (republicsList.has(isoCode)) {
        finalId = isoCode;
      }
      
      combinedFeatures.push({
        type: "Feature",
        id: finalId,
        properties: {
          id: finalId,
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
