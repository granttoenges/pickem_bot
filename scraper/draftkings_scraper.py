import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


DEFAULT_URLS = {
    "NFL": "https://sportsbook.draftkings.com/leagues/football/nfl",
    "NCAAF": "https://sportsbook.draftkings.com/leagues/football/ncaaf",
}


@dataclass
class Game:
    gameId: str
    seasonId: str
    weekId: str
    league: str
    awayTeam: str
    homeTeam: str
    kickoffAt: str
    status: str = "scheduled"


@dataclass
class OpeningLine:
    gameId: str
    market: str
    source: str
    capturedAt: str
    homeSpread: float | None = None
    awaySpread: float | None = None
    homeMoneyline: int | None = None
    awayMoneyline: int | None = None
    originalPayload: dict[str, Any] | None = None


def main() -> None:
    output = scrape()
    persist_if_configured(output)
    print(json.dumps(output))


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    os.environ["SEASON_ID"] = event.get("seasonId", os.getenv("SEASON_ID", ""))
    os.environ["WEEK_ID"] = event.get("weekId", os.getenv("WEEK_ID", ""))
    output = scrape()
    persist_if_configured(output)
    return output


def scrape() -> dict[str, Any]:
    season_id = os.getenv("SEASON_ID", str(datetime.now(timezone.utc).year))
    week_id = os.getenv("WEEK_ID", "current")
    captured_at = datetime.now(timezone.utc).isoformat()
    source_urls = load_source_urls()

    games: list[Game] = []
    lines: list[OpeningLine] = []
    errors: list[str] = []

    for league, url in source_urls.items():
        try:
            html = fetch_page(url)
            parsed_games, parsed_lines = parse_draftkings_page(
                html=html,
                league=league,
                season_id=season_id,
                week_id=week_id,
                captured_at=captured_at,
                source_url=url,
            )
            games.extend(parsed_games)
            lines.extend(parsed_lines)
        except Exception as exc:  # noqa: BLE001 - scraper should preserve partial successes.
            errors.append(f"{league}: {exc}")

    return {
        "games": [asdict(game) for game in games],
        "lines": [asdict(line) for line in lines],
        "errors": errors,
        "sourceUrl": ",".join(source_urls.values()),
        "capturedAt": captured_at,
        "seasonId": season_id,
        "weekId": week_id,
    }


