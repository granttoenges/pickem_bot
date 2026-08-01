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

### CFP Team Tracker

- League and super admins enable CFP tracking independently for each league-season.
- Each member may receive multiple teams, while a team may be assigned only once in a league-season.
- Assignments preserve the DraftKings make-the-playoff American odds at assignment time and also display the latest successfully scraped price.
- All league members can view enabled assignments on `/cfp`; only authorized admins can enable, refresh, paste and submit a current alternating team/odds list, assign, or remove.
- A daily 12:00 UTC scrape updates shared current odds. Manual refreshes are asynchronous. Empty or failed scrapes preserve the last successful data.

### Weekly Flow

1. Admin sets league mode, proposal limits, DraftKings capture time, and pick cutoff.
2. EventBridge runs a scrape scheduler every 15 minutes.
3. The scheduler finds pending weeks whose `scrapeAt` time has passed and invokes the DraftKings scraper.
4. Shared weekly games and immutable opening odds are stored for all leagues.
5. Members propose lines or admins select board lines, depending on league mode.
6. Member-proposed lines automatically record the proposer as `With`; other league members respond `With` or `Against` before `cutoffAt`.
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
- Member proposal owners also get an automatic stored `With` response for their own proposed line.
- `With` responses inherit the proposal result.
- `Against` responses invert win/loss and preserve pushes.
- Game total grading uses combined final score.

## Frontend

Routes:

- `/login`: Cognito login, invite-time new-password challenge, and self-service email-code password reset.
- `/`: player board with `Available Games`, `My Picks`, and `League Picks`.
- `/admin`: league settings, invites, members, board-line selection, scraper status, proposed lines, and submitted responses.
- `/standings`: league-scoped standings.
- `/cfp`: season-scoped CFP assignments, current odds, and authorized admin controls.

UI notes:

- Player board has a league switcher and sport filter: `All`, `NFL`, `NCAA`.
- Game cards use a full-width sportsbook-style layout with team logos.
- Dark mode follows system preference by default and can be set to `System`, `Light`, or `Dark` from the header; the preference is stored in browser `localStorage`.
- Login stores Cognito tokens in `sessionStorage`, not `localStorage`.
- New-password setup shows the current password policy before submit.
- Forgot-password requests use Cognito directly, disclose no account-existence state, and never store reset emails, codes, or passwords in browser storage or application data.
- Reset confirmation supports resend, code-expiration guidance, password confirmation, and the deployed password policy. Recovery codes use verified email only.

## Backend/API

Core endpoints:

- `GET /health`
- `GET /leagues`
- `POST /admin/leagues`
- `PUT /admin/leagues/{leagueId}/settings`
- `PUT /admin/leagues/{leagueId}/members`
- `DELETE /admin/leagues/{leagueId}/members`
- `POST /admin/invites`
- `GET /weeks?leagueId=...&seasonId=...`
- `GET /week?leagueId=...&seasonId=...&weekId=...`
- `GET /admin/week?leagueId=...&seasonId=...&weekId=...`
- `PUT /admin/week/settings`
- `PUT /admin/results`
- `PUT /admin/board-lines`
- `DELETE /admin/board-lines`
- `PUT /proposals`
- `DELETE /proposals`
- `PUT /proposal-responses`
- `DELETE /proposal-responses`
- `GET /standings`
- `GET /cfp/seasons`
- `GET /cfp`
- `GET /admin/cfp`
- `PUT /admin/cfp/settings`
- `PUT /admin/cfp/assignments`
- `DELETE /admin/cfp/assignments`
- `POST /admin/cfp/refresh`
- `PUT /admin/cfp/odds` (validated alternating team-name and American-odds lines)

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
- Removal deletes league-specific membership, picks, claims, proposals, proposal responses, standings, and CFP assignments.
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
- `LEAGUE#{leagueId}#CFP` / `SEASON#{seasonId}`: CFP opt-in configuration.
- `SOURCE#CFP#{seasonId}` / `TEAM#{teamKey}`: latest shared DraftKings CFP qualification price.
- `CFP_ASSIGN#{leagueId}#{seasonId}` / `TEAM#{teamKey}`: unique league-season assignment and immutable picked price.
- `CFP_SCRAPE#{seasonId}` / `RUN#{runId}`: CFP scrape status and errors.

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

The dedicated CFP scraper targets only affirmative make-the-playoff futures, supports direct team outcomes and nested `Yes` selections, updates current prices, and never clears stored odds when DraftKings returns an empty or invalid market. Authorized admins may instead paste and submit a complete alternating team-name and American-odds list for a selected season. Blank lines are ignored. The API validates every pair and normalized team key before writing; a successful submission uses the same replacement semantics and scrape-run history as an automated refresh.

## Results Sync

- Results sync uses a free public scoreboard JSON source for NFL and NCAAF final scores.
- It matches scores to stored games by sport, teams, and kickoff date where available.
- It updates final game scores, grades proposals from immutable opening lines, grades with/against responses, and writes league standings.
- Admins can manually correct final scores through `PUT /admin/results`; corrected scores are used by later grading.

## AWS Deployment

Active deployment:

- Account: `390844781259`
- Region: `us-east-1`
- Stack: `PickemBotV1Run2Stack`
- API: `https://79a2jlbjgc.execute-api.us-east-1.amazonaws.com`
- Amplify: `https://master.d16nzdj1k2k1wu.amplifyapp.com`

AWS services:

- Amplify Hosting for frontend.
- Cognito user pool and groups. Human Cognito users are bootstrapped with CLI/script commands, not managed by CDK/CloudFormation.
- API Gateway HTTP API.
- Lambda API, weekly odds scraper/scheduler, CFP futures scraper, and results handlers.
- DynamoDB on-demand table with point-in-time recovery, deletion protection, and retain policy.
- EventBridge schedules.
- Secrets Manager secret `pickem-bot-v1-run2-github-pat`.
- CloudWatch log groups with 14-day retention.
- Minimal CloudWatch alarms for Lambda errors and one SNS email topic.

Cost controls:

- No RDS, EC2, NAT Gateway, or always-on containers.
- DynamoDB uses pay-per-request capacity.
- Scraper is invoked only when due weeks are pending.
- API Gateway throttling is configured.
- DynamoDB GSIs, paid score APIs, WAF, and new CloudTrail trails are intentionally deferred.
- App-owned S3 log/CloudTrail-style buckets can be configured with 15-day expiration using the guarded lifecycle script.

Deployment commands:

```bash
npm run cdk:synth
npm run cdk:deploy
npm run bootstrap:super-admin
npm run s3:lifecycle:app-logs
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
npm run seed:standings
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
- CFP market parsing, alternate outcome shapes, duplicate normalization, and safe empty-market failure.

Manual verification:

- `/login` works and new-password feedback is clear.
- `/` shows league switcher, sport filter, game board, proposals, and responses.
- `/admin` can invite/remove members, change settings, and select admin board lines.
- `/standings` loads for the selected league.
- `/cfp` shows enabled assignments and restricts management controls to league/super admins.
- API `/health` returns `{"ok":true}`.

## Assumptions

- “League” means an app group like friends/family; football category is `sportLeague`.
- DraftKings public pages are the sole odds source.
- The app is for private entertainment only and does not include real-money wagering or payments.
- Team logos are mapped for seeded teams with fallback initials for unknown teams.
- Existing run2 AWS resources are the active deployment target.
