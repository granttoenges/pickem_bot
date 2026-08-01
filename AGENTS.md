# AGENTS.md

## Project Overview

Pickem Bot is a private, invite-only NFL/NCAAF pickem app. It supports multiple app leagues, league-scoped admins, member-proposed lines, admin-selected board lines, with/against responses, DraftKings opening odds, league standings, and season-scoped CFP team assignments with picked/current futures odds.

The deployed app is serverless AWS:

- Next.js frontend hosted by Amplify.
- Cognito invite-only auth.
- API Gateway HTTP API with Lambda backend.
- DynamoDB single-table storage.
- EventBridge scheduler for DraftKings scrape checks.
- EventBridge results sync for free public scoreboard final scores and standings.
- CDK TypeScript infrastructure.

Do not add The Odds API or any paid odds provider.

## Active Deployment

- AWS account: `390844781259`
- Region: `us-east-1`
- CDK stack: `PickemBotV1Run2Stack`
- DynamoDB table: `pickem-bot-v1-run2-table`
- API URL: `https://79a2jlbjgc.execute-api.us-east-1.amazonaws.com`
- Amplify URL: `https://master.d16nzdj1k2k1wu.amplifyapp.com`
- GitHub repo/branch: `granttoenges/pickem_bot` / `master`
- GitHub PAT secret: `pickem-bot-v1-run2-github-pat`

Only update active run2 resources unless the user explicitly says otherwise. Do not touch unrelated AWS resources.

## Important Deployment Notes

- Amplify is enabled by default in CDK:
  - `process.env.ENABLE_AMPLIFY !== "false"`
  - Plain `npm run cdk:deploy` should keep Amplify in the template.
  - Use `ENABLE_AMPLIFY=false` only when intentionally excluding Amplify.
- Do not pass `GITHUB_PAT` on the command line.
- The CDK stack references the named Secrets Manager secret instead of using a CloudFormation PAT parameter.
- CDK must not create or manage real Cognito users. Use `npm run bootstrap:super-admin` for super admin creation/recovery.
- `/login` supports Cognito forgot-password verification codes for verified emails. Keep routine recovery self-service; use the temporary-password resend flow only for expired or interrupted initial invites.
- `npm run build` may need elevated local port permissions in restricted Codex sandboxes because Next/Turbopack binds a helper port.

## Project Structure

- `src/app/`: Next.js app routes.
  - `page.tsx`: player board.
  - `admin/page.tsx`: admin console.
  - `login/page.tsx`: Cognito login, invite-time password setup, and email-code password reset.
  - `standings/page.tsx`: standings view.
  - `cfp/page.tsx`: CFP tracker, assignment board, and authorized admin controls.
- `src/components/`: shared UI components.
  - `GameOddsBoard.tsx`: sportsbook-style game cards.
  - `TeamLogo.tsx`: mapped team logos with initials fallback.
  - `AppShell.tsx`: top-level navigation shell.
- `src/lib/`: browser-side API/auth/config helpers.
- `src/backend/`: Lambda handlers and domain logic.
  - `api.ts`: HTTP API routing and authorization.
  - `repository.ts`: DynamoDB access.
  - `types.ts`: backend domain types.
  - `pickRules.ts`, `grading.ts`, `time.ts`, `weekSettingsRules.ts`: pure business rules.
  - `draftkingsScraper.ts`: scraper Lambda.
  - `cfpOddsScraper.ts`: daily/manual DraftKings CFP make-the-playoff futures scraper.
  - `scrapeScheduler.ts`: EventBridge-driven scraper scheduler.
- `resultsHandler.ts`: results sync placeholder/handler.
  - Results sync uses free public scoreboard data, updates final scores, grades proposals/responses, and writes standings.
- `infra/`: CDK app and stack.
- `scripts/`: seed and backfill scripts.
- `scraper/`: legacy/local Python scraper assets.
- `tests/`: Vitest tests for pure rules, scraper parsing, grading, and validation.
- `docs/`: product and deployment documentation.