def persist_if_configured(output: dict[str, Any]) -> None:
    table_name = os.getenv("TABLE_NAME")
    if not table_name:
        return

    import boto3
    from botocore.exceptions import ClientError

    table = boto3.resource("dynamodb").Table(table_name)
    season_id = output["seasonId"]
    week_id = output["weekId"]

    for game in output["games"]:
        table.put_item(Item={
            "pk": f"WEEK#{season_id}#{week_id}",
            "sk": f"GAME#{game['gameId']}",
            "entityType": "Game",
            **game,
        })

    skipped = 0
    for line in output["lines"]:
        try:
            table.put_item(
                Item={
                    "pk": f"GAME#{line['gameId']}",
                    "sk": f"OPENING_LINE#{line['market']}",
                    "entityType": "OpeningLine",
                    **line,
                },
                ConditionExpression="attribute_not_exists(pk)",
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
            skipped += 1

    status = "success" if not output["errors"] else "partial" if output["games"] else "failed"
    errors = list(output["errors"])
    if skipped:
        errors.append(f"{skipped} opening lines already existed and were not overwritten.")

    table.put_item(Item={
        "pk": f"SCRAPE#{season_id}#{week_id}",
        "sk": f"RUN#{output['capturedAt']}",
        "entityType": "ScrapeRun",
        "seasonId": season_id,
        "weekId": week_id,
        "runId": output["capturedAt"],
        "sourceUrl": output["sourceUrl"],
        "capturedAt": output["capturedAt"],
        "status": status,
        "parsedGameCount": len(output["games"]),
        "errors": errors,
    })


def load_source_urls() -> dict[str, str]:
    raw = os.getenv("DRAFTKINGS_SOURCE_URLS")
    if not raw:
        return DEFAULT_URLS
    loaded = json.loads(raw)
    return {str(key): str(value) for key, value in loaded.items()}


def fetch_page(url: str) -> str:
    try:
        from scrapling.fetchers import Fetcher
    except ImportError as exc:
        raise RuntimeError("Install scraper dependencies with: pip install 'scrapling[fetchers]'") from exc

    page = Fetcher.get(url, stealthy_headers=True, timeout=60)
    return str(page.html)


def parse_draftkings_page(
    html: str,
    league: str,
    season_id: str,
    week_id: str,
    captured_at: str,
    source_url: str,
) -> tuple[list[Game], list[OpeningLine]]:
    embedded = extract_next_data(html)
    if embedded:
        return parse_embedded_json(embedded, league, season_id, week_id, captured_at, source_url)

    raise RuntimeError("Could not find parseable DraftKings event data. Use saved HTML to update selectors.")


def extract_next_data(html: str) -> dict[str, Any] | None:
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        return None
    return json.loads(match.group(1))


def parse_embedded_json(
    payload: dict[str, Any],
    league: str,
    season_id: str,
    week_id: str,
    captured_at: str,
    source_url: str,
) -> tuple[list[Game], list[OpeningLine]]:
    events = find_event_like_nodes(payload)
    games: list[Game] = []
    lines: list[OpeningLine] = []

    for index, event in enumerate(events):
        home = first_string(event, ["homeTeam", "home_team", "homeName", "home"])
        away = first_string(event, ["awayTeam", "away_team", "awayName", "away"])
        kickoff = first_string(event, ["startDate", "startTime", "commenceTime", "eventStartDate"])

        if not home or not away or not kickoff:
            continue

        game_id = stable_game_id(league, kickoff, away, home)
        game = Game(
            gameId=game_id,
            seasonId=season_id,
            weekId=week_id,
            league=league,
            awayTeam=away,
            homeTeam=home,
            kickoffAt=kickoff,
        )
        games.append(game)

        spread = first_number(event, ["homeSpread", "spread", "line"])
        home_ml = first_int(event, ["homeMoneyline", "homeMl", "moneylineHome"])
        away_ml = first_int(event, ["awayMoneyline", "awayMl", "moneylineAway"])

        if spread is not None:
            lines.append(OpeningLine(
                gameId=game_id,
                market="spread",
                source="draftkings",
                capturedAt=captured_at,
                homeSpread=spread,
                awaySpread=-spread,
                originalPayload={"sourceUrl": source_url, "eventIndex": index},
            ))

        if home_ml is not None or away_ml is not None:
            lines.append(OpeningLine(
                gameId=game_id,
                market="moneyline",
                source="draftkings",
                capturedAt=captured_at,
                homeMoneyline=home_ml,
                awayMoneyline=away_ml,
                originalPayload={"sourceUrl": source_url, "eventIndex": index},
            ))

    return games, lines


def find_event_like_nodes(node: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []

    if isinstance(node, dict):
        keys = set(node.keys())
        has_team_keys = bool(keys & {"homeTeam", "home_team", "homeName", "home"}) and bool(
            keys & {"awayTeam", "away_team", "awayName", "away"}
        )
        if has_team_keys:
            found.append(node)
        for value in node.values():
            found.extend(find_event_like_nodes(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(find_event_like_nodes(item))

    return found


def first_string(node: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = node.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def first_number(node: dict[str, Any], keys: list[str]) -> float | None:
    for key in keys:
        value = node.get(key)
        if isinstance(value, int | float):
            return float(value)
        if isinstance(value, str):
            parsed = parse_signed_number(value)
            if parsed is not None:
                return parsed
    return None


def first_int(node: dict[str, Any], keys: list[str]) -> int | None:
    value = first_number(node, keys)
    return int(value) if value is not None else None


def parse_signed_number(value: str) -> float | None:
    match = re.search(r"[-+]?\d+(?:\.\d+)?", value.replace("−", "-"))
    return float(match.group(0)) if match else None


def stable_game_id(league: str, kickoff: str, away: str, home: str) -> str:
    raw = f"{league}-{kickoff}-{away}-{home}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")


if __name__ == "__main__":
    main()
