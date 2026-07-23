import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { PickemRepository } from "./repository";
import { assertBeforeCutoff } from "./time";
import type { Game, PlayerPick, Week } from "./types";

const gameSchema = z.object({
  gameId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  league: z.enum(["NFL", "NCAAF"]),
  awayTeam: z.string(),
  homeTeam: z.string(),
  kickoffAt: z.string(),
  status: z.enum(["scheduled", "final"]).default("scheduled"),
  homeScore: z.number().optional(),
  awayScore: z.number().optional()
});

const pickSchema = z.object({
  seasonId: z.string(),
  weekId: z.string(),
  gameId: z.string(),
  market: z.enum(["spread", "moneyline"]),
  selectedTeam: z.string()
});

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const repository = new PickemRepository();
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/health") {
      return json({ ok: true });
    }

    if (method === "GET" && path === "/week") {
      const seasonId = requireQuery(event, "seasonId");
      const weekId = requireQuery(event, "weekId");
      const [week, games] = await Promise.all([
        repository.getWeek(seasonId, weekId),
        repository.listGames(seasonId, weekId)
      ]);
      return json({ week, games });
    }

    if (method === "POST" && path === "/admin/games") {
      requireGroup(event, "admin");
      const game = gameSchema.parse(parseBody(event)) as Game;
      await repository.putGame(game);
      return json({ game }, 201);
    }

    if (method === "PUT" && path === "/picks") {
      const body = pickSchema.parse(parseBody(event));
      const week = await repository.getWeek(body.seasonId, body.weekId);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);

      const pick: PlayerPick = {
        ...body,
        userId: getUserId(event),
        submittedAt: new Date().toISOString(),
        result: "pending"
      };
      await repository.putPick(pick);
      return json({ pick });
    }

    if (method === "POST" && path === "/admin/weeks") {
      requireGroup(event, "admin");
      const week = parseBody(event) as Week;
      await repository.putWeek(week);
      return json({ week }, 201);
    }

    return json({ message: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const statusCode = message.includes("locked") ? 409 : message.includes("Unauthorized") ? 403 : 400;
    return json({ message }, statusCode);
  }
}

function parseBody(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
  return event.body ? JSON.parse(event.body) : {};
}

function requireQuery(event: APIGatewayProxyEventV2WithJWTAuthorizer, key: string): string {
  const value = event.queryStringParameters?.[key];
  if (!value) {
    throw new Error(`${key} query parameter is required.`);
  }
  return value;
}

function requireGroup(event: APIGatewayProxyEventV2WithJWTAuthorizer, group: string): void {
  const groups = String(event.requestContext.authorizer.jwt.claims["cognito:groups"] ?? "");
  if (!groups.split(",").includes(group)) {
    throw new Error("Unauthorized.");
  }
}

function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  return String(event.requestContext.authorizer.jwt.claims.sub);
}

function json(body: unknown, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*"
    },
    body: JSON.stringify(body)
  };
}
