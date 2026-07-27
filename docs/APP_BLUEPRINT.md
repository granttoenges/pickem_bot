# Pickem Bot App Blueprint

## Summary

Pickem Bot is a private, invite-only NFL and college football pickem app. Users belong to one or more app leagues. Each app league has its own admins, members, weekly settings, proposed lines, responses, and standings.

DraftKings public pages are the only odds source. The app stores opening odds once and keeps them immutable. No The Odds API or paid odds provider is used.

The app is deployed as a low-cost AWS serverless system with Amplify Hosting, Cognito, API Gateway HTTP API, Lambda, DynamoDB, and EventBridge.

## Product Model

### Roles

- `super_admin`: global operator. Can create leagues, manage all league members/admins, invite users, remove players/admins from leagues, and change any league settings.
- `league_admin`: league-scoped operator. Can invite players, remove players, manage league settings, and select board lines for their assigned league.
- `player`: league member. Can propose lines when the league uses member-proposed mode and respond `With` or `Against` to league picks.

`grantoenges@gmail.com` is treated as the initial super admin.

### League Modes

- `member_proposed`: every member can propose an admin-configured number of NFL lines and NCAAF lines each week.
- `admin_selected`: league admins select exact board lines; players respond `With` or `Against`; per-member proposal limits are not used.

League mode is configured per app league.

### Weekly Flow

1. Admin sets league mode, proposal limits, DraftKings capture time, and pick cutoff.
2. EventBridge runs a scrape scheduler every 15 minutes.
3. The scheduler finds pending weeks whose `scrapeAt` time has passed and invokes the DraftKings scraper.
4. Shared weekly games and immutable opening odds are stored for all leagues.
5. Members propose lines or admins select board lines, depending on league mode.
6. League members respond `With` or `Against` before `cutoffAt`.
7. Results sync grades proposals and responses against the stored opening line.
8. Standings aggregate wins, losses, and pushes by app league.

## Pick Markets

Pickable markets:

- Team spread.
- Team total over.
- Team total under.
- Game total over.
- Game total under.

Moneyline odds may be stored from DraftKings for future use, but moneyline is not currently shown as a pickable market.

Scoring:

- Proposal owner is graded on the selected side.
- `With` responses inherit the proposal result.
- `Against` responses invert win/loss and preserve pushes.
- Game total grading uses combined final score.

## Frontend

Routes:

- `/login`: Cognito login and new-password challenge.
- `/`: player board with `Available Games`, `My Picks`, and `League Picks`.
- `/admin`: league settings, invites, members, board-line selection, scraper status, proposed lines, and submitted responses.
- `/standings`: league-scoped standings.

UI notes:

- Player board has a league switcher and sport filter: `All`, `NFL`, `NCAA`.
- Game cards use a full-width sportsbook-style layout with team logos.
- Login stores Cognito tokens in `sessionStorage`, not `localStorage`.
- New-password setup shows the current password policy before submit.

## Backend/API

Core endpoints:

- `GET /health`
- `GET /leagues`
- `POST /admin/leagues`
- `PUT /admin/leagues/{leagueId}/settings`
- `PUT /admin/leagues/{leagueId}/members`
- `DELETE /admin/leagues/{leagueId}/members`
- `POST /admin/invites`
- `GET /week?leagueId=...&seasonId=...&weekId=...`
- `GET /admin/week?leagueId=...&seasonId=...&weekId=...`
- `PUT /admin/week/settings`
- `PUT /admin/board-lines`
- `DELETE /admin/board-lines`
- `PUT /proposals`
- `DELETE /proposals`
- `PUT /proposal-responses`
- `DELETE /proposal-responses`
- `GET /standings`

Authorization:

- API Gateway validates Cognito JWTs.
- `super_admin` can manage all leagues.
- `league_admin` can manage only assigned leagues.
- `player` can access only assigned leagues and their own actions.
- Legacy Cognito `admin` group is not a global authorization bypass.

Member removal:

- Super admins can remove players or league admins.
- League admins can remove players only.
- Self-removal and super-admin removal are blocked.
- Removal deletes league-specific membership, picks, claims, proposals, proposal responses, and standings.
- If the user has no other league memberships, their Cognito user is deleted so a later invite creates a fresh account.

## DynamoDB Model

Single table: `pickem-bot-v1-run2-table`

Important item families:

