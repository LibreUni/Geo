import { geoArea, geoOrthographic, geoPath } from "d3-geo";

type Geography = GeoJSON.Feature<GeoJSON.Geometry, { id?: string; name?: string }>;

// Mirrors the app-wide orthographic fit: App.tsx fits the sphere with
// geoOrthographic().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 20]]), which
// resolves to radius (HEIGHT - 40) / 2 centered in the viewBox. Keep these in
// sync with WIDTH/HEIGHT in App.tsx.
const WIDTH = 1100;
const HEIGHT = 620;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const R = (HEIGHT - 40) / 2;
const RADIANS = Math.PI / 180;
const TAU = Math.PI * 2;
// Segments and horizon arcs are sampled every 4°. A 4° chord on the horizon
// circle deviates from the true arc by ~0.18px at base scale, well below the
// 1.8px resampling precision the d3 pipeline renders with.
const MAX_SEGMENT_ANGLE = 4 * RADIANS;
const MIN_SEGMENT_DOT = Math.cos(MAX_SEGMENT_ANGLE);

type PreparedRing = {
  // Unit sphere vectors as xyz triples; the closing point is implicit.
  points: Float64Array;
  // Direction to walk horizon arcs when closing clipped runs so the visible
  // interior stays enclosed: -1 for exterior rings, +1 for holes (rings whose
  // standalone spherical area exceeds 2π). Validated pixel-for-pixel against
  // d3's clipped output across a rotation grid.
  direction: 1 | -1;
};

type Run = {
  // Screen coordinates, xy pairs. First point enters the visible hemisphere,
  // last point leaves it; both lie exactly on the horizon circle.
  points: number[];
  entryAngle: number;
  exitAngle: number;
};

function toUnitVector(lon: number, lat: number, out: number[]) {
  const λ = lon * RADIANS;
  const φ = lat * RADIANS;
  const cosφ = Math.cos(φ);
  out[0] = Math.cos(λ) * cosφ;
  out[1] = Math.sin(λ) * cosφ;
  out[2] = Math.sin(φ);
}

function prepareRing(coords: GeoJSON.Position[]): PreparedRing | null {
  const closed =
    coords.length > 1 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1];
  const count = closed ? coords.length - 1 : coords.length;
  if (count < 3) return null;

  const raw: number[] = [];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < count; i += 1) {
    toUnitVector(coords[i][0], coords[i][1], a);
    toUnitVector(coords[(i + 1) % count][0], coords[(i + 1) % count][1], b);
    raw.push(a[0], a[1], a[2]);
    // Great-circle pre-subdivision of long segments so straight chords stay
    // within the precision d3's adaptive resampling would have produced.
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    // Near-antipodal pairs (sinAngle ≈ 0) have no defined great circle; skip
    // subdivision rather than divide by ~0. Real geographic rings never place
    // consecutive vertices ~180° apart.
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    const sinAngle = Math.sin(angle);
    if (dot < MIN_SEGMENT_DOT && sinAngle > 1e-9) {
      const steps = Math.ceil(angle / MAX_SEGMENT_ANGLE);
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        const wa = Math.sin((1 - t) * angle) / sinAngle;
        const wb = Math.sin(t * angle) / sinAngle;
        raw.push(wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]);
      }
    }
  }

  // A standalone ring wound as a hole encloses "most of the sphere" for d3.
  const ringArea = geoArea({ type: "Polygon", coordinates: [closed ? coords : [...coords, coords[0]]] });
  return {
    points: Float64Array.from(raw),
    direction: ringArea > TAU ? 1 : -1,
  };
}

function prepareGeometry(geometry: GeoJSON.Geometry): PreparedRing[] | null {
  const rings: PreparedRing[] = [];
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      const prepared = prepareRing(ring);
      if (prepared) rings.push(prepared);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        const prepared = prepareRing(ring);
        if (prepared) rings.push(prepared);
      }
    }
  } else {
    return null;
  }
  return rings;
}

function fmt(value: number) {
  return Math.round(value * 1000) / 1000;
}

export type FastOrthographicMetrics = {
  path: string;
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
};

export class FastOrthographicRenderer {
  private readonly features: Geography[];
  private readonly featureRings: Array<PreparedRing[] | null>;
  private fallback: {
    projection: ReturnType<typeof geoOrthographic>;
    path: ReturnType<typeof geoPath>;
  } | null = null;
  private rotationLon = 0;
  private rotationLat = 0;
  // View-basis coefficients: east = ex·x + ey·y, north/front are full rows.
  private ex = 0;
  private ey = 1;
  private nx = 0;
  private ny = 0;
  private nz = 1;
  private fx = 1;
  private fy = 0;
  private fz = 0;
  // Scratch reused across rings to avoid per-frame garbage.
  private front: Float64Array = new Float64Array(1024);
  // Metrics accumulators for the feature currently being rendered.
  private measuring = false;
  private minX = 0;
  private minY = 0;
  private maxX = 0;
  private maxY = 0;
  private crossSum = 0;
  private crossXSum = 0;
  private crossYSum = 0;

