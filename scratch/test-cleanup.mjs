import { readFileSync } from "node:fs";

const countriesPath = "/home/edf/Documents/GitSynced/Geo/src/data/countries.json";
const countries = JSON.parse(readFileSync(countriesPath, "utf-8"));
const rwanda = countries.find(c => c.cca3 === "RWA");

const paragraph = `With a population of about 14 million people living within a total area of 26,338 square kilometres (10,169 sq mi), of which land accounts for about 93.7%, Rwanda is the 21st most densely populated country in the world, with an average of about 578 people per square kilometre (1,500 per square mile).`;

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const sentences = Array.from(segmenter.segment(paragraph)).map(s => s.segment.trim());

for (const s of sentences) {
  const lower = s.toLowerCase();
  console.log("Sentence:", s);
  
  const isPop = 
    lower.includes("population of") ||
    lower.includes("population is") ||
    (lower.includes("inhabitant") && (lower.includes("million") || lower.includes("thousand") || /\d+/.test(lower)));
    
  console.log("  isPop check:", isPop);
  
  if (isPop) {
    const hasOtherContext =
      lower.includes("century") ||
      lower.includes("dynasty") ||
      lower.includes("since") ||
      lower.includes("war") ||
      lower.includes("ethnic") ||
      lower.includes("majority") ||
      lower.includes("minority") ||
      lower.includes("language") ||
      lower.includes("religion") ||
      lower.includes("urban");
      
    console.log("  hasOtherContext:", hasOtherContext);
    console.log("  Will skip:", !hasOtherContext);
  }
}
