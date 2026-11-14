/* Launch Radar: the board a reader can use.
 *
 * Data comes from data.js (window.RADAR), written by main.ts from the same sealed snapshot.
 * Nothing is fetched and nothing leaves the page: no network at all.
 *
 * The score a row shows is recomputed here, in the open, from the snapshot's own figures — the
 * same formula main.ts ran. A row's implied value is:
 *
 *   base     = tvl_usd x multiple(category)
 *   growth   = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
 *   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
 *   breadth  = 1 + 0.02 x min(chains - 1, 5)
 *   implied  = max(1, round(base x growth x maturity x breadth))
 *
 * multiple(category) is calibrated from the snapshot itself: the median market-cap-to-TVL ratio of
 * the token-trading protocols of that category, shrunk toward the global median (prior weight 8)
 * and clamped to [0.05, 1.50]. No protocol name is ever special-cased.
 */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !D.rows) { document.getElementById('rows').innerHTML = '<tr><td colspan="8">No radar data.</td></tr>'; return; }

  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { q: '', cat: '', chain: '', mintvl: 0, watch: false, sort: 'rank', dir: 1, view: 'board', detail: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) {
    if (n == null || !isFinite(n)) return '<span class="flat">—</span>';
    var c = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return '<span class="' + c + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageText(d) {
    if (d == null) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* The model's score, recomputed from the row's own figures. */
  function scoreRow(r) {
    var age = r.age_days == null ? 365 : r.age_days;
    var growthPct = clamp(r.change_7d == null ? 0 : r.change_7d, -60, 120);
    var growth = 1 + (growthPct / 100) * D.model.growth_weight;
    var maturity = D.model.maturity_floor + (Math.min(Math.max(age, 0), D.model.maturity_days) / D.model.maturity_days) * D.model.maturity_range;
    var breadth = 1 + D.model.breadth_per_chain * Math.min(Math.max(r.chains.length - 1, 0), D.model.breadth_max_chains);
    var base = r.tvl_usd * r.category_multiple;
    var implied = Math.max(1, Math.round(base * growth * maturity * breadth));
    return { base: Math.round(base), growthPct: growthPct, growth: growth, maturity: maturity, breadth: breadth, implied: implied };
  }

  /* ---- stats ---- */
  function renderStats() {
    var top = rows[0];
    $('stats').innerHTML =
      stat(money(top ? top.implied_value_usd : 0), 'Top implied value' + (top ? ' — ' + esc(top.name) : '')) +
      stat(String(D.watchlist_size), 'Watchlist protocols') +
      stat(String(D.board_size), 'Board rows') +
      stat(String(D.pre_token_count), 'Pre-token protocols found') +
      stat(String(D.live_size), 'Live-token protocols set aside') +
      stat(D.as_of, 'Snapshot date');
    $('src').textContent = 'Snapshot: ' + D.source + ' · Floor $' + (D.floor_usd / 1e6) + 'M · Model ' + D.model_version + ' · Implied values are this radar\u2019s own claim.';
  }
  function stat(b, s) { return '<div class="stat"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; }

  /* ---- filters ---- */
  function fillOptions() {
    var cats = {}, chains = {};
    rows.forEach(function (r) {
      if (r.category) cats[r.category] = 1;
      r.chains.forEach(function (c) { chains[c] = 1; });
    });
    $('cat').innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    $('chain').innerHTML = '<option value="">All chains</option>' + Object.keys(chains).sort().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.mintvl && r.tvl_usd < state.mintvl) return false;
      if (state.watch && !r.watch) return false;
      return true;
    }).sort(function (a, b) { return compare(a, b) * state.dir; });
  }
  function compare(a, b) {
    var k = state.sort, va = a[k], vb = b[k];
    if (k === 'name' || k === 'category') return String(va || '').localeCompare(String(vb || ''));
    if (k === 'chains') return String((va[0] || '')).localeCompare(String((vb[0] || '')));
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  }

  /* ---- board ---- */
  function renderBoard() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' rows';
    $('rows').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (r.watch ? ' · <span class="pill watch">watchlist</span>' : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 3).map(esc).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    document.querySelectorAll('#grid th').forEach(function (th) {
      var k = th.getAttribute('data-k');
      th.textContent = th.textContent.replace(/ [▲▼]$/, '');
      if (k === state.sort) th.textContent += state.dir === 1 ? ' ▲' : ' ▼';
    });
  }

  /* ---- detail ---- */
  function farmHtml(r) {
    return '<ol class="farm">' + r.farm_steps.map(function (s) {
      var m = s.match(/^(.*?)\s*Cost:\s*(.*?)\s*Time:\s*(.*?)\.?$/);
      if (!m) return '<li>' + esc(s) + '</li>';
      return '<li>' + esc(m[1]) + '<br><span class="cost">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
    }).join('') + '</ol>';
  }
  function renderDetail() {
    var r = bySlug[state.detail];
    var el = $('detail');
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    var s = scoreRow(r);
    var mult = D.multiples.filter(function (m) { return m.category === (r.category || '(no category)'); })[0];
    el.hidden = false;
    el.innerHTML =
      '<button class="back" id="back" type="button">← Back to the board</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="note">' + esc(r.slug) + ' · ' + esc(r.category || 'No category') + ' · ' + r.chains.map(esc).join(', ') +
      (r.watch ? ' · <span class="pill watch">On the watchlist</span>' : '') +
      ' · Records no token — that is what the snapshot says, not proof it has none.</p>' +
      '<div class="cards">' +
      '<div class="card"><b>' + money(r.implied_value_usd) + '</b><span>Implied value</span></div>' +
      '<div class="card"><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="card"><b>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>TVL change, 7 days</span></div>' +
      '<div class="card"><b>' + ageText(r.age_days) + '</b><span>Tracked since ' + esc(r.listed_at || 'unknown') + '</span></div>' +
      '</div>' +
      '<h3>How the value is worked out</h3>' +
      '<div class="dgrid"><div>' +
      '<table class="plain"><thead><tr><th>Step</th><th class="num">Value</th></tr></thead><tbody>' +
      '<tr><td>TVL × category multiple (' + money(r.tvl_usd) + ' × ' + r.category_multiple + ')</td><td class="num">' + moneyFull(s.base) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + (r.change_7d == null ? 'unreported' : r.change_7d.toFixed(1) + '%') + ')</td><td class="num">× ' + s.growth.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + (r.age_days == null ? 'age unknown, 365 days assumed' : r.age_days + ' days tracked') + ')</td><td class="num">× ' + s.maturity.toFixed(4) + '</td></tr>' +
      '<tr><td>Breadth multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td class="num">× ' + s.breadth.toFixed(4) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + moneyFull(s.implied) + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="note">Category multiple for ' + esc(r.category || 'no category') + ': ' + r.category_multiple +
      (mult ? ' — the median market-cap-to-TVL ratio of ' + mult.n + ' token-trading ' + esc(r.category || '') + ' protocol' + (mult.n === 1 ? '' : 's') +
      ' in this snapshot, shrunk toward the global median ' + D.global_multiple + '.' : ' — the global median, as this category has no token-trading protocol in the snapshot.') + '</p>' +
      '</div><div>' +
      '<h3 class="tight">Farm plan — what to do, what it costs, how long it takes</h3>' +
      farmHtml(r) +
      '<p class="note">A farm plan is a starting point, not a promise: a protocol that records no token may never issue one, and points or rewards pages change. Never pay anyone to claim on your behalf.</p>' +
      '</div></div>';
    $('back').addEventListener('click', function () { go('board'); });
  }

  /* ---- live tokens ---- */
  function renderLive() {
    var el = $('live');
    el.innerHTML = '<h2>Live tokens — set aside, not ranked</h2>' +
      '<p class="note">These protocols already have a token that trades, so the board shows the market\u2019s own value for them instead of a model\u2019s. They are here so a reader can check the radar is not mixing them into the pre-token board.</p>' +
      '<table class="plain"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' +
      D.live.map(function (p) {
        return '<tr><td><b>' + esc(p.name) + '</b><br><span class="note">' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd == null ? '—' : money(p.mcap_usd)) + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---- model ---- */
  function renderModel() {
    var el = $('model');
    el.innerHTML = '<h2>Model &amp; method</h2>' +
      '<p>Every row is scored by the same function, from the snapshot\u2019s own figures. No protocol name is ever special-cased.</p>' +
      '<div class="mono">implied = max(1, round(TVL × multiple(category)\n' +
      '                      × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)\n' +
      '                      × (0.6 + min(age_days, 1095) / 1095 × 0.4)\n' +
      '                      × (1 + 0.02 × min(chains − 1, 5))))</div>' +
      '<h3>Category multiples, calibrated from this snapshot</h3>' +
      '<p class="note">For each category, the median market-cap-to-TVL ratio of its token-trading protocols, shrunk toward the global median ' + D.global_multiple + ' with prior weight ' + D.model.shrink_prior + ', clamped to [' + D.model.multiple_floor + ', ' + D.model.multiple_cap + ']. A category with no token takes the global median.</p>' +
      '<table class="plain"><thead><tr><th>Category</th><th class="num">Tokens</th><th class="num">Raw median</th><th class="num">Multiple used</th></tr></thead><tbody>' +
      D.multiples.map(function (m) {
        return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.n + '</td><td class="num">' + (m.raw_median == null ? '—' : m.raw_median) + '</td><td class="num">' + m.multiple + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>What the board does not do</h3>' +
      '<p class="note">It does not predict whether or when a protocol issues a token. It does not say a protocol has no token — only that its DefiLlama record carries none. It ranks by what a launch would be worth if the protocol\u2019s record stayed as it is. The watchlist (' + D.watchlist_size + ' protocols at or above $' + (D.floor_usd / 1e6) + 'M TVL with no token recorded) is the floor, never the ceiling: this board adds ' + D.early_size + ' early pre-token protocols below it, by TVL.</p>';
  }

  /* ---- views & routing ---- */
  function show(view) {
    state.view = view;
    window.scrollTo(0, 0);
    ['board', 'live', 'model'].forEach(function (v) { $('tab-' + v).classList.toggle('on', v === view || (view === 'detail' && v === 'board')); });
    var detail = view === 'detail';
    $('filters').style.display = (view === 'board') ? '' : 'none';
    document.querySelector('.tablewrap').style.display = (view === 'board') ? '' : 'none';
    document.querySelector('.hint').style.display = (view === 'board') ? '' : 'none';
    $('detail').hidden = !detail;
    $('live').hidden = view !== 'live';
    $('model').hidden = view !== 'model';
    if (view === 'board') renderBoard();
    if (detail) renderDetail();
    if (view === 'live') renderLive();
    if (view === 'model') renderModel();
  }
  function go(view, detailSlug) {
    state.detail = detailSlug || null;
    var target = view === 'detail' ? '#detail=' + encodeURIComponent(state.detail) : '#' + view;
    if (location.hash === target) { readHash(); return; }
    location.hash = target;
  }
  function resetFilters() {
    state.q = ''; state.cat = ''; state.chain = ''; state.mintvl = 0; state.watch = false; state.detail = null;
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('mintvl').value = '0'; $('watch').checked = false;
  }
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('detail=') === 0) { state.detail = decodeURIComponent(h.slice(7)); show('detail'); return; }
    if (h.indexOf('filter=') === 0) {
      var f = decodeURIComponent(h.slice(7));
      resetFilters();
      var m = f.match(/^category:(.+)$/);
      if (m) { state.cat = m[1]; $('cat').value = m[1]; }
      if (f === 'watchlist') { state.watch = true; $('watch').checked = true; }
      show('board'); return;
    }
    if (h === 'live' || h === 'model') { show(h); return; }
    resetFilters();
    show('board');
  }

  /* ---- wiring ---- */
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('mintvl').addEventListener('change', function (e) { state.mintvl = Number(e.target.value); renderBoard(); });
  $('watch').addEventListener('change', function (e) { state.watch = e.target.checked; renderBoard(); });
  document.querySelectorAll('#grid th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      renderBoard();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) go('detail', tr.getAttribute('data-slug'));
  });
  $('tab-board').addEventListener('click', function () { go('board'); });
  $('tab-live').addEventListener('click', function () { go('live'); });
  $('tab-model').addEventListener('click', function () { go('model'); });
  window.addEventListener('hashchange', readHash);

  renderStats();
  fillOptions();
  readHash();
})();
