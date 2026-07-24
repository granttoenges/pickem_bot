import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { PickemRepository } from "./repository";
import { assertBeforeCutoff, defaultWeeklyCutoffUtc } from "./time";
import { pickSummary, validateQuota } from "./pickRules";
import type { AppLeague, Game, GameWithOptions, LeagueMember, PickOption, PlayerPick, Week } from "./types";

const cognito = new CognitoIdentityProviderClient({});

const defaultLeagueId = "friends";
const superAdminEmails = new Set(["grantoenges@gmail.com"]);

const createLeagueSchema = z.object({
  name: z.string().min(1).max(80)
});

const memberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["league_admin", "player"])
});

const inviteSchema = z.object({
  leagueId: z.string().min(1),
  email: z.string().email()
});

const weekSettingsSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  nflPickCountRequired: z.number().int().min(0).max(20),
  ncaafPickCountRequired: z.number().int().min(0).max(20)
});

const gameSchema = z.object({
  leagueId: z.string().default(defaultLeagueId),
  gameId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  sportLeague: z.enum(["NFL", "NCAAF"]).optional(),
  league: z.enum(["NFL", "NCAAF"]).optional(),
  awayTeam: z.string(),
  homeTeam: z.string(),
  kickoffAt: z.string(),
  status: z.enum(["scheduled", "final"]).default("scheduled"),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  adminNote: z.string().optional(),
  overrideSource: z.enum(["draftkings", "admin_override"]).optional()
}).transform((game) => ({ ...game, sportLeague: game.sportLeague ?? game.league }) as Game);

const pickSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  optionId: z.string().min(1),
  previousOptionId: z.string().optional()
});

const releasePickSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  optionId: z.string().min(1)
});

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const repository = new PickemRepository();
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/health") {
      return json({ ok: true });
    }

    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: corsHeaders()
      };
    }

    const auth = getAuth(event);

    if (method === "GET" && path === "/leagues") {
      const leagues = await leaguesForUser(repository, auth);
      return json({ leagues });
    }

    if (method === "POST" && path === "/admin/leagues") {
      requireSuperAdmin(auth);
      const body = createLeagueSchema.parse(parseBody(event));
      const now = new Date().toISOString();
      const league: AppLeague = {
        leagueId: slugify(body.name),
        name: body.name,
        createdBy: auth.userId,
        createdAt: now,
        status: "active"
      };
      await repository.putAppLeague(league);
      await repository.putLeagueMember({
        leagueId: league.leagueId,
        userId: auth.userId,
        email: auth.email,
        role: "league_admin",
        createdAt: now
      });
      return json({ league }, 201);
    }

    const memberMatch = path.match(/^\/admin\/leagues\/([^/]+)\/members$/);
    if (method === "PUT" && memberMatch) {
      const leagueId = decodeURIComponent(memberMatch[1]);
      await requireLeagueAdmin(repository, auth, leagueId);
      const body = memberSchema.parse(parseBody(event));
      const member: LeagueMember = {
        leagueId,
        userId: body.userId,
        email: body.email,
        role: body.role,
        createdAt: new Date().toISOString()
      };
      await repository.putLeagueMember(member);
      return json({ member });
    }

    if (method === "GET" && path === "/week") {
      const leagueId = requireQuery(event, "leagueId");
      const seasonId = requireQuery(event, "seasonId");
      const weekId = requireQuery(event, "weekId");
      await requireLeagueAccess(repository, auth, leagueId);
      const [week, games, options, claims, userPicks] = await Promise.all([
        repository.getWeek(leagueId, seasonId, weekId),
        repository.listGames(leagueId, seasonId, weekId),
        repository.listPickOptions(leagueId, seasonId, weekId),
        repository.listClaims(leagueId, seasonId, weekId),
        repository.listUserPicks(leagueId, seasonId, weekId, auth.userId)
      ]);
      return json({
        week: week ?? defaultWeek(leagueId, seasonId, weekId),
        games: await withOptions(repository, games, options),
        claims,
        userPicks,
        summary: pickSummary(userPicks, week ?? defaultWeek(leagueId, seasonId, weekId))
      });
    }

    if (method === "GET" && path === "/admin/week") {
      const leagueId = requireQuery(event, "leagueId");
      const seasonId = requireQuery(event, "seasonId");
      const weekId = requireQuery(event, "weekId");
      await requireLeagueAdmin(repository, auth, leagueId);
      const [week, games, options, claims, picks, scrapeRuns, members] = await Promise.all([
        repository.getWeek(leagueId, seasonId, weekId),
        repository.listGames(leagueId, seasonId, weekId),
        repository.listPickOptions(leagueId, seasonId, weekId),
        repository.listClaims(leagueId, seasonId, weekId),
        repository.listPicks(leagueId, seasonId, weekId),
        repository.listScrapeRuns(seasonId, weekId),
        repository.listLeagueMembers(leagueId)
      ]);
      return json({
        week: week ?? defaultWeek(leagueId, seasonId, weekId),
        games: await withOptions(repository, games, options),
        claims,
        picks,
        scrapeRuns,
        members
      });
    }

    if (method === "POST" && path === "/admin/games") {
      const game = gameSchema.parse(parseBody(event));
      await requireLeagueAdmin(repository, auth, game.leagueId);
      await repository.putGame(game);
      return json({ game }, 201);
    }

    if (method === "PUT" && path === "/admin/week/settings") {
      const body = weekSettingsSchema.parse(parseBody(event));
      await requireLeagueAdmin(repository, auth, body.leagueId);
      const current = await repository.getWeek(body.leagueId, body.seasonId, body.weekId);
      const week: Week = {
        ...(current ?? defaultWeek(body.leagueId, body.seasonId, body.weekId)),
        nflPickCountRequired: body.nflPickCountRequired,
        ncaafPickCountRequired: body.ncaafPickCountRequired
      };
      await repository.putWeek(week);
      return json({ week });
    }

    if (method === "POST" && path === "/admin/invites") {
      const body = inviteSchema.parse(parseBody(event));
      await requireLeagueAdmin(repository, auth, body.leagueId);
      const member = await invitePlayer(repository, body.leagueId, body.email);
      return json({ member }, 201);
    }

    if (method === "PUT" && path === "/picks") {
      const body = pickSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const [week, options, currentPicks] = await Promise.all([
        repository.getWeek(body.leagueId, body.seasonId, body.weekId),
        repository.listPickOptions(body.leagueId, body.seasonId, body.weekId),
        repository.listUserPicks(body.leagueId, body.seasonId, body.weekId, auth.userId)
      ]);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const option = options.find((item) => item.optionId === body.optionId);
      if (!option) {
        return json({ message: "Pick option not found." }, 404);
      }
      validateQuota(week, option.sportLeague, currentPicks, body.previousOptionId, body.optionId);
      const now = new Date().toISOString();
      const pick: PlayerPick = {
        leagueId: body.leagueId,
        seasonId: body.seasonId,
        weekId: body.weekId,
        optionId: body.optionId,
        userId: auth.userId,
        claimedAt: now,
        gameId: option.gameId,
        sportLeague: option.sportLeague,
        team: option.team,
        market: option.market,
        side: option.side,
        lineValue: option.lineValue,
        submittedAt: now,
        result: "pending"
      };
      await repository.claimPick(pick, body.previousOptionId);
      return json({ pick });
    }

    if (method === "DELETE" && path === "/picks") {
      const body = releasePickSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const week = await repository.getWeek(body.leagueId, body.seasonId, body.weekId);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      await repository.releasePick(body.leagueId, body.seasonId, body.weekId, auth.userId, body.optionId);
      return json({ ok: true });
    }

    if (method === "GET" && path === "/standings") {
      const leagueId = requireQuery(event, "leagueId");
      const seasonId = requireQuery(event, "seasonId");
      await requireLeagueAccess(repository, auth, leagueId);
      const standings = await repository.listStandings(leagueId, seasonId);
      return json({ standings });
    }

    return json({ message: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const statusCode = message.includes("locked")
      ? 409
      : message.includes("Unauthorized")
        ? 403
        : message.includes("already been claimed")
          ? 409
          : 400;
    return json({ message }, statusCode);
  }
}

