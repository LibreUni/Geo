import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "src/data/countries.json");
const corePath = join(root, "src/data/countries-core.json");
const detailDirectory = join(root, "public/data/country-details");

function writeIfChanged(path, contents) {
  try {
    if (readFileSync(path, "utf8") === contents) return;
  } catch {
    // The generated file does not exist yet.
  }
  writeFileSync(path, contents);
}

const countries = JSON.parse(readFileSync(sourcePath, "utf8"));
const core = [];

mkdirSync(detailDirectory, { recursive: true });

for (const country of countries) {
  const { wikipedia, ...countryCore } = country;
  core.push(countryCore);
  if (wikipedia) {
    writeIfChanged(
      join(detailDirectory, `${country.cca3.toLowerCase()}.json`),
      JSON.stringify(wikipedia),
    );
  }
}

writeIfChanged(corePath, JSON.stringify(core));
