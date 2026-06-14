import { writeFileSync } from "node:fs";

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";

async function fetchWikipediaExtract(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "true",
    explaintext: "true",
    titles: title,
    format: "json",
    origin: "*"
  });
  
  const url = `${WIKIPEDIA_API_URL}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "GeoLearn/1.0 (country learning app; https://example.local)",
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  
  const payload = await response.json();
  const pages = payload.query?.pages || {};
  const pageId = Object.keys(pages)[0];
  return pages[pageId]?.extract || null;
}

function cleanFirstParagraph(firstParagraph) {
  if (!firstParagraph) return "";
  
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const sentences = Array.from(segmenter.segment(firstParagraph)).map(s => s.segment.trim());
  
  const cleaned = [];
  
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const lower = s.toLowerCase();
    
    // 1. Skip introductory sentence if it's typical redundancy
    if (i === 0 && sentences.length > 1) {
      const isIntro = 
        lower.includes("officially the") || 
        lower.includes("is a landlocked") ||
        lower.includes("is a country") ||
        lower.includes("is an island") ||
        lower.includes("is a sovereign") ||
        lower.includes("is a territory") ||
        lower.includes("is a constituent") ||
        lower.includes("comprising the") ||
        lower.includes("is a federation") ||
        lower.includes("is a state");
        
      if (isIntro) {
        continue;
      }
    }
    
    // 2. Skip capital city information, unless it contains cultural/financial/historical details
    const isCapitalSentence =
      lower.includes("capital and largest city") ||
      lower.includes("capital city is") ||
      (lower.includes("capital is") && !lower.includes("established")) ||
      (lower.includes("largest city") && lower.includes("capital"));
      
    if (isCapitalSentence) {
      const hasOtherCrucialContext =
        lower.includes("cultural") ||
        lower.includes("financial") ||
        lower.includes("economic") ||
        lower.includes("tourism") ||
        lower.includes("history") ||
        lower.includes("historic") ||
        lower.includes("second-largest") ||
        lower.includes("constitutional") ||
        lower.includes("executive") ||
        lower.includes("administrative") ||
        lower.includes("judicial") ||
        lower.includes("legislative");
        
      if (!hasOtherCrucialContext) {
        continue;
      }
    }
    
    // 3. Skip population sentences, unless they contain historical or ethnic context
    if (
      lower.includes("population of") ||
      lower.includes("population is") ||
      (lower.includes("inhabitant") && (lower.includes("million") || lower.includes("thousand") || /\d+/.test(lower)))
    ) {
      const hasOtherContext =
        lower.includes("century") ||
        lower.includes("dynasty") ||
        lower.includes("since") ||
        lower.includes("war") ||
        lower.includes("ethnic") ||
        lower.includes("people") ||
        lower.includes("majority") ||
        lower.includes("minority") ||
        lower.includes("language") ||
        lower.includes("urban");
        
      if (!hasOtherContext) {
        continue;
      }
    }
    
    // 4. Skip area sentences, unless they contain historical/geographical context
    if (
      lower.includes("square kilometres") ||
      lower.includes("square kilometers") ||
      lower.includes("square miles") ||
      lower.includes("sq mi") ||
      (lower.includes("covers") && lower.includes("area of")) ||
      (lower.includes("occupies") && lower.includes("area")) ||
      (lower.includes("spanning") && lower.includes("area")) ||
      (lower.includes("land area") && lower.includes("percent"))
    ) {
      const hasOtherContext =
        lower.includes("century") ||
        lower.includes("history") ||
        lower.includes("since") ||
        lower.includes("coastline") ||
        lower.includes("mountain") ||
        lower.includes("lake") ||
        lower.includes("river") ||
        lower.includes("desert") ||
        lower.includes("forest") ||
        lower.includes("island");
        
      if (!hasOtherContext) {
        continue;
      }
    }
    
    // 5. Skip borders sentences
    if (
      (lower.includes("bordered by") || lower.includes("shares borders") || lower.includes("shares land borders")) &&
      (lower.includes("north") || lower.includes("south") || lower.includes("east") || lower.includes("west"))
    ) {
      const hasOtherContext =
        lower.includes("disputed") ||
        lower.includes("ocean") ||
        lower.includes("sea") ||
        lower.includes("gulf") ||
        lower.includes("strait");
      if (!hasOtherContext) {
        continue;
      }
    }
    
    cleaned.push(s);
  }
  
  if (cleaned.length === 0) {
    return firstParagraph;
  }
  
  return cleaned.join(" ");
}

function cleanFullExtract(extract) {
  if (!extract) return "";
  
  // Split into paragraphs by newline
  const paragraphs = extract.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length === 0) return "";
  
  // Clean the first paragraph
  paragraphs[0] = cleanFirstParagraph(paragraphs[0]);
  
  // Keep all other paragraphs as they are, but filter out empty paragraphs
  return paragraphs.filter(p => p.length > 0).join("\n\n");
}

async function runTest() {
  const countries = ["Italy", "Russia", "United States", "Singapore", "Canada"];
  for (const name of countries) {
    console.log(`\n================= FETCHING ${name.toUpperCase()} =================`);
    try {
      const raw = await fetchWikipediaExtract(name);
      console.log("--- RAW ---");
      console.log(raw.substring(0, 400) + "...");
      console.log("--- CLEANED ---");
      console.log(cleanFullExtract(raw));
    } catch (e) {
      console.error(e);
    }
  }
}

runTest();