async function withOptions(repository: PickemRepository, games: Game[], options: PickOption[]): Promise<GameWithOptions[]> {
  return Promise.all(games.map(async (game) => ({
    ...game,
    lines: await repository.listOpeningLines(game.gameId),
    options: options.filter((option) => option.gameId === game.gameId)
  })));
}

function defaultWeek(leagueId: string, seasonId: string, weekId: string): Week {
  return {
    leagueId,
    seasonId,
    weekId,
    label: `Week ${weekId}`,
    cutoffAt: defaultWeeklyCutoffUtc(new Date()),
    status: "open",
    nflPickCountRequired: 3,
    ncaafPickCountRequired: 3
  };
}

async function leaguesForUser(repository: PickemRepository, auth: AuthState): Promise<AppLeague[]> {
  const allLeagues = await repository.listAppLeagues();
  if (auth.isSuperAdmin || auth.isLegacyAdmin) {
    return allLeagues;
  }
  const memberships = await repository.listMembersForUser(auth.userId);
  const memberLeagueIds = new Set(memberships.map((member) => member.leagueId));
  return allLeagues.filter((league) => memberLeagueIds.has(league.leagueId));
}

async function requireLeagueAccess(repository: PickemRepository, auth: AuthState, leagueId: string): Promise<void> {
  if (auth.isSuperAdmin || auth.isLegacyAdmin) {
    return;
  }
  const member = await repository.getLeagueMember(leagueId, auth.userId);
  if (!member) {
    throw new Error("Unauthorized.");
  }
}

async function requireLeagueAdmin(repository: PickemRepository, auth: AuthState, leagueId: string): Promise<void> {
  if (auth.isSuperAdmin || auth.isLegacyAdmin) {
    return;
  }
  const member = await repository.getLeagueMember(leagueId, auth.userId);
  if (member?.role !== "league_admin") {
    throw new Error("Unauthorized.");
  }
}

function requireSuperAdmin(auth: AuthState): void {
  if (!auth.isSuperAdmin && !auth.isLegacyAdmin) {
    throw new Error("Unauthorized.");
  }
}

async function invitePlayer(repository: PickemRepository, leagueId: string, email: string): Promise<LeagueMember> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    throw new Error("USER_POOL_ID is required for invites.");
  }

  let userId: string | undefined;
  try {
    const existing = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }));
    userId = existing.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value;
  } catch {
    const created = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      DesiredDeliveryMediums: ["EMAIL"],
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" }
      ]
    }));
    userId = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  }

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: email,
    GroupName: "player"
  }));

  const member: LeagueMember = {
    leagueId,
    userId: userId ?? email,
    email,
    role: "player",
    createdAt: new Date().toISOString()
  };
  await repository.putLeagueMember(member);
  return member;
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

interface AuthState {
  userId: string;
  email?: string;
  groups: string[];
  isSuperAdmin: boolean;
  isLegacyAdmin: boolean;
}

function getAuth(event: APIGatewayProxyEventV2WithJWTAuthorizer): AuthState {
  const claims = event.requestContext.authorizer.jwt.claims;
  const groups = parseGroups(claims["cognito:groups"]);
  const email = claims.email ? String(claims.email).toLowerCase() : undefined;
  const isEmailSuperAdmin = email ? superAdminEmails.has(email) : false;
  return {
    userId: String(claims.sub),
    email,
    groups,
    isSuperAdmin: isEmailSuperAdmin || groups.includes("super_admin"),
    isLegacyAdmin: groups.includes("admin")
  };
}

function parseGroups(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((group) => String(group).trim()).filter(Boolean);
  }
  return String(value ?? "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((group) => group.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function json(body: unknown, statusCode = 200): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...corsHeaders()
    },
    body: JSON.stringify(body)
  };
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "league";
}
