import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Game, OpeningLine, PlayerPick, ScrapeRun, Week } from "./types";

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
