const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const tableName = process.env.TABLE_NAME ?? "pickem-bot-v1-run2-table";
const seasonId = process.env.SEED_SEASON_ID ?? new Date().getFullYear().toString();
const leagueIds = (process.env.SEED_LEAGUE_IDS ?? "friends,grant-s-boys")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const rows = [
  { userId: "dummy-01-maddie", displayName: "Maddie", wins: 18, losses: 9, pushes: 1 },
  { userId: "dummy-02-grant", displayName: "Grant", wins: 16, losses: 11, pushes: 1 },
  { userId: "dummy-03-ryan", displayName: "Ryan", wins: 14, losses: 13, pushes: 1 },
  { userId: "dummy-04-jake", displayName: "Jake", wins: 13, losses: 14, pushes: 1 },
  { userId: "dummy-05-sam", displayName: "Sam", wins: 11, losses: 16, pushes: 1 },
  { userId: "dummy-06-chris", displayName: "Chris", wins: 9, losses: 18, pushes: 1 }
];

async function main() {
  for (const leagueId of leagueIds) {
    for (const row of rows) {
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `STANDINGS#${leagueId}#${seasonId}`,
          sk: `USER#${row.userId}`,
          entityType: "Standing",
          leagueId,
          seasonId,
          ...row
        }
      }));
    }
  }

  console.log(`Seeded ${rows.length} standings rows for ${leagueIds.join(", ")} in season ${seasonId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
