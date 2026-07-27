import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { PickemRepository } from "./repository";
import { assertBeforeCutoff, defaultWeeklyCutoffUtc, defaultWeeklyScrapeUtc } from "./time";
import { assertCanManuallyChangeProposalResponse, pickSummary, proposalSummary, responseResult, selfWithResponseForProposal, validateProposalQuota, validateQuota } from "./pickRules";
import { applyWeekSettings } from "./weekSettingsRules";
import { assertCanRemoveLeagueMember } from "./memberRemovalRules";
import type { AppLeague, Game, GameWithOptions, LeagueMember, LineProposal, PickOption, PlayerPick, ProposalResponse, Week } from "./types";

const cognito = new CognitoIdentityProviderClient({});

const defaultLeagueId = "friends";
const superAdminEmails = new Set(["grantoenges@gmail.com"]);
let requestOrigin: string | undefined;

const createLeagueSchema = z.object({
  name: z.string().min(1).max(80)
});

const leagueSettingsSchema = z.object({
  pickMode: z.enum(["member_proposed", "admin_selected"])
});

const memberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["league_admin", "player"])
});

const removeMemberSchema = z.object({
  userId: z.string().min(1)
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
  ncaafPickCountRequired: z.number().int().min(0).max(20),
  scrapeAt: z.string().datetime().optional(),
  cutoffAt: z.string().datetime()
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

const proposalSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  optionId: z.string().min(1),
  previousProposalId: z.string().optional()
});

const adminBoardLineSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  optionId: z.string().min(1)
});

const deleteAdminBoardLineSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  proposalId: z.string().min(1)
});

const releaseProposalSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  proposalId: z.string().min(1)
});

const proposalResponseSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  proposalId: z.string().min(1),
  stance: z.enum(["with", "against"])
});

