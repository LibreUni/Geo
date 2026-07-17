/// <reference lib="webworker" />

import { geoCentroid } from "d3-geo";
import { FastOrthographicRenderer } from "./fast-orthographic";

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
let renderKeys: string[] = [];
let renderer: FastOrthographicRenderer | null = null;

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
    try {
      renderKeys = message.features.map((entry) => entry.renderKey);
      renderer = new FastOrthographicRenderer(
        message.features.map((entry) => entry.geography),
      );
      const geographicCentroids: ReadyMessage["geographicCentroids"] =
        message.features.map((entry) => {
          const centroid = geoCentroid(entry.geography);
          return [entry.renderKey, [centroid[0], centroid[1]]];
        });
      const response: ReadyMessage = { type: "ready", geographicCentroids };
      workerScope.postMessage(response);
    } catch (error) {
      reportError(error);
    }
    return;
  }

  try {
    if (!renderer) throw new Error("Orthographic worker rendered before init.");
    renderer.setRotation(message.rotation[0], message.rotation[1]);
    if (message.includeFlagMetrics) {
      const flagMetrics: FlagMetric[] = new Array(renderKeys.length);
      for (let index = 0; index < renderKeys.length; index += 1) {
        const metrics = renderer.metrics(index);
        flagMetrics[index] = {
          renderKey: renderKeys[index],
          path: metrics.path,
          bounds: metrics.bounds,
          centroid: metrics.centroid,
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

    const paths: Array<[id: string, path: string]> = new Array(renderKeys.length);
    for (let index = 0; index < renderKeys.length; index += 1) {
      paths[index] = [renderKeys[index], renderer.path(index)];
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
