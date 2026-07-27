import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import type {
  AppLeague,
  Game,
  LeagueMember,
  LineProposal,
  OpeningLine,
  PickClaim,
  PickOption,
  PlayerPick,
  ProposalResponse,
  ScrapeRun,
  Standing,
  Week
} from "./types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export class PickemRepository {
  constructor(private readonly tableName = process.env.TABLE_NAME ?? "") {
    if (!this.tableName) {
      throw new Error("TABLE_NAME is required.");
    }
  }

  async listAppLeagues(): Promise<AppLeague[]> {
    const result = await client.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: "entityType = :entityType",
      ExpressionAttributeValues: { ":entityType": "AppLeague" }
    }));
    return (result.Items ?? []) as AppLeague[];
  }

  async putAppLeague(league: AppLeague): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: "APP_LEAGUE",
        sk: `LEAGUE#${league.leagueId}`,
        entityType: "AppLeague",
        ...league
      },
      ConditionExpression: "attribute_not_exists(pk)"
    }));
  }

  async getAppLeague(leagueId: string): Promise<AppLeague | undefined> {
    const result = await client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: "APP_LEAGUE", sk: `LEAGUE#${leagueId}` }
    }));
    return result.Item as AppLeague | undefined;
  }

  async updateAppLeaguePickMode(leagueId: string, pickMode: NonNullable<AppLeague["pickMode"]>): Promise<AppLeague> {
    const result = await client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: "APP_LEAGUE", sk: `LEAGUE#${leagueId}` },
      UpdateExpression: "set pickMode = :pickMode",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: {
        ":pickMode": pickMode
      },
      ReturnValues: "ALL_NEW"
    }));
    return result.Attributes as AppLeague;
  }

  async listMembersForUser(userId: string): Promise<LeagueMember[]> {
    const result = await client.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: "entityType = :entityType and userId = :userId",
      ExpressionAttributeValues: {
        ":entityType": "LeagueMember",
        ":userId": userId
      }
    }));
    return (result.Items ?? []) as LeagueMember[];
  }

  async listLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `LEAGUE#${leagueId}`,
        ":prefix": "MEMBER#"
      }
    }));
    return (result.Items ?? []) as LeagueMember[];
  }

  async getLeagueMember(leagueId: string, userId: string): Promise<LeagueMember | undefined> {
    const result = await client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: `LEAGUE#${leagueId}`, sk: `MEMBER#${userId}` }
    }));
    return result.Item as LeagueMember | undefined;
  }

  async putLeagueMember(member: LeagueMember): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: `LEAGUE#${member.leagueId}`,
        sk: `MEMBER#${member.userId}`,
        entityType: "LeagueMember",
        ...member
      }
    }));
  }

  async deleteLeagueMember(leagueId: string, userId: string): Promise<void> {
    await client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { pk: `LEAGUE#${leagueId}`, sk: `MEMBER#${userId}` }
    }));
  }

  async removeUserFromLeague(leagueId: string, userId: string): Promise<void> {
    const items: Array<Record<string, unknown> & { pk?: string; sk?: string; entityType?: string }> = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "leagueId = :leagueId",
        ExpressionAttributeValues: {
          ":leagueId": leagueId
        },
        ExclusiveStartKey: exclusiveStartKey
      }));
      items.push(...((result.Items ?? []) as Array<Record<string, unknown> & { pk?: string; sk?: string; entityType?: string }>));
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    const removedProposalIds = new Set(
      items
        .filter((item) => item.entityType === "LineProposal" && item.proposerId === userId)
        .map((item) => String(item.proposalId))
    );
    const keysToDelete = new Map<string, { pk: string; sk: string }>();

    for (const item of items) {
      if (!item.pk || !item.sk) {
        continue;
      }
      const shouldDelete =
        (item.entityType === "LeagueMember" && item.userId === userId) ||
        (item.entityType === "PlayerPick" && item.userId === userId) ||
        (item.entityType === "PickClaim" && item.userId === userId) ||
        (item.entityType === "LineProposal" && item.proposerId === userId) ||
        (item.entityType === "ProposalResponse" && (item.responderId === userId || removedProposalIds.has(String(item.proposalId)))) ||
        (item.entityType === "Standing" && item.userId === userId);

      if (shouldDelete) {
        keysToDelete.set(`${item.pk}\u0000${item.sk}`, { pk: item.pk, sk: item.sk });
      }
    }

    keysToDelete.set(`LEAGUE#${leagueId}\u0000MEMBER#${userId}`, {
      pk: `LEAGUE#${leagueId}`,
      sk: `MEMBER#${userId}`
    });

    for (const key of keysToDelete.values()) {
      await client.send(new DeleteCommand({
        TableName: this.tableName,
        Key: key
      }));
    }
  }

  async getWeek(leagueId: string, seasonId: string, weekId: string): Promise<Week | undefined> {
    const result = await client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: weekPk(leagueId, seasonId, weekId), sk: "META" }
    }));
    return result.Item as Week | undefined;
  }

  async putWeek(week: Week): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: weekPk(week.leagueId, week.seasonId, week.weekId),
        sk: "META",
        entityType: "Week",
        ...week
      }
    }));
  }

  async listDueScrapeWeeks(nowIso: string): Promise<Week[]> {
    const result = await client.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: "entityType = :entityType and scrapeAt <= :now and (attribute_not_exists(scrapeStatus) or scrapeStatus = :pending)",
      ExpressionAttributeValues: {
        ":entityType": "Week",
        ":now": nowIso,
        ":pending": "pending"
      }
    }));
    return (result.Items ?? []) as Week[];
  }

  async updateWeekScrapeStatus(week: Week, scrapeStatus: NonNullable<Week["scrapeStatus"]>, scrapeCompletedAt?: string): Promise<void> {
    await this.putWeek({
      ...week,
      scrapeStatus,
      scrapeCompletedAt
    });
  }

  async listGames(leagueId: string, seasonId: string, weekId: string): Promise<Game[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": weekPk(leagueId, seasonId, weekId),
        ":prefix": "GAME#"
      }
    }));
    return ((result.Items ?? []) as Game[]).map(normalizeGame);
  }

  async listSharedGames(leagueId: string, seasonId: string, weekId: string): Promise<Game[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": sourceWeekPk(seasonId, weekId),
        ":prefix": "GAME#"
      }
    }));
    return ((result.Items ?? []) as Game[]).map((game) => normalizeGame({ ...game, leagueId }));
  }

  async listWeekGames(leagueId: string, seasonId: string, weekId: string): Promise<Game[]> {
    const [sharedGames, leagueGames] = await Promise.all([
      this.listSharedGames(leagueId, seasonId, weekId),
      this.listGames(leagueId, seasonId, weekId)
    ]);
    const merged = new Map<string, Game>();
    for (const game of sharedGames) {
      merged.set(game.gameId, game);
    }
    for (const game of leagueGames) {
      merged.set(game.gameId, game);
    }
    return [...merged.values()].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  }

  async putGame(game: Game): Promise<void> {
    const normalized = normalizeGame(game);
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: weekPk(normalized.leagueId, normalized.seasonId, normalized.weekId),
        sk: `GAME#${normalized.gameId}`,
        entityType: "Game",
        ...normalized
      }
    }));
  }

  async putSharedGame(game: Game): Promise<void> {
    const normalized = normalizeGame(game);
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: sourceWeekPk(normalized.seasonId, normalized.weekId),
        sk: `GAME#${normalized.gameId}`,
        entityType: "SharedGame",
        ...normalized,
        leagueId: "shared"
      }
    }));
  }

  async listOpeningLines(gameId: string): Promise<OpeningLine[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `GAME#${gameId}`,
        ":prefix": "OPENING_LINE#"
      }
    }));
    return (result.Items ?? []) as OpeningLine[];
  }

  async createOpeningLine(line: OpeningLine): Promise<boolean> {
    try {
      await client.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `GAME#${line.gameId}`,
          sk: `OPENING_LINE#${line.market}`,
          entityType: "OpeningLine",
          ...line
        },
        ConditionExpression: "attribute_not_exists(pk)"
      }));
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        return false;
      }
      throw error;
    }
  }

  async putPickOption(option: PickOption): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: optionsPk(option.leagueId, option.seasonId, option.weekId),
        sk: `OPTION#${option.optionId}`,
        entityType: "PickOption",
        ...option
      }
    }));
  }

  async listPickOptions(leagueId: string, seasonId: string, weekId: string): Promise<PickOption[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": optionsPk(leagueId, seasonId, weekId),
        ":prefix": "OPTION#"
      }
    }));
    return (result.Items ?? []) as PickOption[];
  }

  async listClaims(leagueId: string, seasonId: string, weekId: string): Promise<PickClaim[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": claimsPk(leagueId, seasonId, weekId)
      }
    }));
    return (result.Items ?? []) as PickClaim[];
  }

  async listPicks(leagueId: string, seasonId: string, weekId: string): Promise<PlayerPick[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": picksPk(leagueId, seasonId, weekId)
      }
    }));
    return (result.Items ?? []) as PlayerPick[];
  }

  async listUserPicks(leagueId: string, seasonId: string, weekId: string, userId: string): Promise<PlayerPick[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": picksPk(leagueId, seasonId, weekId),
        ":prefix": `USER#${userId}#`
      }
    }));
    return (result.Items ?? []) as PlayerPick[];
  }

  async listProposals(leagueId: string, seasonId: string, weekId: string): Promise<LineProposal[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": proposalsPk(leagueId, seasonId, weekId)
      }
    }));
    return (result.Items ?? []) as LineProposal[];
  }

  async listUserProposals(leagueId: string, seasonId: string, weekId: string, proposerId: string): Promise<LineProposal[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": proposalsPk(leagueId, seasonId, weekId),
        ":prefix": `PROPOSER#${proposerId}#`
      }
    }));
    return (result.Items ?? []) as LineProposal[];
  }

  async putProposal(proposal: LineProposal, previousProposalId?: string): Promise<void> {
    const transactItems = [];

    if (previousProposalId && previousProposalId !== proposal.proposalId) {
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: proposalsPk(proposal.leagueId, proposal.seasonId, proposal.weekId), sk: proposalSk(proposal.proposerId, previousProposalId) }
        }
      });
    }

    transactItems.push({
      Put: {
        TableName: this.tableName,
        Item: {
          pk: proposalsPk(proposal.leagueId, proposal.seasonId, proposal.weekId),
          sk: proposalSk(proposal.proposerId, proposal.proposalId),
          entityType: "LineProposal",
          ...proposal
        }
      }
    });

    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
  }

  async deleteProposal(leagueId: string, seasonId: string, weekId: string, proposerId: string, proposalId: string): Promise<void> {
    await client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { pk: proposalsPk(leagueId, seasonId, weekId), sk: proposalSk(proposerId, proposalId) }
    }));
  }

  async listProposalResponses(leagueId: string, seasonId: string, weekId: string): Promise<ProposalResponse[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": proposalResponsesPk(leagueId, seasonId, weekId)
      }
    }));
    return (result.Items ?? []) as ProposalResponse[];
  }

  async putProposalResponse(response: ProposalResponse): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: proposalResponsesPk(response.leagueId, response.seasonId, response.weekId),
        sk: responseSk(response.proposalId, response.responderId),
        entityType: "ProposalResponse",
        ...response
      }
    }));
  }

  async deleteProposalResponse(leagueId: string, seasonId: string, weekId: string, proposalId: string, responderId: string): Promise<void> {
    await client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { pk: proposalResponsesPk(leagueId, seasonId, weekId), sk: responseSk(proposalId, responderId) }
    }));
  }

  async claimPick(pick: PlayerPick, previousOptionId?: string): Promise<void> {
    const claimedAt = pick.claimedAt;
    const transactItems = [];

    if (previousOptionId && previousOptionId !== pick.optionId) {
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: claimsPk(pick.leagueId, pick.seasonId, pick.weekId), sk: `OPTION#${previousOptionId}` },
          ConditionExpression: "userId = :userId",
          ExpressionAttributeValues: { ":userId": pick.userId }
        }
      });
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: picksPk(pick.leagueId, pick.seasonId, pick.weekId), sk: `USER#${pick.userId}#OPTION#${previousOptionId}` }
        }
      });
    }

    transactItems.push({
      Put: {
        TableName: this.tableName,
        Item: {
          pk: claimsPk(pick.leagueId, pick.seasonId, pick.weekId),
          sk: `OPTION#${pick.optionId}`,
          entityType: "PickClaim",
          leagueId: pick.leagueId,
          seasonId: pick.seasonId,
          weekId: pick.weekId,
          optionId: pick.optionId,
          userId: pick.userId,
          claimedAt
        },
        ConditionExpression: "attribute_not_exists(pk) or userId = :userId",
        ExpressionAttributeValues: { ":userId": pick.userId }
      }
    });
    transactItems.push({
      Put: {
        TableName: this.tableName,
        Item: {
          pk: picksPk(pick.leagueId, pick.seasonId, pick.weekId),
          sk: `USER#${pick.userId}#OPTION#${pick.optionId}`,
          entityType: "PlayerPick",
          ...pick
        }
      }
    });

    try {
      await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (error) {
      if (error instanceof Error && error.name === "TransactionCanceledException") {
        throw new Error("That option has already been claimed.");
      }
      throw error;
    }
  }

  async releasePick(leagueId: string, seasonId: string, weekId: string, userId: string, optionId: string): Promise<void> {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: this.tableName,
            Key: { pk: claimsPk(leagueId, seasonId, weekId), sk: `OPTION#${optionId}` },
            ConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": userId }
          }
        },
        {
          Delete: {
            TableName: this.tableName,
            Key: { pk: picksPk(leagueId, seasonId, weekId), sk: `USER#${userId}#OPTION#${optionId}` }
          }
        }
      ]
    }));
  }

  async listStandings(leagueId: string, seasonId: string): Promise<Standing[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `STANDINGS#${leagueId}#${seasonId}`
      }
    }));
    return (result.Items ?? []) as Standing[];
  }

  async listScrapeRuns(seasonId: string, weekId: string): Promise<ScrapeRun[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `SCRAPE#${seasonId}#${weekId}`
      }
    }));
    return ((result.Items ?? []) as ScrapeRun[]).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  async listAllProfiles(): Promise<Array<{ userId: string; displayName: string }>> {
    const result = await client.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: "entityType = :entityType",
      ExpressionAttributeValues: {
        ":entityType": "UserProfile"
      }
    }));
    return (result.Items ?? []) as Array<{ userId: string; displayName: string }>;
  }

  async putScrapeRun(run: ScrapeRun): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: `SCRAPE#${run.seasonId}#${run.weekId}`,
        sk: `RUN#${run.runId}`,
        entityType: "ScrapeRun",
        ...run
      }
    }));
  }
}

