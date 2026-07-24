# Pickem Bot App + AWS DraftKings Scraper Blueprint

## Summary

Pickem Bot is a private, invite-only NFL and college football pickem application. Users can belong to one or more app leagues, review the available weekly games, and claim exact spread or team-total over/under options. Once an exact option is claimed in a league, it is unavailable to other members of that league. The app uses Tuesday morning DraftKings opening-line values captured once per week. Picks for the week lock every Friday at 10:00 AM America/Chicago.

The app is designed to run locally during development and deploy cheaply on AWS using serverless services with near-zero idle cost.

No The Odds API integration or paid odds provider is part of v1.

## Product Scope

### Roles

- Super admin: create app leagues, assign league admins, invite users, and manage all league settings.
- League admin: invite users, manage weekly pick quotas, review scraped games, correct lines, review submitted picks, correct results, and trigger grading for their league.
- Player: log in, view weekly games and opening lines, claim or edit available pick options before cutoff, and view league standings.

### Weekly Flow

1. Tuesday morning: scheduled DraftKings scraper captures NFL and NCAAF opening spreads.
2. Admin reviews imported games and fixes missing or malformed lines; team totals can be seeded or entered manually until DraftKings team-total parsing is added.
3. Players claim exact spread or team-total options until Friday 10:00 AM America/Chicago.
4. After games finish, results sync imports final scores and grades picks against the stored opening lines.
5. Standings update for the week and season.

## Technical Architecture

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Auth: Amazon Cognito user pool with invite-only users and `super_admin`, `admin`, and `player` groups.
- API: API Gateway HTTP API with Lambda handlers.
- Storage: DynamoDB single-table design using on-demand billing.
- Odds automation: Scrapling-based DraftKings scraper.
- Scheduling: EventBridge Scheduler for Tuesday scraper and separate result sync.
- Hosting: AWS Amplify Hosting for the frontend.
- Infrastructure: AWS CDK in TypeScript.

## Data Model

Use a single DynamoDB table with composite keys:

- `APP_LEAGUE` / `LEAGUE#{leagueId}`: app league metadata.
- `LEAGUE#{leagueId}` / `MEMBER#{userId}`: league membership and league-scoped role.
- `LEAGUE#{leagueId}#WEEK#{seasonId}#{weekId}` / `META`: week metadata, cutoff timestamp, and NFL/NCAAF quotas.
- `LEAGUE#{leagueId}#WEEK#{seasonId}#{weekId}` / `GAME#{gameId}`: imported or manually added game.
- `GAME#{gameId}` / `OPENING_LINE#{market}`: immutable Tuesday opening line.
- `USER#{userId}` / `PROFILE`: user profile and display name.
- `OPTIONS#{leagueId}#{seasonId}#{weekId}` / `OPTION#{optionId}`: claimable spread or team-total pick option.
- `CLAIM#{leagueId}#{seasonId}#{weekId}` / `OPTION#{optionId}`: exact-option claim used for uniqueness.
- `PICK#{leagueId}#{seasonId}#{weekId}` / `USER#{userId}#OPTION#{optionId}`: player pick.
- `STANDINGS#{leagueId}#{seasonId}` / `USER#{userId}`: league season aggregate.
- `SCRAPE#{seasonId}#{weekId}` / `RUN#{timestamp}`: scrape metadata and errors.

Opening lines must be immutable after creation. Admin corrections create an audit field such as `source: "admin_override"` and preserve the original scraped payload when available.

## DraftKings Scraper

The scraper targets public DraftKings pages for NFL and NCAAF odds and extracts:

- League
- Game date/time
- Away team
- Home team
- Spread line and price
- Source URL
- Scrape timestamp

Rules:

- Run only Tuesday mornings during football season.
- Do not scrape closing lines or refresh odds later in the week.
- Do not overwrite existing opening-line records for the same week.
- Preserve partial successes if one league or page fails.
- Log source URL, status, parsed game count, and error details.
- Admin review is the fallback for missing games or broken parsing.

Scraping must respect applicable site terms, avoid private or authenticated pages, and use conservative request rates.

## Pick Lock

Each week has a cutoff timestamp. The default is Friday 10:00 AM America/Chicago.

Players cannot create, edit, or delete picks after cutoff. Admins can still view picks and correct games, lines, and results after cutoff.

## AWS Deployment Blueprint

1. Create or choose an AWS account and region.
2. Configure AWS Budgets with a low monthly alert threshold.
3. Install local prerequisites: Node.js, npm, AWS CLI, and AWS CDK.
4. Run `npm install`.
5. Bootstrap CDK: `npx cdk bootstrap`.
6. Deploy backend infrastructure: `npm run cdk:deploy`.
7. Add environment variables for frontend:
   - `NEXT_PUBLIC_API_BASE_URL`
   - `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
   - `NEXT_PUBLIC_COGNITO_CLIENT_ID`
   - `NEXT_PUBLIC_AWS_REGION`
8. Connect the repo to AWS Amplify Hosting and deploy the Next.js app.
9. Store configurable scrape URLs, timezone, and season settings in SSM Parameter Store or environment variables.
10. Monitor CloudWatch logs and alarms for API failures, scraper failures, and unusual traffic.

Cost controls:

- Use DynamoDB on-demand for low traffic.
- Use API Gateway HTTP API instead of REST API.
- Use Lambda and scheduled jobs instead of always-on servers.
- Avoid NAT Gateway, RDS, EC2, and always-on containers in v1.
- Disable schedules outside football season.

## Local Development

```bash
npm install
npm run dev
npm test
```

Scraper local setup:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install "scrapling[fetchers]"
python scraper/draftkings_scraper.py
```

## Test Plan

- Tuesday scraper creates opening lines once for a week.
- Re-running scraper for the same week does not overwrite opening lines.
- DraftKings NFL and NCAAF spreads normalize into consistent game records.
- Exact pick options cannot be claimed by two users in the same league.
- A user can release or replace an option before cutoff.
- Players can submit and edit weekly picks before Friday 10:00 AM America/Chicago.
- Players cannot create, edit, or delete weekly picks after Friday 10:00 AM America/Chicago.
- Results grading uses stored opening lines, not later odds.
- Weekly and season standings aggregate wins/losses/pushes correctly.
- Unauthorized users cannot access admin routes.

## Assumptions

- DraftKings public pages are the sole odds source for v1.
- Tuesday morning opening lines are the official league lines.
- Friday 10:00 AM America/Chicago is the default weekly pick cutoff.
- Scraper failures are handled by admin review/manual correction.
- The app is for a small private friend group and does not include real-money wagering, payments, or public betting features.
