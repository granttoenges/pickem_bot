# Pickem Bot

Private football pickem app for NFL and college football leagues. Members propose lines from weekly games, respond with or against other members' lines, and track standings by league.

The app is built to run locally and deploy cheaply on AWS with serverless services.

## Current Features

- Invite-only Cognito login.
- Global `super_admin` and league-scoped `league_admin` / `player` roles.
- Multiple app leagues, each with independent members, settings, picks, responses, and standings.
- Player board with `Available Games`, `My Picks`, and `League Picks` tabs.
- Sport filter for `All`, `NFL`, and `NCAA`.
- Site-wide dark mode that follows system preference by default and can be overridden from the header.
- Member-proposed mode:
  - admins set weekly NFL and NCAAF proposal limits separately.
  - members propose spread, team total, or game total lines.
  - other members respond `With` or `Against`.
- Admin-selected mode:
  - league admins select exact board lines.
  - players respond `With` or `Against`.
- Admin portal for league settings, invites, members, board-line selection, scraper status, and member removal.
- Member removal deletes league-specific history and resets the Cognito user only when that user has no other league memberships.
- DraftKings scraper stores shared weekly games and opening odds for all leagues.
- Opening lines are immutable; later line movement does not overwrite the first stored line.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Auth: Amazon Cognito.
- API: API Gateway HTTP API and Node.js Lambda.
- Storage: DynamoDB single-table design.
- Hosting: AWS Amplify Hosting connected to GitHub `granttoenges/pickem_bot` `master`.
- Infrastructure: AWS CDK in TypeScript.
- Scheduling: EventBridge rule that runs a low-cost scrape scheduler every 15 minutes.
- Tests: Vitest plus TypeScript checks.

## Local Setup

```bash
npm install
npm run dev
```

Common checks:

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` uses Next/Turbopack. In restricted sandbox environments it may need elevated local port permissions, but it works normally in a regular terminal and in Amplify.

## Environment

Local `.env` is intentionally ignored by git. Current expected local keys:

```bash
FIRST_ADMIN_EMAIL=grantoenges@gmail.com
GITHUB_PAT=...
ENABLE_AMPLIFY=true
```

Amplify is enabled by default in CDK unless explicitly disabled:

```bash
ENABLE_AMPLIFY=false npm run cdk:deploy
```

Do not pass the GitHub PAT on the command line. The stack references the named Secrets Manager secret `pickem-bot-v1-run2-github-pat`.

## AWS

Active stack:

- Account: `390844781259`
- Region: `us-east-1`
- Stack: `PickemBotV1Run2Stack`
- DynamoDB table: `pickem-bot-v1-run2-table`
- API base URL: `https://79a2jlbjgc.execute-api.us-east-1.amazonaws.com`
- Current Amplify URL: `https://master.d16nzdj1k2k1wu.amplifyapp.com`

Commands:

```bash
npm run cdk:synth
npm run cdk:deploy
```

Bootstrap command for the isolated CDK toolkit:

```bash
npm run cdk:bootstrap:v1
```

Only deploy `PickemBotV1Run2Stack`. Do not update unrelated AWS resources.

## Data And Seeding

Seed dummy data:

```bash
npm run seed:dummy
```

Backfill shared game records:

```bash
node scripts/backfill-shared-games.cjs
```

DraftKings odds are stored as shared source data by season/week/sport so every app league can use the same game board while keeping picks and membership separate.

## Documentation

- [Application Blueprint](docs/APP_BLUEPRINT.md)
- [Agent Guide](AGENTS.md)

This app intentionally does not use The Odds API or any paid odds provider.
