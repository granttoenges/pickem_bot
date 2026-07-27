import type { Week } from "./types";
import type { ScrapeRun } from "./types";

export function isScrapeDue(week: Week, now: Date): boolean {
  if (!week.scrapeAt) {
    return false;
  }
  if (week.scrapeStatus && week.scrapeStatus !== "pending") {
    return false;
  }
  return new Date(week.scrapeAt).getTime() <= now.getTime();
}

export function scrapeStatusFromPayload(payload: unknown): NonNullable<Week["scrapeStatus"]> {
  if (!isRecord(payload)) {
    return "failed";
  }
  const games = Array.isArray(payload.games) ? payload.games : [];
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const runStatus = typeof payload.status === "string" ? payload.status : undefined;
  if (runStatus === "success" || (!errors.length && games.length > 0)) {
    return "completed";
  }
  if (runStatus === "partial" || (errors.length > 0 && games.length > 0)) {
    return "partial";
  }
  return "failed";
}

export function scrapeStatusFromRun(run: Pick<ScrapeRun, "status" | "parsedGameCount" | "errors">): NonNullable<Week["scrapeStatus"]> {
  if (run.status === "success" && run.parsedGameCount > 0) {
    return "completed";
  }
  if (run.status === "partial" || (run.parsedGameCount > 0 && run.errors.length > 0)) {
    return "partial";
  }
  return "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
