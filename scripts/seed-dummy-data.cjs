const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { AdminAddUserToGroupCommand, AdminGetUserCommand, CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");

const tableName = process.env.TABLE_NAME ?? "pickem-bot-v1-run2-table";
const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "us-east-1_eYgApGW0A";
const adminEmail = process.env.FIRST_ADMIN_EMAIL ?? "grantoenges@gmail.com";
const leagueId = process.env.SEED_LEAGUE_ID ?? "friends";
const seasonId = process.env.SEED_SEASON_ID ?? new Date().getFullYear().toString();
const weekId = process.env.SEED_WEEK_ID ?? "1";
const now = new Date().toISOString();

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const nflGames = [
  ["Packers", "Bears", -1.5, 22.5, 21.5, 44.0],
  ["Chiefs", "Broncos", -4.5, 26.5, 19.5, 46.0],
  ["Cowboys", "Eagles", 3.5, 20.5, 24.5, 45.0],
  ["Bills", "Jets", -6.5, 25.5, 18.5, 44.0],
  ["Ravens", "Steelers", -2.5, 23.5, 20.5, 44.0],
  ["49ers", "Seahawks", -3.5, 24.5, 21.5, 46.0]
];

const ncaafGames = [
  ["Ohio State", "Michigan", -2.5, 28.5, 25.5, 54.0],
  ["Georgia", "Alabama", 1.5, 24.5, 26.5, 51.0],
  ["Texas", "Oklahoma", -4.5, 30.5, 24.5, 55.0],
  ["Notre Dame", "USC", -3.5, 27.5, 23.5, 51.0],
  ["LSU", "Florida", -6.5, 31.5, 22.5, 54.0],
  ["Penn State", "Oregon", 2.5, 24.5, 27.5, 52.0]
];

async function main() {
  const adminUser = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: adminEmail }));
  const adminUserId = adminUser.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value ?? adminEmail;
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: adminEmail, GroupName: "super_admin" }));
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: adminEmail, GroupName: "admin" }));

  await put("APP_LEAGUE", `LEAGUE#${leagueId}`, {
    entityType: "AppLeague",
    leagueId,
    name: "Friends Pickem",
    createdBy: adminUserId,
    createdAt: now,
    status: "active",
    pickMode: "member_proposed"
  });

  await put(`LEAGUE#${leagueId}`, `MEMBER#${adminUserId}`, {
    entityType: "LeagueMember",
    leagueId,
    userId: adminUserId,
    email: adminEmail,
    role: "league_admin",
    createdAt: now
  });

  await put(`LEAGUE#${leagueId}#WEEK#${seasonId}#${weekId}`, "META", {
    entityType: "Week",
    leagueId,
    seasonId,
    weekId,
    label: `Week ${weekId}`,
    scrapeAt: `${seasonId}-09-08T15:00:00.000Z`,
    scrapeStatus: "pending",
    cutoffAt: `${seasonId}-09-11T15:00:00.000Z`,
    status: "open",
    nflPickCountRequired: 3,
    ncaafPickCountRequired: 3
  });

  await seedGames("NFL", nflGames, "2026-09-13T18:00:00.000Z");
  await seedGames("NCAAF", ncaafGames, "2026-09-12T18:00:00.000Z");

  console.log(`Seeded ${leagueId} ${seasonId} week ${weekId} in ${tableName}.`);
}

async function seedGames(sportLeague, rows, kickoffAt) {
  for (const [index, [awayTeam, homeTeam, homeSpread, awayTotal, homeTotal, gameTotal]] of rows.entries()) {
    const gameId = `${sportLeague.toLowerCase()}-${index + 1}-${awayTeam}-${homeTeam}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const game = {
      leagueId,
      gameId,
      seasonId,
      weekId,
      sportLeague,
      awayTeam,
      homeTeam,
      kickoffAt: new Date(new Date(kickoffAt).getTime() + index * 3_600_000).toISOString(),
      status: "scheduled",
      overrideSource: "admin_override"
    };
    await put(`SOURCE#WEEK#${seasonId}#${weekId}`, `GAME#${gameId}`, { entityType: "SharedGame", ...game, leagueId: "shared" });

    await put(`GAME#${gameId}`, "OPENING_LINE#spread", {
      entityType: "OpeningLine",
      gameId,
      market: "spread",
      source: "seed",
      capturedAt: now,
      homeSpread,
      awaySpread: -homeSpread
    });
    await put(`GAME#${gameId}`, "OPENING_LINE#team_total", {
      entityType: "OpeningLine",
      gameId,
      market: "team_total",
      source: "seed",
      capturedAt: now,
      awayTeamTotal: awayTotal,
      homeTeamTotal: homeTotal
    });
    await put(`GAME#${gameId}`, "OPENING_LINE#game_total", {
      entityType: "OpeningLine",
      gameId,
      market: "game_total",
      source: "seed",
      capturedAt: now,
      gameTotal
    });

    for (const option of buildOptions(game, -homeSpread, homeSpread, awayTotal, homeTotal, gameTotal)) {
      await put(`OPTIONS#${leagueId}#${seasonId}#${weekId}`, `OPTION#${option.optionId}`, { entityType: "PickOption", ...option });
    }
  }
}

function buildOptions(game, awaySpread, homeSpread, awayTotal, homeTotal, gameTotal) {
  const base = {
    leagueId,
    seasonId,
    weekId,
    gameId: game.gameId,
    sportLeague: game.sportLeague
  };
  return [
    { ...base, optionId: `${game.gameId}-away-spread`, team: game.awayTeam, market: "spread", side: "away", lineValue: awaySpread, label: `${game.awayTeam} ${formatSigned(awaySpread)}` },
    { ...base, optionId: `${game.gameId}-home-spread`, team: game.homeTeam, market: "spread", side: "home", lineValue: homeSpread, label: `${game.homeTeam} ${formatSigned(homeSpread)}` },
    { ...base, optionId: `${game.gameId}-away-total-over`, team: game.awayTeam, market: "team_total", side: "over", lineValue: awayTotal, label: `${game.awayTeam} over ${awayTotal}` },
    { ...base, optionId: `${game.gameId}-away-total-under`, team: game.awayTeam, market: "team_total", side: "under", lineValue: awayTotal, label: `${game.awayTeam} under ${awayTotal}` },
    { ...base, optionId: `${game.gameId}-home-total-over`, team: game.homeTeam, market: "team_total", side: "over", lineValue: homeTotal, label: `${game.homeTeam} over ${homeTotal}` },
    { ...base, optionId: `${game.gameId}-home-total-under`, team: game.homeTeam, market: "team_total", side: "under", lineValue: homeTotal, label: `${game.homeTeam} under ${homeTotal}` },
    { ...base, optionId: `${game.gameId}-game-total-over`, team: `${game.awayTeam}/${game.homeTeam}`, market: "game_total", side: "over", lineValue: gameTotal, label: `${game.awayTeam}/${game.homeTeam} over ${gameTotal}` },
    { ...base, optionId: `${game.gameId}-game-total-under`, team: `${game.awayTeam}/${game.homeTeam}`, market: "game_total", side: "under", lineValue: gameTotal, label: `${game.awayTeam}/${game.homeTeam} under ${gameTotal}` }
  ];
}

async function put(pk, sk, item) {
  await dynamo.send(new PutCommand({
    TableName: tableName,
    Item: { pk, sk, ...item }
  }));
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
