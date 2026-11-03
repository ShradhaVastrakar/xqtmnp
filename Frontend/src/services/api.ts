import type { AnalysisResponse, ForecastMode, ForecastsResponse, Metadata } from "../types";

// Centralised API configuration: the backend URL comes from the build-time environment.
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "https://int-sol-back.khelo.tech").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Cannot reach the analysis service. Check your connection and try again.");
  }
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = "Invalid request parameters.";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  metadata: (signal?: AbortSignal) => get<Metadata>("/api/metadata", {}, signal),
  forecasts: (start: string, end: string, mode: ForecastMode, signal?: AbortSignal) =>
    get<ForecastsResponse>("/api/forecasts", { start, end, mode }, signal),
  analysis: (start: string, end: string, mode: ForecastMode, signal?: AbortSignal) =>
    get<AnalysisResponse>("/api/analysis", { start, end, mode }, signal),
};
