# Pickem Bot

Private football pickem app for NFL and college football spreads and moneylines.

The v1 architecture is a low-cost serverless AWS app:

- Next.js frontend
- Cognito invite-only auth
- API Gateway HTTP API
- Lambda backend
- DynamoDB storage
- EventBridge scheduled DraftKings scraper
- Amplify Hosting

See [docs/APP_BLUEPRINT.md](docs/APP_BLUEPRINT.md) for the full application and AWS deployment blueprint.

## Local Setup

```bash
npm install
npm run dev
```

Run tests:

```bash
npm test
```

Run the DraftKings scraper locally:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install "scrapling[fetchers]"
npm run scraper:local
```

## AWS

```bash
npm run cdk:synth
npm run cdk:deploy
```

Configure secrets and URLs before production deployment. The app intentionally does not include The Odds API or any paid odds provider integration.
