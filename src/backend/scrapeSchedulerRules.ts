import type { Week } from "./types";

export function isScrapeDue(week: Week, now: Date): boolean {
  if (!week.scrapeAt) {
    return false;
  }
  if (week.scrapeStatus && week.scrapeStatus !== "pending") {
    return false;
  }
  return new Date(week.scrapeAt).getTime() <= now.getTime();
}
