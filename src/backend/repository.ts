import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Game, OpeningLine, PlayerPick, ScrapeRun, Standing, Week } from "./types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export class PickemRepository {
  constructor(private readonly tableName = process.env.TABLE_NAME ?? "") {
    if (!this.tableName) {
      throw new Error("TABLE_NAME is required.");
    }
  }

  async getWeek(seasonId: string, weekId: string): Promise<Week | undefined> {
    const result = await client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: `WEEK#${seasonId}#${weekId}`, sk: "META" }
    }));
    return result.Item as Week | undefined;
  }

  async putWeek(week: Week): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: `WEEK#${week.seasonId}#${week.weekId}`,
        sk: "META",
        entityType: "Week",
        ...week
      }
    }));
  }

  async listGames(seasonId: string, weekId: string): Promise<Game[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `WEEK#${seasonId}#${weekId}`,
        ":prefix": "GAME#"
      }
    }));
    return (result.Items ?? []) as Game[];
  }

  async listVisibleGames(seasonId: string, weekId: string): Promise<Game[]> {
    const games = await this.listGames(seasonId, weekId);
    return games.filter((game) => game.isVisible);
  }

  async putGame(game: Game): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: `WEEK#${game.seasonId}#${game.weekId}`,
        sk: `GAME#${game.gameId}`,
        entityType: "Game",
        ...game
      }
    }));
  }

  async updateGameAdminFields(game: Game): Promise<void> {
    await this.putGame(game);
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

  async putPick(pick: PlayerPick): Promise<void> {
    await client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        pk: `PICK#${pick.seasonId}#${pick.weekId}`,
        sk: `USER#${pick.userId}#GAME#${pick.gameId}`,
        entityType: "PlayerPick",
        ...pick
      }
    }));
  }

  async listPicks(seasonId: string, weekId: string): Promise<PlayerPick[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `PICK#${seasonId}#${weekId}`
      }
    }));
    return (result.Items ?? []) as PlayerPick[];
  }

  async getUserPick(seasonId: string, weekId: string, userId: string, gameId: string): Promise<PlayerPick | undefined> {
    const result = await client.send(new GetCommand({
      TableName: this.tableName,
      Key: {
        pk: `PICK#${seasonId}#${weekId}`,
        sk: `USER#${userId}#GAME#${gameId}`
      }
    }));
    return result.Item as PlayerPick | undefined;
  }

  async listStandings(seasonId: string): Promise<Standing[]> {
    const result = await client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": `STANDINGS#${seasonId}`
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
