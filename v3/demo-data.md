# Demo data: "Paid search (demo)"

One Rule Set designed to walk every v3 feature end to end with numbers known in advance:
the hierarchy (Build parent step and chaining), definition-backed segments with platform
scoping, tracking URLs on both levels, and the two Check paths (CSV upload and the live
BigQuery scan) reporting the same pooled figure. Data in `scripts/demo/`, written by
`pnpm seed:ruleset`.

## What it contains

Definition `demo-game` "Game title" (all platforms): League of Legends `lol`, Valorant `val`,
Counter-Strike 2 `cs2`, Dota 2 `dota`, Rocket League `rl`. The other definitions it uses,
`demo-market` and the google-scoped `demo-match-type`, were seeded in phase 2.

Rule Set `demo-paid-search`, delimiter `_`, platform Google Ads on both Rules:

| Rule | Segments in order | Tracking URL |
|---|---|---|
| Google Campaigns (`campaign_name`) | game (Game title), market (Market), campaign_type (brand, gen, comp), theme (freeform, 24), quarter (optional q1 to q4) | source = platform tag, medium = `cpc`, campaign = this Rule's name |
| Google Ad Groups (`ad_group_name`), parent Google Campaigns inheriting game and market | match_type (Match type), audience (freeform, 20), device (optional mob, dsk) | as above, campaign = the campaign's name, content = this Rule's name, term = match_type |

Both mappings: base URL `https://www.example.com/esports`, editable in Build, lowercase policy.
That policy is why `demo-objective` (codes `AWA`, `CON`, `CNV`) is not used: the authoring
check refuses uppercase codes on any Rule whose name feeds a URL value.

Expected in Build, campaign `lol_uk_brand_summer-sale` chained to ad group
`lol_uk_brd_gamers_mob`:

```
https://www.example.com/esports?utm_source=google&utm_medium=cpc&utm_campaign=lol_uk_brand_summer-sale&utm_content=lol_uk_brd_gamers_mob&utm_term=brd
```

## The sample names

`scripts/demo/paid-search-names.csv`: columns `campaign_name` and `ad_group_name`, 12 rows,
every value distinct within its column (the scan runs `SELECT DISTINCT`). Rows 1 to 7 are valid
in both columns; rows 8 to 12 fail one violation type each: an unknown code, a missing required
segment (ad groups: one segment too many), an illegal character, a freeform over its length,
and an optional value in the wrong place, which lands a freeform value on the trailing enum.

| View | Result |
|---|---|
| Each Rule | 7 valid of 12 |
| All Rules, pooled | 14 of 24 |
| All Rules, strict per row | 7 of 12 rows |

`scripts/demo/paid-search.test.ts` (9 tests, part of `pnpm test:scripts`) proves all of this:
no authoring issues against the demo definitions, the compose and validate round trip on both
Rules, the two URLs, the counts, the row uniqueness and the exact violation on each bad name.

## Files

- `scripts/demo/definitions.ts`: the demo definition literals, moved out of
  `seed-definitions.ts` (which parses its arguments at import, so tests could not load it)
  and extended with Game title. `seed-definitions.ts` behaves as before; a rerun now adds only
  the new one.
- `scripts/demo/paid-search.ts`: the Rule Set literal and the expected counts.
- `scripts/demo/paid-search-names.csv`, `scripts/demo/paid-search.test.ts`.
- `scripts/seed-ruleset.ts` (`pnpm seed:ruleset --tenant <id> --as <admin email>
  [--dry-run]`): writes Game title if the tenant lacks it, runs `checkRuleSetIssues` against
  the tenant's live definitions and refuses on any issue, then writes the Rule Set unless its
  id exists. The dry run does every read and check and writes nothing.

## Loading BigQuery

The `bq` tool is not on this machine's PATH; it ships with the Cloud SDK under
`/Applications/NinjaRMMAgent/programfiles/google-cloud-sdk/bin/`. The default gcloud account
cannot see the project, so the owner account is set through `CLOUDSDK_CORE_ACCOUNT`:

```
CLOUDSDK_CORE_ACCOUNT=misterfela@gmail.com /Applications/NinjaRMMAgent/programfiles/google-cloud-sdk/bin/bq \
  --project_id=media-taxonomy-tool --location=asia-south1 \
  load --source_format=CSV --skip_leading_rows=1 --replace \
  marketing.paid_search_names scripts/demo/paid-search-names.csv \
  campaign_name:STRING,ad_group_name:STRING
```

`--replace` makes a rerun idempotent. The identifiers pass the Function's whitelist and
`marketing` is in the esports tenant's `allowedDatasets`.

## Verified

| Check | Result |
|---|---|
| `pnpm test:scripts` | 22 (13 transform, 9 new) |
| `pnpm typecheck` | Clean everywhere |
| `pnpm seed:ruleset --tenant esports --as misterfela@gmail.com --dry-run` | Would write Game title (5 values) and the Rule Set (2 Rules) |
| `bq ls marketing` as the owner | Lists `campaign_values`, so the load can run |

## Live run (2026-09-29, with approval)

- `pnpm seed:ruleset --tenant esports --as misterfela@gmail.com`: wrote "Game title"
  (`demo-game`, 5 values) and "Paid search (demo)" (`demo-paid-search`, 2 Rules) under
  `tenants/esports`.
- The `bq load` above created `marketing.paid_search_names`; a count query returned 12 rows,
  12 distinct campaign names and 12 distinct ad group names (`rows` is a reserved word in
  BigQuery SQL, so alias a count as `row_count`).
- Nothing in the web bundle changed, so no Hosting deploy was needed.

Still to walk through in the UI at https://media-taxonomy-tool.web.app: Dictionary shows Game
title; Author opens the Rule Set with no issues; Build a campaign, chain to an ad group, see the
URL above; Check the CSV upload and the live scan, both at 14 of 24 under All Rules.