function normalizeGame(game: Game): Game {
  const sportLeague = game.sportLeague ?? game.league;
  if (!sportLeague) {
    throw new Error("Game is missing sportLeague.");
  }
  return { ...game, sportLeague };
}

function weekPk(leagueId: string, seasonId: string, weekId: string): string {
  return `LEAGUE#${leagueId}#WEEK#${seasonId}#${weekId}`;
}

function sourceWeekPk(seasonId: string, weekId: string): string {
  return `SOURCE#WEEK#${seasonId}#${weekId}`;
}

function optionsPk(leagueId: string, seasonId: string, weekId: string): string {
  return `OPTIONS#${leagueId}#${seasonId}#${weekId}`;
}

function claimsPk(leagueId: string, seasonId: string, weekId: string): string {
  return `CLAIM#${leagueId}#${seasonId}#${weekId}`;
}

function picksPk(leagueId: string, seasonId: string, weekId: string): string {
  return `PICK#${leagueId}#${seasonId}#${weekId}`;
}

function proposalsPk(leagueId: string, seasonId: string, weekId: string): string {
  return `PROPOSAL#${leagueId}#${seasonId}#${weekId}`;
}

function proposalResponsesPk(leagueId: string, seasonId: string, weekId: string): string {
  return `PROPOSAL_RESPONSE#${leagueId}#${seasonId}#${weekId}`;
}

function proposalSk(proposerId: string, proposalId: string): string {
  return `PROPOSER#${proposerId}#PROPOSAL#${proposalId}`;
}

function responseSk(proposalId: string, responderId: string): string {
  return `PROPOSAL#${proposalId}#RESPONDER#${responderId}`;
}
