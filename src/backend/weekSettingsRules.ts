import type { Week } from "./types";

export interface WeekSettingsInput {
  nflPickCountRequired: number;
  ncaafPickCountRequired: number;
  scrapeAt?: string;
  cutoffAt: string;
}

export function applyWeekSettings(current: Week, settings: WeekSettingsInput): Week {
  const scrapeAtChanged = settings.scrapeAt !== current.scrapeAt;
  return {
    ...current,
    nflPickCountRequired: settings.nflPickCountRequired,
    ncaafPickCountRequired: settings.ncaafPickCountRequired,
    cutoffAt: settings.cutoffAt,
    scrapeAt: settings.scrapeAt,
    scrapeStatus: scrapeAtChanged ? "pending" : current.scrapeStatus ?? (settings.scrapeAt ? "pending" : undefined),
    scrapeCompletedAt: scrapeAtChanged ? undefined : current.scrapeCompletedAt
  };
}