## Core Data Concepts

- App league: a group such as friends/family.
- Sport league: `NFL` or `NCAAF`.
- Week: league-scoped settings including quotas, cutoff, scrape time, and scrape status.
- Shared game: scraped source game available to every app league.
- Opening line: immutable market odds keyed by game and market.
- Proposal: a member-proposed or admin-selected line.
- Proposal response: a member's `with` or `against` response to a proposal.
- League member: league-scoped role of `league_admin` or `player`.
- CFP assignment: a unique league-season team owner with immutable picked odds and separately updated current odds.

## Backend Rules To Preserve

- Opening lines are immutable. Do not overwrite them on later scrapes.
- Shared scraped games/odds are available to all app leagues.
- Picks/proposals/responses/standings are league-scoped.
- Cutoff time blocks proposal and response creation/edit/delete.
- Member-proposed quotas are separate for NFL and NCAAF.
- Admin-selected mode ignores member proposal quotas.
- Super admin can manage every league.
- League admins can manage only their assigned league.
- Removing a member deletes league-specific history.
- CFP tracking is enabled per league-season; disabling it preserves assignments.
- A CFP team can be assigned once per league-season, while a member can own multiple teams.
- Failed or empty CFP scrapes must preserve the last successful odds. Assignment picked odds are immutable; only current odds change.
- Authorized CFP odds submissions use alternating non-empty team-name and American-odds lines, must validate completely before storage, and use the same unavailable-team and immutable-picked-odds rules as a successful scrape.
- If a removed user has no remaining league memberships, their Cognito user is deleted so future invite is fresh.

## Frontend Rules To Preserve

- The board has tabs: `Available Games`, `My Picks`, `League Picks`.
- The board has sport filter buttons: `All`, `NFL`, `NCAA`.
- Game cards should remain full-width and readable on mobile without horizontal scrolling.
- Moneyline odds may be stored but should not appear as a pickable market unless explicitly requested.
- Login tokens are stored in `sessionStorage`, not `localStorage`.
- The `/cfp` board must remain readable on mobile; all members may view enabled data, but only league/super admins may mutate it.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run cdk:synth
npm run cdk:deploy
npm run bootstrap:super-admin
npm run seed:dummy
npm run seed:standings
npm run s3:lifecycle:app-logs
```

Bootstrap:

```bash
npm run cdk:bootstrap:v1
```

## Verification Expectations

Before deploying code changes, run:

```bash
npm run typecheck
npm test
npm run build
```

For infrastructure or backend Lambda changes, also run:

```bash
npm run cdk:synth
```

Before every commit and push:

- Check whether the change affects setup, deployment, architecture, product behavior, data model, or agent workflow.
- If it does, update `README.md`, `docs/APP_BLUEPRINT.md`, and/or `AGENTS.md` in the same commit.
- Do not leave documentation updates for a later follow-up when the code change is already being published.

After push to `master`, confirm Amplify build, deploy, and verify succeed.

## Documentation

Keep these files current when product or infrastructure behavior changes:

- `README.md`
- `docs/APP_BLUEPRINT.md`
- `AGENTS.md`

## Safety Notes

- This repo may have a dirty worktree; do not revert unrelated user changes.
- Use `rg` for search.
- Use `apply_patch` for file edits.
- Do not print secrets.
- Do not add `AWS::Cognito::UserPoolUser` or `AWS::Cognito::UserPoolUserToGroupAttachment` resources to CDK.
- Do not apply S3 lifecycle rules to unrelated buckets. The lifecycle script must only touch buckets named or tagged for `pickem-bot-v1-run2` and used for logs/CloudTrail-style logs.
- Do not run destructive AWS or git commands unless the user explicitly asks and the scope is clear.
- Keep AWS changes scoped to `PickemBotV1Run2Stack`.