- `APP_LEAGUE` / `LEAGUE#{leagueId}`: app league metadata.
- `LEAGUE#{leagueId}` / `MEMBER#{userId}`: league membership and league-scoped role.
- `LEAGUE#{leagueId}#WEEK#{seasonId}#{weekId}` / `META`: weekly settings, cutoff, scrape status.
- `SOURCE#WEEK#{seasonId}#{weekId}` / `GAME#{gameId}`: shared scraped games available to all leagues.
- `LEAGUE#{leagueId}#WEEK#{seasonId}#{weekId}` / `GAME#{gameId}`: league-specific manual game overrides/additions.
- `GAME#{gameId}` / `OPENING_LINE#{market}`: immutable opening odds.
- `OPTIONS#{leagueId}#{seasonId}#{weekId}` / `OPTION#{optionId}`: optional persisted pick options.
- `PICK#{leagueId}#{seasonId}#{weekId}` / `USER#{userId}#OPTION#{optionId}`: legacy player picks.
- `CLAIM#{leagueId}#{seasonId}#{weekId}` / `OPTION#{optionId}`: legacy exact-option claims.
- `PROPOSAL#{leagueId}#{seasonId}#{weekId}` / `PROPOSER#{userId}#PROPOSAL#{proposalId}`: member/admin proposed lines.
- `PROPOSAL_RESPONSE#{leagueId}#{seasonId}#{weekId}` / `PROPOSAL#{proposalId}#RESPONDER#{userId}`: with/against responses.
- `STANDINGS#{leagueId}#{seasonId}` / `USER#{userId}`: standings rows.
- `SCRAPE#{seasonId}#{weekId}` / `RUN#{runId}`: scrape run metadata.

Opening lines are first-write-wins and must not be overwritten by later scrapes.

## DraftKings Scraper

The scraper stores normalized and raw-ish DraftKings odds where available:

- spread points and prices,
- team totals and over/under prices,
- game totals and over/under prices,
- moneyline prices,
- source URL,
- captured timestamp,
- DraftKings market identifiers when found,
- warnings/errors and parsed counts.

Scraper behavior:

- It writes shared source games and opening-line records.
- It preserves partial successes.
- It does not overwrite existing opening-line items.
- Admin review/manual correction remains the fallback for missing markets.

## AWS Deployment

Active deployment:

- Account: `390844781259`
- Region: `us-east-1`
- Stack: `PickemBotV1Run2Stack`
- API: `https://79a2jlbjgc.execute-api.us-east-1.amazonaws.com`
- Amplify: `https://master.d16nzdj1k2k1wu.amplifyapp.com`

AWS services:

- Amplify Hosting for frontend.
- Cognito user pool and groups.
- API Gateway HTTP API.
- Lambda API, scraper, scheduler, and results handlers.
- DynamoDB on-demand table with point-in-time recovery, deletion protection, and retain policy.
- EventBridge schedules.
- Secrets Manager secret `pickem-bot-v1-run2-github-pat`.
- CloudWatch log groups with retention.

Cost controls:

- No RDS, EC2, NAT Gateway, or always-on containers.
- DynamoDB uses pay-per-request capacity.
- Scraper is invoked only when due weeks are pending.
- API Gateway throttling is configured.

Deployment commands:

```bash
npm run cdk:synth
npm run cdk:deploy
```

Amplify is included by default. It is disabled only when `ENABLE_AMPLIFY=false`.

## Local Development

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Seed dummy data:

```bash
npm run seed:dummy
```

Run the legacy Python scraper locally:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scraper/requirements.txt
npm run scraper:local
```

## Test Plan

Automated checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run cdk:synth`

Covered behavior includes:

- weekly cutoff and scrape timing,
- proposal quotas by sport,
- response result inversion,
- game-total grading,
- pick option generation,
- password policy validation,
- quota input parsing,
- member-removal authorization.

Manual verification:

- `/login` works and new-password feedback is clear.
- `/` shows league switcher, sport filter, game board, proposals, and responses.
- `/admin` can invite/remove members, change settings, and select admin board lines.
- `/standings` loads for the selected league.
- API `/health` returns `{"ok":true}`.

## Assumptions

- “League” means an app group like friends/family; football category is `sportLeague`.
- DraftKings public pages are the sole odds source.
- The app is for private entertainment only and does not include real-money wagering or payments.
- Team logos are mapped for seeded teams with fallback initials for unknown teams.
- Existing run2 AWS resources are the active deployment target.
