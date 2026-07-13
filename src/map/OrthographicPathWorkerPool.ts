type Geography = GeoJSON.Feature<GeoJSON.Geometry, { id?: string; name?: string }>;

type WorkerFeature = {
  renderKey: string;
  geography: Geography;
};

type WorkerResponse =
  | {
      type: "ready";
      geographicCentroids: Array<[id: string, point: [number, number]]>;
    }
  | {
      type: "frame";
      frameId: number;
      includeFlagMetrics: false;
      paths: Array<[id: string, path: string]>;
    }
  | {
      type: "frame";
      frameId: number;
      includeFlagMetrics: true;
      flagMetrics: OrthographicFlagMetric[];
    }
  | {
      type: "error";
      frameId?: number;
      message: string;
    };

type FrameRequest = {
  frameId: number;
  modeGeneration: number;
  includeFlagMetrics: boolean;
  rotation: [number, number];
  remainingWorkers: number;
  respondingWorkers: Set<number>;
  paths: Array<[id: string, path: string]>;
  flagMetrics: OrthographicFlagMetric[];
};

export type OrthographicFlagMetric = {
  renderKey: string;
  path: string;
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
};

export type OrthographicPathFrame = {
  frameId: number;
  modeGeneration: number;
  includeFlagMetrics: boolean;
  rotation: [number, number];
  paths: Array<[id: string, path: string]>;
  flagMetrics: OrthographicFlagMetric[];
  geographicCentroids: ReadonlyMap<string, [number, number]>;
};

type PoolOptions = {
  features: WorkerFeature[];
  onFrame: (frame: OrthographicPathFrame) => void;
  onError: (error: Error) => void;
};

function coordinateCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return 1;
  }
  let total = 0;
  for (const child of value) total += coordinateCount(child);
  return total;
}

function geometryCoordinateCount(geometry: GeoJSON.Geometry): number {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.reduce(
      (total, child) => total + geometryCoordinateCount(child),
      0,
    );
  }
  return coordinateCount(geometry.coordinates);
}

function partitionFeatures(features: WorkerFeature[], partitionCount: number) {
  const partitions = Array.from({ length: partitionCount }, () => ({
    weight: 0,
    features: [] as WorkerFeature[],
  }));
  const weighted = features
    .map((entry) => ({ entry, weight: geometryCoordinateCount(entry.geography.geometry) }))
    .sort((left, right) => right.weight - left.weight);

  for (const item of weighted) {
    let lightest = partitions[0];
    for (let index = 1; index < partitions.length; index += 1) {
      if (partitions[index].weight < lightest.weight) lightest = partitions[index];
    }
    lightest.features.push(item.entry);
    lightest.weight += item.weight;
  }

  return partitions.map((partition) => partition.features);
}

function recommendedWorkerCount(featureCount: number) {
  const availableCores = navigator.hardwareConcurrency || 4;
  return Math.min(featureCount, 8, Math.max(2, availableCores - 1));
}

export class OrthographicPathWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly readyWorkers = new Set<number>();
  private readonly geographicCentroids = new Map<string, [number, number]>();
  private readonly onFrame: PoolOptions["onFrame"];
  private readonly onError: PoolOptions["onError"];
  private pendingRotation: [number, number] | null = null;
  private pendingModeGeneration = 0;
  private pendingIncludeFlagMetrics = false;
  private inFlight: FrameRequest | null = null;
  private nextFrameId = 0;
  private disposed = false;
  private failed = false;

  constructor({ features, onFrame, onError }: PoolOptions) {
    if (features.length < 2) throw new Error("At least two map features are required for worker rendering.");

    this.onFrame = onFrame;
    this.onError = onError;
    const partitions = partitionFeatures(features, recommendedWorkerCount(features.length));

    try {
      partitions.forEach((partition, workerIndex) => {
        const worker = new Worker(new URL("./orthographic-path.worker.ts", import.meta.url), {
          type: "module",
          name: `orthographic-path-${workerIndex + 1}`,
        });
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          this.handleWorkerMessage(workerIndex, event.data);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          this.fail(new Error(event.message || "Orthographic path worker failed."));
        };
        this.workers.push(worker);
        worker.postMessage({ type: "init", features: partition });
      });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  request(
    rotation: [number, number],
    modeGeneration: number,
    includeFlagMetrics: boolean,
  ) {
    if (this.disposed || this.failed) return;
    // Pointer input can outrun even a parallel render. Retain only the newest
    // rotation while the current complete frame is in flight.
    this.pendingRotation = [rotation[0], rotation[1]];
    this.pendingModeGeneration = modeGeneration;
    this.pendingIncludeFlagMetrics = includeFlagMetrics;
    this.pump();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingRotation = null;
    this.inFlight = null;
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.readyWorkers.clear();
  }

  private pump() {
    if (
      this.disposed ||
      this.failed ||
      this.inFlight ||
      !this.pendingRotation ||
      this.readyWorkers.size !== this.workers.length
    ) {
      return;
    }

    const rotation = this.pendingRotation;
    this.pendingRotation = null;
    const frameId = ++this.nextFrameId;
    this.inFlight = {
      frameId,
      modeGeneration: this.pendingModeGeneration,
      includeFlagMetrics: this.pendingIncludeFlagMetrics,
      rotation,
      remainingWorkers: this.workers.length,
      respondingWorkers: new Set(),
      paths: [],
      flagMetrics: [],
    };
    for (const worker of this.workers) {
      worker.postMessage({
        type: "render",
        frameId,
        rotation,
        includeFlagMetrics: this.inFlight.includeFlagMetrics,
      });
    }
  }

  private handleWorkerMessage(workerIndex: number, response: WorkerResponse) {
    if (this.disposed || this.failed) return;

    if (response.type === "ready") {
      for (const [id, centroid] of response.geographicCentroids) {
        this.geographicCentroids.set(id, centroid);
      }
      this.readyWorkers.add(workerIndex);
      this.pump();
      return;
    }

    if (response.type === "error") {
      this.fail(new Error(response.message));
      return;
    }

    const frame = this.inFlight;
    if (
      !frame ||
      response.frameId !== frame.frameId ||
      frame.respondingWorkers.has(workerIndex)
    ) {
      // A disposed/replaced pool or a superseded frame must never repaint DOM.
      return;
    }

    frame.respondingWorkers.add(workerIndex);
    frame.remainingWorkers -= 1;
    if (response.includeFlagMetrics !== frame.includeFlagMetrics) {
      this.fail(new Error("Orthographic worker returned metrics for the wrong render mode."));
      return;
    }
    if (response.includeFlagMetrics) frame.flagMetrics.push(...response.flagMetrics);
    else frame.paths.push(...response.paths);
    if (frame.remainingWorkers > 0) return;

    const completedFrame = {
      frameId: frame.frameId,
      modeGeneration: frame.modeGeneration,
      includeFlagMetrics: frame.includeFlagMetrics,
      rotation: frame.rotation,
      paths: frame.paths,
      flagMetrics: frame.flagMetrics,
      geographicCentroids: this.geographicCentroids,
    };
    this.inFlight = null;
    // Start the newest queued rotation before touching the DOM. This keeps
    // pointer feedback continuous and lets worker projection overlap the SVG
    // attribute writes for the frame that just completed.
    this.pump();
    this.onFrame(completedFrame);
  }

  private fail(error: Error) {
    if (this.disposed || this.failed) return;
    this.failed = true;
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.readyWorkers.clear();
    this.pendingRotation = null;
    this.inFlight = null;
    this.onError(error);
  }
}
