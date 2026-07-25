const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const tableName = process.env.TABLE_NAME ?? "pickem-bot-v1-run2-table";
const sourceLeagueId = process.env.BACKFILL_SOURCE_LEAGUE_ID ?? "friends";
const seasonId = process.env.SEED_SEASON_ID ?? new Date().getFullYear().toString();
const weekId = process.env.SEED_WEEK_ID ?? "1";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function main() {
  const games = await query(`LEAGUE#${sourceLeagueId}#WEEK#${seasonId}#${weekId}`, "GAME#");
  let count = 0;
  for (const game of games) {
    await put(`SOURCE#WEEK#${seasonId}#${weekId}`, game.sk, {
      ...game,
      pk: undefined,
      sk: undefined,
      entityType: "SharedGame",
      leagueId: "shared"
    });
    count += 1;
  }
  console.log(`Backfilled ${count} shared games from ${sourceLeagueId} ${seasonId} week ${weekId}.`);
}

async function query(pk, skPrefix) {
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "pk = :pk and begins_with(sk, :prefix)",
    ExpressionAttributeValues: {
      ":pk": pk,
      ":prefix": skPrefix
    }
  }));
  return result.Items ?? [];
}

async function put(pk, sk, item) {
  const cleanItem = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: { pk, sk, ...cleanItem }
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