const deleteProposalResponseSchema = z.object({
  leagueId: z.string().min(1),
  seasonId: z.string().min(1),
  weekId: z.string().min(1),
  proposalId: z.string().min(1)
});

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const repository = new PickemRepository();
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    requestOrigin = event.headers.origin ?? event.headers.Origin;

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
      return json({ leagues: leagues.map(normalizeAppLeague) });
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
        status: "active",
        pickMode: "member_proposed"
      };
      await repository.putAppLeague(league).catch((error) => {
        if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
          throw new SafeApiError("A league with that name already exists.", 409);
        }
        throw error;
      });
      await repository.putLeagueMember({
        leagueId: league.leagueId,
        userId: auth.userId,
        email: auth.email,
        role: "league_admin",
        createdAt: now
      });
      return json({ league }, 201);
    }

    const leagueSettingsMatch = path.match(/^\/admin\/leagues\/([^/]+)\/settings$/);
    if (method === "PUT" && leagueSettingsMatch) {
      const leagueId = decodeURIComponent(leagueSettingsMatch[1]);
      await requireLeagueAdmin(repository, auth, leagueId);
      const body = leagueSettingsSchema.parse(parseBody(event));
      const league = await repository.updateAppLeaguePickMode(leagueId, body.pickMode);
      return json({ league: normalizeAppLeague(league) });
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

    if (method === "DELETE" && memberMatch) {
      const leagueId = decodeURIComponent(memberMatch[1]);
      const body = removeMemberSchema.parse(parseBody(event));
      const [actorMember, targetMember] = await Promise.all([
        auth.isSuperAdmin ? Promise.resolve(undefined) : repository.getLeagueMember(leagueId, auth.userId),
        repository.getLeagueMember(leagueId, body.userId)
      ]);
      if (!targetMember) {
        return json({ message: "Member not found." }, 404);
      }
      const targetIsSuperAdmin = await isCognitoSuperAdmin(targetMember.email);
      assertCanRemoveLeagueMember(
        {
          userId: auth.userId,
          isSuperAdmin: auth.isSuperAdmin,
          isLeagueAdmin: actorMember?.role === "league_admin"
        },
        {
          userId: targetMember.userId,
          role: targetMember.role,
          isSuperAdmin: targetIsSuperAdmin
        }
      );
      await repository.removeUserFromLeague(leagueId, targetMember.userId);
      const remainingMemberships = await repository.listMembersForUser(targetMember.userId);
      const cognitoDeleted = remainingMemberships.length === 0 && targetMember.email
        ? await deleteCognitoUserIfPresent(targetMember.email)
        : false;
      return json({ ok: true, cognitoDeleted });
    }

    if (method === "GET" && path === "/week") {
      const leagueId = requireQuery(event, "leagueId");
      const seasonId = requireQuery(event, "seasonId");
      const weekId = requireQuery(event, "weekId");
      await requireLeagueAccess(repository, auth, leagueId);
      const [league, week, games, options, claims, userPicks, persistedProposals, responses, members] = await Promise.all([
        repository.getAppLeague(leagueId),
        repository.getWeek(leagueId, seasonId, weekId),
        repository.listWeekGames(leagueId, seasonId, weekId),
        repository.listPickOptions(leagueId, seasonId, weekId),
        repository.listClaims(leagueId, seasonId, weekId),
        repository.listUserPicks(leagueId, seasonId, weekId, auth.userId),
        repository.listProposals(leagueId, seasonId, weekId),
        repository.listProposalResponses(leagueId, seasonId, weekId),
        repository.listLeagueMembers(leagueId)
      ]);
      const selectedWeek = week ?? defaultWeek(leagueId, seasonId, weekId);
      const proposals = hydrateProposalLabels(mergeLegacyPickProposals(persistedProposals, await repository.listPicks(leagueId, seasonId, weekId)), members);
      const pickMode = normalizePickMode(league?.pickMode);
      const userProposals = proposals.filter((proposal) => proposal.proposalSource !== "admin_selected" && proposal.proposerId === auth.userId);
      return json({
        league: league ? normalizeAppLeague(league) : undefined,
        pickMode,
        week: selectedWeek,
        games: await withOptions(repository, games, options),
        claims,
        userPicks,
        summary: pickSummary(userPicks, selectedWeek),
        proposals,
        userProposals,
        proposalResponses: responses,
        userProposalResponses: responses.filter((response) => response.responderId === auth.userId),
        proposalSummary: proposalSummary(userProposals, selectedWeek)
      });
    }

    if (method === "GET" && path === "/admin/week") {
      const leagueId = requireQuery(event, "leagueId");
      const seasonId = requireQuery(event, "seasonId");
      const weekId = requireQuery(event, "weekId");
      await requireLeagueAdmin(repository, auth, leagueId);
      const [league, week, games, options, claims, picks, persistedProposals, responses, scrapeRuns, members] = await Promise.all([
        repository.getAppLeague(leagueId),
        repository.getWeek(leagueId, seasonId, weekId),
        repository.listWeekGames(leagueId, seasonId, weekId),
        repository.listPickOptions(leagueId, seasonId, weekId),
        repository.listClaims(leagueId, seasonId, weekId),
        repository.listPicks(leagueId, seasonId, weekId),
        repository.listProposals(leagueId, seasonId, weekId),
        repository.listProposalResponses(leagueId, seasonId, weekId),
        repository.listScrapeRuns(seasonId, weekId),
        repository.listLeagueMembers(leagueId)
      ]);
      const proposals = hydrateProposalLabels(mergeLegacyPickProposals(persistedProposals, picks), members);
      return json({
        league: league ? normalizeAppLeague(league) : undefined,
        pickMode: normalizePickMode(league?.pickMode),
        week: week ?? defaultWeek(leagueId, seasonId, weekId),
        games: await withOptions(repository, games, options),
        claims,
        picks,
        proposals,
        proposalResponses: responses,
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
      const week = applyWeekSettings(current ?? defaultWeek(body.leagueId, body.seasonId, body.weekId), {
        nflPickCountRequired: body.nflPickCountRequired,
        ncaafPickCountRequired: body.ncaafPickCountRequired,
        cutoffAt: body.cutoffAt,
        scrapeAt: body.scrapeAt
      });
      await repository.putWeek(week);
      return json({ week });
    }

    if (method === "PUT" && path === "/admin/board-lines") {
      const body = adminBoardLineSchema.parse(parseBody(event));
      await requireLeagueAdmin(repository, auth, body.leagueId);
      const [league, week, options] = await Promise.all([
        repository.getAppLeague(body.leagueId),
        repository.getWeek(body.leagueId, body.seasonId, body.weekId),
        listAvailablePickOptions(repository, body.leagueId, body.seasonId, body.weekId)
      ]);
      if (normalizePickMode(league?.pickMode) !== "admin_selected") {
        return json({ message: "League is not in admin-selected mode." }, 409);
      }
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const option = options.find((item) => item.optionId === body.optionId);
      if (!option) {
        return json({ message: "Pick option not found." }, 404);
      }
      const now = new Date().toISOString();
      const proposal: LineProposal = {
        leagueId: body.leagueId,
        seasonId: body.seasonId,
        weekId: body.weekId,
        proposalId: adminBoardProposalIdFor(body.optionId),
        optionId: body.optionId,
        proposerId: adminBoardProposerId(),
        proposerLabel: "League Board",
        proposalSource: "admin_selected",
        gameId: option.gameId,
        sportLeague: option.sportLeague,
        team: option.team,
        market: option.market,
        side: option.side,
        lineValue: option.lineValue,
        label: option.label,
        submittedAt: now,
        result: "pending"
      };
      await repository.putProposal(proposal);
      return json({ proposal });
    }

    if (method === "DELETE" && path === "/admin/board-lines") {
      const body = deleteAdminBoardLineSchema.parse(parseBody(event));
      await requireLeagueAdmin(repository, auth, body.leagueId);
      const week = await repository.getWeek(body.leagueId, body.seasonId, body.weekId);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const proposal = (await repository.listProposals(body.leagueId, body.seasonId, body.weekId)).find((item) => item.proposalId === body.proposalId);
      if (!proposal || proposal.proposalSource !== "admin_selected") {
        return json({ message: "Admin-selected line not found." }, 404);
      }
      await repository.deleteProposal(body.leagueId, body.seasonId, body.weekId, adminBoardProposerId(), body.proposalId);
      const responses = await repository.listProposalResponses(body.leagueId, body.seasonId, body.weekId);
      await Promise.all(responses
        .filter((response) => response.proposalId === body.proposalId)
        .map((response) => repository.deleteProposalResponse(body.leagueId, body.seasonId, body.weekId, body.proposalId, response.responderId)));
      return json({ ok: true });
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
        listAvailablePickOptions(repository, body.leagueId, body.seasonId, body.weekId),
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

    if (method === "PUT" && path === "/proposals") {
      const body = proposalSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const [league, week, options, persistedCurrentProposals, currentPicks] = await Promise.all([
        repository.getAppLeague(body.leagueId),
        repository.getWeek(body.leagueId, body.seasonId, body.weekId),
        listAvailablePickOptions(repository, body.leagueId, body.seasonId, body.weekId),
        repository.listUserProposals(body.leagueId, body.seasonId, body.weekId, auth.userId),
        repository.listUserPicks(body.leagueId, body.seasonId, body.weekId, auth.userId)
      ]);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      if (normalizePickMode(league?.pickMode) === "admin_selected") {
        return json({ message: "This league uses admin-selected lines. Respond from League Picks instead." }, 409);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const option = options.find((item) => item.optionId === body.optionId);
      if (!option) {
        return json({ message: "Pick option not found." }, 404);
      }
      const previousProposalId = body.previousProposalId;
      const currentProposals = mergeLegacyPickProposals(persistedCurrentProposals, currentPicks);
      validateProposalQuota(week, option.sportLeague, currentProposals, previousProposalId);
      const now = new Date().toISOString();
      const proposal: LineProposal = {
        leagueId: body.leagueId,
        seasonId: body.seasonId,
        weekId: body.weekId,
        proposalId: proposalIdFor(auth.userId, body.optionId),
        optionId: body.optionId,
        proposerId: auth.userId,
        proposerLabel: auth.email ?? shortUserId(auth.userId),
        proposalSource: "member",
        gameId: option.gameId,
        sportLeague: option.sportLeague,
        team: option.team,
        market: option.market,
        side: option.side,
        lineValue: option.lineValue,
        label: option.label,
        submittedAt: now,
        result: "pending"
      };
      await repository.putProposalWithSelfResponse(proposal, selfWithResponseForProposal(proposal), previousProposalId);
      if (previousProposalId && previousProposalId !== proposal.proposalId) {
        const responses = await repository.listProposalResponses(body.leagueId, body.seasonId, body.weekId);
        await Promise.all(responses
          .filter((response) => response.proposalId === previousProposalId)
          .map((response) => repository.deleteProposalResponse(body.leagueId, body.seasonId, body.weekId, previousProposalId, response.responderId)));
        const legacyPrevious = currentPicks.find((pick) => proposalIdFor(pick.userId, pick.optionId) === previousProposalId);
        if (legacyPrevious) {
          await releaseLegacyPick(repository, body.leagueId, body.seasonId, body.weekId, auth.userId, legacyPrevious.optionId);
        }
      }
      return json({ proposal });
    }

    if (method === "DELETE" && path === "/proposals") {
      const body = releaseProposalSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const week = await repository.getWeek(body.leagueId, body.seasonId, body.weekId);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      await repository.deleteProposal(body.leagueId, body.seasonId, body.weekId, auth.userId, body.proposalId);
      const legacyPick = (await repository.listUserPicks(body.leagueId, body.seasonId, body.weekId, auth.userId))
        .find((pick) => proposalIdFor(pick.userId, pick.optionId) === body.proposalId);
      if (legacyPick) {
        await releaseLegacyPick(repository, body.leagueId, body.seasonId, body.weekId, auth.userId, legacyPick.optionId);
      }
      const responses = await repository.listProposalResponses(body.leagueId, body.seasonId, body.weekId);
      await Promise.all(responses
        .filter((response) => response.proposalId === body.proposalId)
        .map((response) => repository.deleteProposalResponse(body.leagueId, body.seasonId, body.weekId, body.proposalId, response.responderId)));
      return json({ ok: true });
    }

    if (method === "PUT" && path === "/proposal-responses") {
      const body = proposalResponseSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const [week, persistedProposals, picks] = await Promise.all([
        repository.getWeek(body.leagueId, body.seasonId, body.weekId),
        repository.listProposals(body.leagueId, body.seasonId, body.weekId),
        repository.listPicks(body.leagueId, body.seasonId, body.weekId)
      ]);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const proposal = mergeLegacyPickProposals(persistedProposals, picks).find((item) => item.proposalId === body.proposalId);
      if (!proposal) {
        return json({ message: "Proposal not found." }, 404);
      }
      try {
        assertCanManuallyChangeProposalResponse(proposal, auth.userId);
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : "You cannot respond to your own proposed line." }, 409);
      }
      const response: ProposalResponse = {
        leagueId: body.leagueId,
        seasonId: body.seasonId,
        weekId: body.weekId,
        proposalId: body.proposalId,
        responderId: auth.userId,
        stance: body.stance,
        submittedAt: new Date().toISOString(),
        result: responseResult(proposal.result, body.stance)
      };
      await repository.putProposalResponse(response);
      return json({ response });
    }

    if (method === "DELETE" && path === "/proposal-responses") {
      const body = deleteProposalResponseSchema.parse(parseBody(event));
      await requireLeagueAccess(repository, auth, body.leagueId);
      const [week, persistedProposals, picks] = await Promise.all([
        repository.getWeek(body.leagueId, body.seasonId, body.weekId),
        repository.listProposals(body.leagueId, body.seasonId, body.weekId),
        repository.listPicks(body.leagueId, body.seasonId, body.weekId)
      ]);
      if (!week) {
        return json({ message: "Week not found." }, 404);
      }
      assertBeforeCutoff(new Date(), week.cutoffAt);
      const proposal = mergeLegacyPickProposals(persistedProposals, picks).find((item) => item.proposalId === body.proposalId);
      if (!proposal) {
        return json({ message: "Proposal not found." }, 404);
      }
      try {
        assertCanManuallyChangeProposalResponse(proposal, auth.userId);
      } catch (error) {
        return json({ message: error instanceof Error ? error.message : "You cannot delete your own automatic with response." }, 409);
      }
      await repository.deleteProposalResponse(body.leagueId, body.seasonId, body.weekId, body.proposalId, auth.userId);
      return json({ ok: true });
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
    if (error instanceof SafeApiError) {
      return json({ message: error.message }, error.statusCode);
    }
    if (error instanceof z.ZodError) {
      return json({ message: "Invalid request." }, 400);
    }
    const message = error instanceof Error ? error.message : "Unexpected error.";
    if (message.includes("locked")) {
      return json({ message }, 409);
    }
    if (message.includes("Unauthorized")) {
      return json({ message: "Unauthorized." }, 403);
    }
    if (message.includes("cannot remove") || message.includes("Only a super admin") || message.includes("Super admins cannot be removed")) {
      return json({ message }, 403);
    }
    if (message.includes("already been claimed")) {
      return json({ message }, 409);
    }
    if (message.includes("proposal limit")) {
      return json({ message }, 409);
    }
    console.error("Unhandled API error", error);
    return json({ message: "Unexpected server error." }, 500);
  }
}

async function listAvailablePickOptions(repository: PickemRepository, leagueId: string, seasonId: string, weekId: string): Promise<PickOption[]> {
  const [games, persistedOptions] = await Promise.all([
    repository.listWeekGames(leagueId, seasonId, weekId),
    repository.listPickOptions(leagueId, seasonId, weekId)
  ]);
  const gamesWithOptions = await withOptions(repository, games, persistedOptions);
  return gamesWithOptions.flatMap((game) => game.options);
}

async function withOptions(repository: PickemRepository, games: Game[], persistedOptions: PickOption[]): Promise<GameWithOptions[]> {
  return Promise.all(games.map(async (game) => {
    const lines = await repository.listOpeningLines(game.gameId);
    const options = new Map<string, PickOption>();
    for (const option of buildPickOptions(game, lines)) {
      options.set(option.optionId, option);
    }
    for (const option of persistedOptions.filter((item) => item.gameId === game.gameId)) {
      options.set(option.optionId, option);
    }
    return {
      ...game,
      lines,
      options: [...options.values()]
    };
  }));
}

export function buildPickOptions(game: Game, lines: GameWithOptions["lines"]): PickOption[] {
  const base = {
    leagueId: game.leagueId,
    seasonId: game.seasonId,
    weekId: game.weekId,
    gameId: game.gameId,
    sportLeague: game.sportLeague
  };
  const spread = lines.find((line) => line.market === "spread");
  const teamTotal = lines.find((line) => line.market === "team_total");
  const gameTotal = lines.find((line) => line.market === "game_total");
  const options: PickOption[] = [];

  if (spread?.awaySpread !== undefined) {
    options.push({
      ...base,
      optionId: `${game.gameId}-away-spread`,
      team: game.awayTeam,
      market: "spread",
      side: "away",
      lineValue: spread.awaySpread,
      label: `${game.awayTeam} ${formatSigned(spread.awaySpread)}`
    });
  }
  if (spread?.homeSpread !== undefined) {
    options.push({
      ...base,
      optionId: `${game.gameId}-home-spread`,
      team: game.homeTeam,
      market: "spread",
      side: "home",
      lineValue: spread.homeSpread,
      label: `${game.homeTeam} ${formatSigned(spread.homeSpread)}`
    });
  }
  if (teamTotal?.awayTeamTotal !== undefined) {
    options.push(
      {
        ...base,
        optionId: `${game.gameId}-away-total-over`,
        team: game.awayTeam,
        market: "team_total",
        side: "over",
        lineValue: teamTotal.awayTeamTotal,
        label: `${game.awayTeam} over ${teamTotal.awayTeamTotal}`
      },
      {
        ...base,
        optionId: `${game.gameId}-away-total-under`,
        team: game.awayTeam,
        market: "team_total",
        side: "under",
        lineValue: teamTotal.awayTeamTotal,
        label: `${game.awayTeam} under ${teamTotal.awayTeamTotal}`
      }
    );
  }
  if (teamTotal?.homeTeamTotal !== undefined) {
    options.push(
      {
        ...base,
        optionId: `${game.gameId}-home-total-over`,
        team: game.homeTeam,
        market: "team_total",
        side: "over",
        lineValue: teamTotal.homeTeamTotal,
        label: `${game.homeTeam} over ${teamTotal.homeTeamTotal}`
      },
      {
        ...base,
        optionId: `${game.gameId}-home-total-under`,
        team: game.homeTeam,
        market: "team_total",
        side: "under",
        lineValue: teamTotal.homeTeamTotal,
        label: `${game.homeTeam} under ${teamTotal.homeTeamTotal}`
      }
    );
  }
  if (gameTotal?.gameTotal !== undefined) {
    options.push(
      {
        ...base,
        optionId: `${game.gameId}-game-total-over`,
        team: `${game.awayTeam}/${game.homeTeam}`,
        market: "game_total",
        side: "over",
        lineValue: gameTotal.gameTotal,
        label: `${game.awayTeam}/${game.homeTeam} over ${gameTotal.gameTotal}`
      },
      {
        ...base,
        optionId: `${game.gameId}-game-total-under`,
        team: `${game.awayTeam}/${game.homeTeam}`,
        market: "game_total",
        side: "under",
        lineValue: gameTotal.gameTotal,
        label: `${game.awayTeam}/${game.homeTeam} under ${gameTotal.gameTotal}`
      }
    );
  }

  return options;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function defaultWeek(leagueId: string, seasonId: string, weekId: string): Week {
  return {
    leagueId,
    seasonId,
    weekId,
    label: `Week ${weekId}`,
    cutoffAt: defaultWeeklyCutoffUtc(new Date()),
    scrapeAt: defaultWeeklyScrapeUtc(new Date()),
    scrapeStatus: "pending",
    status: "open",
    nflPickCountRequired: 3,
    ncaafPickCountRequired: 3
  };
}

function mergeLegacyPickProposals(proposals: LineProposal[], picks: PlayerPick[]): LineProposal[] {
  const merged = new Map<string, LineProposal>();
  for (const proposal of proposals) {
    merged.set(proposal.proposalId, proposal);
  }
  for (const pick of picks) {
    const proposalId = proposalIdFor(pick.userId, pick.optionId);
    if (merged.has(proposalId)) {
      continue;
    }
    merged.set(proposalId, {
      leagueId: pick.leagueId,
      seasonId: pick.seasonId,
      weekId: pick.weekId,
      proposalId,
      optionId: pick.optionId,
      gameId: pick.gameId,
      proposerId: pick.userId,
      proposerLabel: shortUserId(pick.userId),
      proposalSource: "member",
      sportLeague: pick.sportLeague,
      team: pick.team,
      market: pick.market,
      side: pick.side,
      lineValue: pick.lineValue,
      label: `${pick.team} ${pick.market === "spread" ? formatSigned(pick.lineValue) : `${pick.side} ${pick.lineValue}`}`,
      submittedAt: pick.submittedAt,
      result: pick.result
    });
  }
  return [...merged.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function hydrateProposalLabels(proposals: LineProposal[], members: LeagueMember[]): LineProposal[] {
  const labels = new Map(members.map((member) => [member.userId, member.email ?? shortUserId(member.userId)]));
  return proposals.map((proposal) => ({
    ...proposal,
    proposerLabel: labels.get(proposal.proposerId) ?? proposal.proposerLabel ?? shortUserId(proposal.proposerId)
  }));
}

function proposalIdFor(userId: string, optionId: string): string {
  return `${userId}::${optionId}`;
}

function adminBoardProposalIdFor(optionId: string): string {
  return `league-board::${optionId}`;
}

function adminBoardProposerId(): string {
  return "__league_board__";
}

function normalizePickMode(pickMode: AppLeague["pickMode"]): NonNullable<AppLeague["pickMode"]> {
  return pickMode === "admin_selected" ? "admin_selected" : "member_proposed";
}

function normalizeAppLeague(league: AppLeague): AppLeague {
  return {
    ...league,
    pickMode: normalizePickMode(league.pickMode)
  };
}

function shortUserId(userId: string): string {
  return userId.length <= 12 ? userId : `${userId.slice(0, 8)}...`;
}

async function releaseLegacyPick(repository: PickemRepository, leagueId: string, seasonId: string, weekId: string, userId: string, optionId: string): Promise<void> {
  try {
    await repository.releasePick(leagueId, seasonId, weekId, userId, optionId);
  } catch (error) {
    if (error instanceof Error && error.name === "TransactionCanceledException") {
      return;
    }
    throw error;
  }
}

async function leaguesForUser(repository: PickemRepository, auth: AuthState): Promise<AppLeague[]> {
  const allLeagues = await repository.listAppLeagues();
  if (auth.isSuperAdmin) {
    return allLeagues;
  }
  const memberships = await repository.listMembersForUser(auth.userId);
  const memberLeagueIds = new Set(memberships.map((member) => member.leagueId));
  return allLeagues.filter((league) => memberLeagueIds.has(league.leagueId));
}

async function requireLeagueAccess(repository: PickemRepository, auth: AuthState, leagueId: string): Promise<void> {
  if (auth.isSuperAdmin) {
    return;
  }
  const member = await repository.getLeagueMember(leagueId, auth.userId);
  if (!member) {
    throw new Error("Unauthorized.");
  }
}

async function requireLeagueAdmin(repository: PickemRepository, auth: AuthState, leagueId: string): Promise<void> {
  if (auth.isSuperAdmin) {
    return;
  }
  const member = await repository.getLeagueMember(leagueId, auth.userId);
  if (member?.role !== "league_admin") {
    throw new Error("Unauthorized.");
  }
}

function requireSuperAdmin(auth: AuthState): void {
  if (!auth.isSuperAdmin) {
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

async function isCognitoSuperAdmin(email?: string): Promise<boolean> {
  if (!email) {
    return false;
  }
  const normalizedEmail = email.toLowerCase();
  if (superAdminEmails.has(normalizedEmail)) {
    return true;
  }
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    return false;
  }
  try {
    const result = await cognito.send(new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: email
    }));
    return (result.Groups ?? []).some((group) => group.GroupName === "super_admin");
  } catch (error) {
    if (error instanceof Error && error.name === "UserNotFoundException") {
      return false;
    }
    throw error;
  }
}

async function deleteCognitoUserIfPresent(email: string): Promise<boolean> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    return false;
  }
  try {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: email
    }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "UserNotFoundException") {
      return false;
    }
    throw error;
  }
}

function parseBody(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
  if (event.body && event.body.length > 65_536) {
    throw new SafeApiError("Request body is too large.", 413);
  }
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
    isSuperAdmin: isEmailSuperAdmin || groups.includes("super_admin")
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
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "https://master.d3j7zlwjnm04rp.amplifyapp.com,https://master.d3v9lgp3ju9tca.amplifyapp.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] ?? "https://master.d3j7zlwjnm04rp.amplifyapp.com";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "league";
}

class SafeApiError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}
