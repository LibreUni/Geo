/// <reference lib="webworker" />

import { geoCentroid, geoOrthographic, geoPath } from "d3-geo";

type Geography = GeoJSON.Feature<GeoJSON.Geometry, { id?: string; name?: string }>;

type InitMessage = {
  type: "init";
  features: Array<{ renderKey: string; geography: Geography }>;
};

type RenderMessage = {
  type: "render";
  frameId: number;
  rotation: [number, number];
  includeFlagMetrics: boolean;
};

type WorkerRequest = InitMessage | RenderMessage;

type ReadyMessage = {
  type: "ready";
  geographicCentroids: Array<[id: string, point: [number, number]]>;
};
type FlagMetric = {
  renderKey: string;
  path: string;
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
};
type FrameMessage =
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
      flagMetrics: FlagMetric[];
    };
type ErrorMessage = {
  type: "error";
  frameId?: number;
  message: string;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let features: InitMessage["features"] = [];

const projection = geoOrthographic()
  .fitExtent(
    [
      [20, 20],
      [1080, 600],
    ],
    { type: "Sphere" },
  )
  .precision(1.8);
const path = geoPath(projection);

function reportError(error: unknown, frameId?: number) {
  const response: ErrorMessage = {
    type: "error",
    frameId,
    message: error instanceof Error ? error.message : String(error),
  };
  workerScope.postMessage(response);
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    features = message.features;
    const geographicCentroids: ReadyMessage["geographicCentroids"] = features.map((entry) => {
      const centroid = geoCentroid(entry.geography);
      return [entry.renderKey, [centroid[0], centroid[1]]];
    });
    const response: ReadyMessage = { type: "ready", geographicCentroids };
    workerScope.postMessage(response);
    return;
  }

  try {
    projection.rotate([message.rotation[0], message.rotation[1], 0]);
    if (message.includeFlagMetrics) {
      const flagMetrics: FlagMetric[] = new Array(features.length);
      for (let index = 0; index < features.length; index += 1) {
        const entry = features[index];
        flagMetrics[index] = {
          renderKey: entry.renderKey,
          path: path(entry.geography) ?? "",
          bounds: path.bounds(entry.geography),
          centroid: path.centroid(entry.geography),
        };
      }
      const response: FrameMessage = {
        type: "frame",
        frameId: message.frameId,
        includeFlagMetrics: true,
        flagMetrics,
      };
      workerScope.postMessage(response);
      return;
    }

    const paths: Array<[id: string, path: string]> = new Array(features.length);
    for (let index = 0; index < features.length; index += 1) {
      const entry = features[index];
      paths[index] = [entry.renderKey, path(entry.geography) ?? ""];
    }
    const response: FrameMessage = {
      type: "frame",
      frameId: message.frameId,
      includeFlagMetrics: false,
      paths,
    };
    workerScope.postMessage(response);
  } catch (error) {
    reportError(error, message.frameId);
  }
};

export {};
