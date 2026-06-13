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

function loadCountries(): Country[] {
  return (countryData as Country[]).filter((country) => country.ccn3 && geographyByNumeric.has(country.ccn3));
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
        <PracticePanel selectedCountry={selectedCountry} />
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
            const visible = country ? filteredCodes.has(country.cca3) : false;
            const hasSaneHitArea = geo.area < MAX_COUNTRY_HIT_AREA;
            const className = [
              "country",
              !hasSaneHitArea ? "no-hit" : "",
              showFlagFills && country?.alpha2 && visible ? "flagged" : "",
              visible ? "visible" : "muted",
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
    </section>
  );
}

function PracticePanel({
  selectedCountry,
}: {
  selectedCountry: Country;
}) {
  return (
    <aside className="side-panel">
      <CountryCard country={selectedCountry} />
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

function CountryCard({ country }: { country: Country }) {
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
    </article>
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
