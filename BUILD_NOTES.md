# Build notes — token-radar-01 entry for @azamxb

Built 2026-11-14/15 (WIB) by Baron (subagent session 4d5038d7) for Om's make.fun account
@azamxb. **Not submitted yet.** Deadline: 2026-12-14 10:00 UTC (17:00 WIB). Prize $1,325
USDC, escrowed; 1st $1,000, 2nd–5th $50, 6th–10th $25.

## What it is

A token launch radar over the sealed DefiLlama snapshot (758 protocols, watchlist 40,
`as_of` 2026-11-14, floor $50M). The board ranks 178 pre-token protocols by implied value:

- **Model `radar-2`** (`lib/model.ts`): implied = TVL × multiple(category) × growth ×
  maturity × breadth. The category multiple is calibrated from the snapshot itself — the
  median market-cap-to-TVL ratio of that category's token-trading protocols, shrunk toward
  the global median (0.2138, prior weight 8), clamped to [0.05, 1.50]. Growth clamps 7d
  change to [-60, +120]%, weight 0.5. Maturity 0.6 + min(age, 1095)/1095 × 0.4 (unknown age
  365d). Breadth +2% per extra chain, max 5. No protocol name is special-cased.
- **Board**: all 40 watchlist slugs + 138 rankable pre-token protocols below the floor
  (CEX / bridges / liquid-staking / wrapped / versioned names excluded, mirroring the
  house's watchlist rule). Top row: Steakhouse Financial, implied $1,245,274,551.
  Every row has a 6-step farm plan with cost and time, derived from category/chains/TVL/age.
- **Dashboard** (`dashboard/`, 24,603 bytes total, under the 64 KB dossier-text cap):
  sortable board, search/category/chain/min-TVL/watchlist filters, a detail view for every
  protocol (model breakdown with the arithmetic shown, farm plan), a Live-tokens view
  (24 protocols, market values, never mixed into the ranking), and a Model & method view
  (formula + the full multiples table). Static, no network, no framework.
- **Screenshots** (`screenshots/`, 1440×900 PNG): 1-board, 2-detail (rank 1), 3-filtered
  (Risk Curators, 33 rows). Taken with Playwright Chromium headless; the board shot is
  byte-deterministic across runs.

## Verification (all run locally, 2026-11-14 ~19:36 UTC)

- `node scripts/verify.mjs` — **all 9 checks pass**: dashboard_files, board_file (178 rows),
  sorted_by_value (ranks 1..178, non-increasing, top $1,245,274,551, bottom $743,481),
  coverage (40/40 watchlist), farm_steps, screenshots (3× 1440×900, each < 512 KiB),
  dossier_matches (dossier 701,616 bytes, source whole, no cut), dashboard under 64 KB,
  data.js agrees with board.json.
- `main.ts` run twice into separate dirs: **byte-identical outputs** (deterministic).
- Browser check (Playwright): no console/page/request errors; search, sort, detail view,
  filtered view, model view (34 multiples), live view (24 rows) all work.
- Kit pre-submit check (`node cli/makefun.mjs check --kit . --repo <dir>
  --transcripts /tmp/token-radar-bundle.tar.gz`): **11 passed, 1 failed, 6 skipped** —
  passes include transcripts_present/recorded, thinking_wellformed, thinking_in_window,
  thinking_reproduces (**49.3%**, 676/1369 lines, ≥30% required), thinking_turns (59),
  thinking_revised (app.js from 7 messages), license_osi (MIT), entrypoint (node22).
  The 1 failure is **thinking_priced: 0 usage rows** — see below.

## What remains before submit (parent agent)

1. **Usage rows + re-bundle.** The subagent's usage rows are written only once its run
   completes, so this step belongs to the top-level agent, in a new turn after this one:
   run the kit's SELECT with both agent ids and write the rows to a file unchanged
   (one JSON object per line):
   `SELECT u.agent_id AS agent_id, u.message_id AS message_id, u.created_at AS created_at,
   u.input_tokens AS input_tokens, u.output_tokens AS output_tokens, a.model AS model
   FROM agent.agent_message_token_usage u JOIN agent.agents a ON a.agent_id = u.agent_id
   WHERE u.agent_id IN ('4948df56-9f34-4c18-840c-9b1ad6e45a32',
   '4d5038d7-3b36-4f1e-a20f-a1d3387b9728') ORDER BY u.created_at DESC LIMIT 500`
   (Model recorded is `ipnext/avocado-5.17-v2`; make.fun's pricing row 98 prices it.)
   Then, from inside `~/workspace/makefun/token-radar-01-kit`:
   `node cli/makefun.mjs bundle --repo ~/workspace/makefun/token-radar-01
   --out /tmp/token-radar-bundle.tar.gz --muse-usage <file>`
   and confirm it reports usage rows attached (> 0). If it still reports 0, end the turn
   and repeat in the next one. A test bundle without usage already exists at
   `/tmp/token-radar-bundle.tar.gz` (241,134 bytes, sha256
   7819655dfee5ed6bba97f5fac680517d44e0d43e2edc8e02de3b6fed88fc4344) — rebuild it
   with `--muse-usage` at submit time; do not submit the test one.
2. **GitHub repo (not created — `gh` is not logged in).** Create a NEW public repo
   (after 2026-11-14T10:00:00Z) from Om's GitHub account, push this tree, fill
   `{owner}`/`{repo}` in the README badges. `.makefun/owner.json` (wallet
   `5HqPBpjZ5ojxvTJ6cZs7CAS6LckBkpZtQUb6aWLQgdjh`, the account's sign-in wallet) is
   already committed, so repo ownership is proven even though the account has no
   GitHub login. Local git HEAD is currently `f6f5d55` (commit 1) — re-check the sha
   after any further commit; submit the sha that is on the GitHub branch.
   Alternative without GitHub: source bundle via `kit init` (drand anchor) — not used;
   the repo route is ready.
3. **Submit** (from inside the unpacked kit, with the API key in `~/.makefun/credentials`):
   `node cli/makefun.mjs submit --competition token-radar-01 --repo-url <url>
   --commit <sha> --title "Token launch radar — comparables-calibrated pre-token board"
   --bundle /tmp/token-radar-bundle.tar.gz --keypair ../makefun-keypair.json`
   Submit signs the entry message with the agent keypair (wallet
   `2PbqQHCEWWrJyfyastMoM45owZupcEPfbMbLtLmW6tRA`; submit adds it to the account
   if needed) and must run within 10 minutes of signing. Quota: 5/day, 10 total.
   Then re-run `check` and fix anything it flags.
4. **Known limits / not done:** no Docker here, so the grader's exact sandbox run
   (`docker run … node22 /bot/main.ts`) was not reproduced — only plain `node main.ts`
   runs (twice, byte-identical) plus the local gate replica. No GitHub repo exists yet,
   so `repo_public` / `repo_created_after_open` / `commit_in_repo` are unchecked until
   step 2. The starter was used as reference only; every entry file was written fresh
   in-session (vendor/makefun-board.ts and LICENSE are kit files, vendored as instructed).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
node scripts/verify.mjs   # 9 local gate checks against out/
```

Screenshots: `node shots.mjs <repo>` from `~/workspace/makefun/shot-tools`
(Playwright 1.65.1, Chromium headless shell already installed). Interaction check:
`node check.mjs <repo>`.
