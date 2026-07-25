const CENTRAL_TIME_ZONE = "America/Chicago";

export function defaultWeeklyCutoffUtc(weekStart: Date): string {
  const centralParts = getCentralParts(weekStart);
  const friday = new Date(Date.UTC(centralParts.year, centralParts.month - 1, centralParts.day));
  const day = friday.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);

  return centralWallTimeToUtc(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate(), 10, 0).toISOString();
}

export function defaultWeeklyScrapeUtc(weekStart: Date): string {
  const centralParts = getCentralParts(weekStart);
  const tuesday = new Date(Date.UTC(centralParts.year, centralParts.month - 1, centralParts.day));
  const day = tuesday.getUTCDay();
  const daysUntilTuesday = (2 - day + 7) % 7;
  tuesday.setUTCDate(tuesday.getUTCDate() + daysUntilTuesday);

  return centralWallTimeToUtc(tuesday.getUTCFullYear(), tuesday.getUTCMonth() + 1, tuesday.getUTCDate(), 10, 0).toISOString();
}

export function isBeforeCutoff(now: Date, cutoffAt: string): boolean {
  return now.getTime() < new Date(cutoffAt).getTime();
}

export function assertBeforeCutoff(now: Date, cutoffAt: string): void {
  if (!isBeforeCutoff(now, cutoffAt)) {
    throw new Error("Picks are locked for this week.");
  }
}

function getCentralParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function centralWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const firstGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(firstGuess, CENTRAL_TIME_ZONE);
  return new Date(firstGuess.getTime() - offsetMinutes * 60_000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}
