import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { EventBridgeEvent } from "aws-lambda";
import { PickemRepository } from "./repository";
import { isScrapeDue, scrapeStatusFromPayload } from "./scrapeSchedulerRules";

const lambda = new LambdaClient({});

export async function handler(_event: EventBridgeEvent<"Scheduled Event", unknown>): Promise<{ checked: number; invoked: number; failed: number }> {
  const repository = new PickemRepository();
  const now = new Date();
  const dueWeeks = (await repository.listDueScrapeWeeks(now.toISOString())).filter((week) => isScrapeDue(week, now));
  let invoked = 0;
  let failed = 0;

  for (const week of dueWeeks) {
    try {
      await repository.updateWeekScrapeStatus(week, "running");
      const result = await lambda.send(new InvokeCommand({
        FunctionName: process.env.SCRAPER_FUNCTION_NAME,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify({
          "detail-type": "Scheduled Event",
          detail: {
            leagueId: week.leagueId,
            seasonId: week.seasonId,
            weekId: week.weekId
          }
        }))
      }));
      if (result.FunctionError) {
        throw new Error(`Scraper Lambda returned ${result.FunctionError}.`);
      }
      const status = scrapeStatusFromPayload(parsePayload(result.Payload));
      await repository.updateWeekScrapeStatus(week, status, new Date().toISOString());
      if (status === "failed") {
        failed += 1;
      } else {
        invoked += 1;
      }
    } catch (error) {
      failed += 1;
      await repository.updateWeekScrapeStatus(week, "failed", new Date().toISOString());
      console.error("DraftKings scheduled scrape failed", { week, error });
    }
  }

  return { checked: dueWeeks.length, invoked, failed };
}

function parsePayload(payload?: Uint8Array): unknown {
  if (!payload) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.from(payload).toString("utf8"));
  } catch {
    return undefined;
  }
}
