# Launch Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/{owner}/{repo}/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/{owner}/{repo}/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, finds the
ones that record no token, and ranks them by what their launch would be worth — then hands a
reader a dashboard with the board, a detail view for every protocol, and the steps to farm it.

## How the value is worked out

No protocol name is ever special-cased. The one number that differs by protocol kind is
calibrated from the snapshot itself: for each category, the median market-cap-to-TVL ratio of
that category's token-trading protocols, shrunk toward the global median and clamped to
[0.05, 1.50]. Then:

```
implied = max(1, round(TVL × multiple(category)
                      × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)
                      × (0.6 + min(age_days, 1095) / 1095 × 0.4)
                      × (1 + 0.02 × min(chains − 1, 5))))
```

The board covers the snapshot's whole 40-protocol watchlist and adds 160 early pre-token
protocols below the $50M floor, by TVL — 200 rows, each with a six-step farm plan stating what
it costs and how long it takes. Live-token protocols are set aside in their own view, shown at
the market's own value, never mixed into the ranking.

Implied values are this entry's own claim from the snapshot's figures. They do not predict
whether or when a protocol issues a token, and a protocol that records no token may still have
one its DefiLlama record does not carry.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `out/board.json`,
`out/data.js`, copies `dashboard/` and `screenshots/` into `out/`, and writes
`out/dossier.json` with the vendored `vendor/makefun-board.ts`. Open `out/dashboard/index.html`
in a browser — it renders with no network. Run it twice and the outputs are byte-identical.

## Layout

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out
- `lib/model.ts` — the model: calibration, scoring, farm plans, board build
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored from the kit
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a protocol's detail view, and a filtered view

---

Entered on [make.fun](https://make.fun/?ref=djennzgy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
