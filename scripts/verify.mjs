// Local gate check: replays the seven rows of the competition's gate scorer against out/.
//   node scripts/verify.mjs [snapshot.json] [out-dir]
// Exits 0 when every row passes, 1 otherwise. Reads only; writes nothing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';
import { parseSnapshot } from '../lib/model.ts';

const snapPath = process.argv[2] ?? '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
const out = process.argv[3] ?? '/home/hatch/workspace/makefun/token-radar-01/out';
const snapshot = parseSnapshot(readFileSync(snapPath, 'utf8'));
const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/* PNG/JPEG dimensions, from the header alone. */
function pngSize(b) {
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function jpegSize(b) {
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/* 1. dashboard_files */
{
  const dash = join(out, 'dashboard');
  const names = readdirSync(dash);
  const files = names.filter((n) => statSync(join(dash, n)).isFile());
  const total = files.reduce((n, f) => n + statSync(join(dash, f)).size, 0);
  const hasHtml = files.includes('index.html');
  const hasCss = files.some((f) => f.endsWith('.css'));
  const hasJs = files.some((f) => f.endsWith('.js'));
  const badName = files.find((f) => !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f));
  let netRef = null;
  for (const f of files) {
    const text = readFileSync(join(dash, f), 'utf8');
    if (text.includes('http://') || text.includes('https://')) { netRef = f; break; }
  }
  check('dashboard_files', hasHtml && hasCss && hasJs && files.length <= 400 && total <= 4_194_304 && !badName && !netRef,
    `${files.length} files, ${total} bytes${badName ? `, bad name ${badName}` : ''}${netRef ? `, network ref in ${netRef}` : ''}`);
}

/* 2. board_file + 3. sorted_by_value + 4. coverage + 5. farm_steps */
{
  const boardRaw = readFileSync(join(out, 'board.json'), 'utf8');
  const board = JSON.parse(boardRaw);
  const rows = board.rows;
  const badSlug = rows.find((r) => !snapSlugs.has(r.slug));
  const dup = rows.length !== new Set(rows.map((r) => r.slug)).size;
  const badRow = rows.find((r) =>
    typeof r.name !== 'string' || r.name.length === 0 ||
    !Number.isSafeInteger(r.rank) || r.rank <= 0 ||
    !Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000);
  check('board_file', rows.length >= 100 && rows.length <= 4000 && boardRaw.length <= 8_388_608 && !badSlug && !dup && !badRow,
    `${rows.length} rows, ${boardRaw.length} bytes${badSlug ? `, unknown slug ${badSlug.slug}` : ''}${dup ? ', duplicate slug' : ''}${badRow ? `, bad row ${badRow.slug}` : ''}`);
  const ranks = [...rows.map((r) => r.rank)].sort((a, b) => a - b);
  const ranksOk = ranks.every((r, i) => r === i + 1);
  const sorted = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
  const allSame = rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
  check('sorted_by_value', ranksOk && sorted && !allSame, `ranks 1..${rows.length}, non-increasing, top $${rows[0].implied_value_usd}, bottom $${rows[rows.length - 1].implied_value_usd}`);
  const missing = snapshot.watchlist.filter((s) => !rows.some((r) => r.slug === s));
  check('coverage', missing.length === 0, `${snapshot.watchlist.length} watchlist slugs, missing ${missing.length}`);
  const badSteps = rows.find((r) =>
    !Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12 ||
    r.farm_steps.some((s) => typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600));
  check('farm_steps', !badSteps, badSteps ? `bad steps on ${badSteps.slug}` : 'every row 3–12 steps, 20–600 chars');
}

/* 6. screenshots */
{
  const dir = join(out, 'screenshots');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  let ok = names.length >= 3 && names.length <= 4;
  let detail = `${names.length} images`;
  for (const n of names) {
    const b = readFileSync(join(dir, n));
    const isPng = b[0] === 0x89 && b[1] === 0x50;
    const isJpeg = b[0] === 0xff && b[1] === 0xd8;
    const size = isPng ? pngSize(b) : isJpeg ? jpegSize(b) : null;
    if (!size) { ok = false; detail += `, ${n} not a whole PNG/JPEG`; continue; }
    const long = Math.max(size.w, size.h), short = Math.min(size.w, size.h);
    if (b.length > 524_288 || long > 1440 || short < 800) { ok = false; detail += `, ${n} ${size.w}x${size.h} ${b.length}B`; }
    else detail += `, ${n} ${size.w}x${size.h} ${b.length}B`;
  }
  check('screenshots', ok, detail);
}

/* 7. dossier_matches */
{
  const got = readFileSync(join(out, 'dossier.json'));
  const want = Buffer.from(buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
  const doc = JSON.parse(got.toString('utf8'));
  const cut = doc.text.includes('left out');
  check('dossier_matches', got.equals(want) && got.length <= 1_572_864 && !cut,
    `dossier ${got.length} bytes, text ${Buffer.byteLength(doc.text, 'utf8')} bytes, images ${doc.images.length}${cut ? ', TEXT WAS CUT' : ', source whole'}`);
}

/* Extra: dashboard source fits the dossier text cap, and data.js agrees with board.json. */
{
  const dash = join(out, 'dashboard');
  const total = readdirSync(dash).reduce((n, f) => n + statSync(join(dash, f)).size, 0);
  check('dashboard_source_under_64k', total <= 65_536, `${total} bytes`);
  const data = readFileSync(join(out, 'data.js'), 'utf8');
  const radar = JSON.parse(data.replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
  const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
  const agree = radar.rows.length === board.rows.length &&
    radar.rows.every((r, i) => r.slug === board.rows[i].slug && r.implied_value_usd === board.rows[i].implied_value_usd &&
      JSON.stringify(r.farm_steps) === JSON.stringify(board.rows[i].farm_steps));
  check('data_matches_board', agree, `${radar.rows.length} rows, farm plans identical`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `ALL ${results.length} CHECKS PASS` : `${failed} of ${results.length} CHECKS FAILED`);
process.exit(failed === 0 ? 0 : 1);
