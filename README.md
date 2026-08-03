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
  - proposing a line automatically records the proposer as `With` that line.
  - other members respond `With` or `Against`.
- Admin-selected mode:
  - league admins select exact board lines.
  - players respond `With` or `Against`.
- Admin portal for league settings, invites, members, board-line selection, scraper status, and member removal. Re-inviting an unactivated user sends a fresh temporary password and restarts the three-day activation window.
- Invite-only users can reset forgotten permanent passwords from `/login` with a Cognito email verification code.
- Member removal deletes league-specific history and resets the Cognito user only when that user has no other league memberships.
- DraftKings scraper stores shared weekly games and opening odds for all leagues.
- Opening lines are immutable; later line movement does not overwrite the first stored line.
- Optional season-scoped CFP tracker lets league/super admins assign unique teams to members from DraftKings make-the-playoff futures. Members compare the immutable assigned price with the latest daily price on `/cfp`.
- Results sync uses a free public scoreboard source to update final scores, grade proposed lines/responses, and write standings.
- Critical Lambda failures publish to the app SNS alarm topic; app Lambda logs retain for 14 days.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Auth: Amazon Cognito.
- API: API Gateway HTTP API and Node.js Lambda.
- Storage: DynamoDB single-table design.
- Hosting: AWS Amplify Hosting connected to GitHub `granttoenges/pickem_bot` `master`.
- Infrastructure: AWS CDK in TypeScript.
- Scheduling: EventBridge runs the weekly scrape scheduler every 15 minutes and refreshes CFP futures daily at 12:00 UTC.
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
npm run cdk:synth
```

`npm run build` uses Next/Turbopack. In restricted sandbox environments it may need elevated local port permissions, but it works normally in a regular terminal and in Amplify.

## Environment

Local `.env` is intentionally ignored by git. Current expected local keys:

```bash
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

## Super Admin Recovery

Do not manage real human Cognito users through CDK/CloudFormation. CDK creates the user pool and groups only. If the super admin account needs to be created or repaired, use the bootstrap script or Cognito CLI directly.

Create or verify the default super admin:

```bash
npm run bootstrap:super-admin
```

Use a different super admin email:

```bash
SUPER_ADMIN_EMAIL=owner@example.com npm run bootstrap:super-admin
```

If the account already exists but needs a new temporary-password email:

```bash
npm run bootstrap:super-admin -- --reset-temp
```

Create the super admin user and send the temporary-password email:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_eYgApGW0A \
  --username grantoenges@gmail.com \
  --user-attributes Name=email,Value=grantoenges@gmail.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region us-east-1
```

Add the user to the `super_admin` group:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_eYgApGW0A \
  --username grantoenges@gmail.com \
  --group-name super_admin \
  --region us-east-1
```

Users who forget a permanent password should select **Forgot password?** on `/login`. Cognito sends a one-hour verification code to the account's verified email, and the app accepts that code with a policy-compliant new password. Request messaging does not reveal whether an account exists.

Use the temporary-password recovery below only for an expired or interrupted initial invite, not for routine forgotten-password recovery:

```bash
pw="Temp-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#%^+=' | head -c 20)aA1!"

aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_eYgApGW0A \
  --username grantoenges@gmail.com \
  --password "$pw" \
  --no-permanent \
  --region us-east-1

aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_eYgApGW0A \
  --username grantoenges@gmail.com \
  --user-attributes Name=email,Value=grantoenges@gmail.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --message-action RESEND \
  --region us-east-1
```

## Data And Seeding

Seed dummy data:

```bash
npm run seed:dummy
```

Seed standings-only test data:

```bash
npm run seed:standings
```

Backfill shared game records:

```bash
node scripts/backfill-shared-games.cjs
```

Apply the 15-day lifecycle rule to app-owned S3 log/CloudTrail-style buckets only:

```bash
npm run s3:lifecycle:app-logs
```

DraftKings odds are stored as shared source data by season/week/sport so every app league can use the same game board while keeping picks and membership separate.

CFP make-the-playoff odds are stored separately as shared season data. League admins enable the tracker per league-season, may trigger an asynchronous refresh, or paste an alternating team/odds list such as `Notre Dame`, `−800`, `Texas A&M`, `+154` on separate lines. Blank lines are ignored. Submissions are fully validated before storage; omitted teams become unavailable, existing picked odds never change, and each successful submission is recorded as an odds update run. Failed, empty, or invalid updates retain the last successful team list.

Final scores are fetched by the results sync from ESPN's public scoreboard JSON endpoints for NFL and college football. Admins can manually correct final scores in the admin console; standings are generated from stored opening lines and proposal responses.

## Documentation

- [Application Blueprint](docs/APP_BLUEPRINT.md)
- [Agent Guide](AGENTS.md)

This app intentionally does not use The Odds API or any paid odds provider.