  constructor(features: Geography[]) {
    this.features = features;
    this.featureRings = features.map((feature) => prepareGeometry(feature.geometry));
  }

  setRotation(lon: number, lat: number) {
    this.rotationLon = lon;
    this.rotationLat = lat;
    const λ = lon * RADIANS;
    const φ = lat * RADIANS;
    const sinλ = Math.sin(λ);
    const cosλ = Math.cos(λ);
    const sinφ = Math.sin(φ);
    const cosφ = Math.cos(φ);
    this.ex = sinλ;
    this.ey = cosλ;
    this.nx = sinφ * cosλ;
    this.ny = -sinφ * sinλ;
    this.nz = cosφ;
    this.fx = cosφ * cosλ;
    this.fy = -cosφ * sinλ;
    this.fz = -sinφ;
  }

  path(index: number): string {
    const rings = this.featureRings[index];
    if (!rings) return this.fallbackPath(index);
    let d = "";
    for (const ring of rings) d += this.clipRing(ring);
    return d;
  }

  metrics(index: number): FastOrthographicMetrics {
    const rings = this.featureRings[index];
    if (!rings) return this.fallbackMetrics(index);
    this.measuring = true;
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
    this.crossSum = 0;
    this.crossXSum = 0;
    this.crossYSum = 0;
    let d = "";
    for (const ring of rings) d += this.clipRing(ring);
    this.measuring = false;
    // Below ~2px² the area-weighted centroid is numerically unstable (thin
    // horizon slivers); fall back to the bounds center, which stays finite the
    // way d3's line/point centroid fallbacks did. NaN only when nothing was
    // emitted at all (fully hidden feature).
    const area = this.crossSum; // 2× signed area
    const centroid: [number, number] =
      Math.abs(area) > 4
        ? [this.crossXSum / (3 * area), this.crossYSum / (3 * area)]
        : Number.isFinite(this.minX)
          ? [(this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2]
          : [NaN, NaN];
    return {
      path: d,
      bounds: [
        [this.minX, this.minY],
        [this.maxX, this.maxY],
      ],
      centroid,
    };
  }

  private fallbackProjection() {
    if (!this.fallback) {
      const projection = geoOrthographic()
        .fitExtent(
          [
            [20, 20],
            [WIDTH - 20, HEIGHT - 20],
          ],
          { type: "Sphere" },
        )
        .precision(1.8);
      this.fallback = { projection, path: geoPath(projection) };
    }
    this.fallback.projection.rotate([this.rotationLon, this.rotationLat, 0]);
    return this.fallback;
  }

  private fallbackPath(index: number): string {
    return this.fallbackProjection().path(this.features[index]) ?? "";
  }

  private fallbackMetrics(index: number): FastOrthographicMetrics {
    const { path } = this.fallbackProjection();
    const feature = this.features[index];
    return {
      path: path(feature) ?? "",
      bounds: path.bounds(feature),
      centroid: path.centroid(feature),
    };
  }

  private clipRing(ring: PreparedRing): string {
    const points = ring.points;
    const n = points.length / 3;
    if (this.front.length < n) this.front = new Float64Array(Math.max(n, this.front.length * 2));
    const front = this.front;
    const { fx, fy, fz } = this;

    let anyVisible = false;
    let anyHidden = false;
    let firstHidden = -1;
    for (let i = 0; i < n; i += 1) {
      const f = fx * points[i * 3] + fy * points[i * 3 + 1] + fz * points[i * 3 + 2];
      front[i] = f;
      if (f > 0) anyVisible = true;
      else {
        anyHidden = true;
        if (firstHidden < 0) firstHidden = i;
      }
    }
    if (!anyVisible) return "";
    if (!anyHidden) return this.emitFullRing(points, n);
    return this.emitClippedRing(ring, n, firstHidden);
  }

  private project(x: number, y: number, z: number, out: number[]) {
    out[0] = CX + R * (this.ex * x + this.ey * y);
    out[1] = CY - R * (this.nx * x + this.ny * y + this.nz * z);
  }

  private emitFullRing(points: Float64Array, n: number): string {
    const p = this.scratchPoint;
    this.project(points[0], points[1], points[2], p);
    let firstX = fmt(p[0]);
    let firstY = fmt(p[1]);
    let d = `M${firstX},${firstY}`;
    let prevX = firstX;
    let prevY = firstY;
    if (this.measuring) this.measurePoint(firstX, firstY);
    for (let i = 1; i < n; i += 1) {
      this.project(points[i * 3], points[i * 3 + 1], points[i * 3 + 2], p);
      const x = fmt(p[0]);
      const y = fmt(p[1]);
      d += `L${x},${y}`;
      if (this.measuring) {
        this.measurePoint(x, y);
        this.measureEdge(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
    }
    if (this.measuring) this.measureEdge(prevX, prevY, firstX, firstY);
    return d + "Z";
  }

  private scratchPoint = [0, 0];

  private emitClippedRing(ring: PreparedRing, n: number, firstHidden: number): string {
    const points = ring.points;
    const front = this.front;
    const p = this.scratchPoint;
    const runs: Run[] = [];
    let current: number[] | null = null;
    let entryAngle = 0;

    let prevIndex = firstHidden;
    let prevF = front[firstHidden];
    for (let step = 1; step <= n; step += 1) {
      const i = (firstHidden + step) % n;
      const f = front[i];
      if (f > 0) {
        if (!current) {
          entryAngle = this.intersect(prevIndex, i, prevF, f, points, p);
          current = [p[0], p[1]];
        }
        this.project(points[i * 3], points[i * 3 + 1], points[i * 3 + 2], p);
        current.push(p[0], p[1]);
      } else if (current) {
        const exitAngle = this.intersect(prevIndex, i, prevF, f, points, p);
        current.push(p[0], p[1]);
        runs.push({ points: current, entryAngle, exitAngle });
        current = null;
      }
      prevIndex = i;
      prevF = f;
    }
    // The walk starts and ends on a hidden vertex, so every run is closed.
    if (runs.length === 0) return "";
    return this.joinRuns(runs, ring.direction);
  }

  // Intersects segment a→b with the horizon plane (front = 0), writes the
  // projected screen point into out, and returns its angle on the horizon
  // circle in (east, north) space.
  private intersect(
    a: number,
    b: number,
    fa: number,
    fb: number,
    points: Float64Array,
    out: number[],
  ): number {
    const t = fa / (fa - fb);
    const x = points[a * 3] + t * (points[b * 3] - points[a * 3]);
    const y = points[a * 3 + 1] + t * (points[b * 3 + 1] - points[a * 3 + 1]);
    const z = points[a * 3 + 2] + t * (points[b * 3 + 2] - points[a * 3 + 2]);
    const norm = Math.sqrt(x * x + y * y + z * z) || 1;
    const east = (this.ex * x + this.ey * y) / norm;
    const north = (this.nx * x + this.ny * y + this.nz * z) / norm;
    out[0] = CX + R * east;
    out[1] = CY - R * north;
    return Math.atan2(north, east);
  }

  private joinRuns(runs: Run[], direction: 1 | -1): string {
    const ordered = runs.slice().sort((a, b) => direction * (a.entryAngle - b.entryAngle));
    const visited = new Set<Run>();
    let d = "";

    for (const start of ordered) {
      if (visited.has(start)) continue;
      let firstX = 0;
      let firstY = 0;
      let prevX = 0;
      let prevY = 0;
      let opened = false;
      let run = start;
      // Follow the ring while visible; at each exit, walk the horizon circle in
      // the ring's interior-on-the-left direction to the next entry point.
      for (;;) {
        visited.add(run);
        const pts = run.points;
        for (let i = 0; i < pts.length; i += 2) {
          const x = fmt(pts[i]);
          const y = fmt(pts[i + 1]);
          if (!opened) {
            d += `M${x},${y}`;
            firstX = x;
            firstY = y;
            opened = true;
          } else {
            d += `L${x},${y}`;
            if (this.measuring) this.measureEdge(prevX, prevY, x, y);
          }
          if (this.measuring) this.measurePoint(x, y);
          prevX = x;
          prevY = y;
        }

        // Nearest entry point along the circle in the travel direction.
        let next = start;
        let best = Infinity;
        for (const candidate of ordered) {
          if (candidate !== start && visited.has(candidate)) continue;
          let delta = direction * (candidate.entryAngle - run.exitAngle);
          delta = ((delta % TAU) + TAU) % TAU;
          // A ring tangent to the horizon yields entry/exit angles equal up to
          // float noise; a tiny negative delta must not wrap into a
          // full-circle arc that would fill the whole disc.
          if (delta > TAU - 1e-9) delta = 0;
          if (delta < best) {
            best = delta;
            next = candidate;
          }
        }

        // Emit the horizon arc from this exit toward the next entry.
        if (best < Infinity && best > 1e-9) {
          const steps = Math.floor(best / MAX_SEGMENT_ANGLE);
          for (let s = 1; s <= steps; s += 1) {
            const angle = run.exitAngle + direction * s * MAX_SEGMENT_ANGLE;
            const x = fmt(CX + R * Math.cos(angle));
            const y = fmt(CY - R * Math.sin(angle));
            d += `L${x},${y}`;
            if (this.measuring) {
              this.measurePoint(x, y);
              this.measureEdge(prevX, prevY, x, y);
            }
            prevX = x;
            prevY = y;
          }
        }

        if (next === start) break;
        run = next;
      }
      if (this.measuring) this.measureEdge(prevX, prevY, firstX, firstY);
      d += "Z";
    }
    return d;
  }

  private measurePoint(x: number, y: number) {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  private measureEdge(x0: number, y0: number, x1: number, y1: number) {
    const cross = x0 * y1 - x1 * y0;
    this.crossSum += cross;
    this.crossXSum += (x0 + x1) * cross;
    this.crossYSum += (y0 + y1) * cross;
  }
}
