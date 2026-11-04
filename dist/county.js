'use strict';
// 3D county map. Opens from a state's race detail or with ?county=XX.
// Data comes from counties/XX.json (scripts/import-counties.py) and is always labeled
// with its status (historical for now), year, office and source.
const CountyMap = (() => {
  const view = document.getElementById('county-view');
  const canvas = document.getElementById('county-canvas');
  const ctx = canvas.getContext('2d');
  const card = document.getElementById('county-card');
  const pick = document.getElementById('county-pick');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const home = {pitch: .82, yaw: -.1, zoom: 1};
  const fmt = new Intl.NumberFormat('en-US');
  const RGB = {D: [120, 173, 240], N: [106, 120, 103], R: [237, 142, 139], O: [226, 191, 121]};
  const gapNotes = {
    AK: 'Alaska reports by state house district, not by borough, so its returns do not join to borough shapes.',
    CT: 'Connecticut reports by town, and its census county areas changed to planning regions in 2022, so some areas do not join.',
  };
  let doc = null, counties = [], cam = {...home}, heightMode = 'votes', hovered = null, chosen = null;
  let W = 0, H = 0, rise = 1, frame = 0, pointers = new Map(), gesture = null, tourTimer = 0, maxTotal = 1, code = '';

  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, k = 1) => `rgb(${c.map(v => Math.round(v * k)).join(',')})`;
  const pct = (v, total) => total ? (100 * v / total) : 0;

  function margin(c) {
    if (!c.total) return null;
    const [a, b] = c.cands;
    return {lead: a.p, pts: pct(a.v - (b?.v ?? 0), c.total)};
  }
  function color(c) {
    const m = margin(c);
    if (!m) return [33, 43, 32];
    const side = m.lead === 'D' ? RGB.D : m.lead === 'R' ? RGB.R : RGB.O;
    return mix(RGB.N, side, Math.min(1, .2 + .8 * m.pts / 40));
  }
  function height(c) {
    if (heightMode === 'flat' || !c.total) return 0;
    if (heightMode === 'margin') return Math.min(1, margin(c).pts / 60) * 170;
    return Math.sqrt(c.total / maxTotal) * 190;
  }

  function prepare(data) {
    const s = data.precision;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of data.counties) for (const poly of c.rings) for (const [x, y] of poly[0]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    // Alaska's Aleutians cross the antimeridian; fold them east so the state stays whole.
    const wrap = maxX - minX > 180 * s;
    if (wrap) { minX = Infinity; maxX = -Infinity; for (const c of data.counties) for (const poly of c.rings) for (const [x] of poly[0]) { const v = x > 0 ? x - 360 * s : x; minX = Math.min(minX, v); maxX = Math.max(maxX, v); } }
    const k = Math.cos(((minY + maxY) / 2 / s) * Math.PI / 180);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const scale = 1000 / Math.max((maxX - minX) * k, maxY - minY);
    maxTotal = Math.max(1, ...data.counties.map(c => c.total || 0));
    return data.counties.map(c => {
      const rings = c.rings.map(poly => poly.map(ring => ring.map(([x, y]) => [((wrap && x > 0 ? x - 360 * s : x) - cx) * k * scale, -(y - cy) * scale])));
      let ax = 0, ay = 0, n = 0, area = 0;
      for (const poly of rings) {
        const r = poly[0];
        for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], cr = a[0] * b[1] - b[0] * a[1]; area += cr; ax += (a[0] + b[0]) * cr; ay += (a[1] + b[1]) * cr; n++; }
      }
      const center = area ? [ax / (3 * area), ay / (3 * area)] : rings[0][0][0];
      return {...c, rings, center, area: Math.abs(area / 2)};
    });
  }

  function project(x, y, z) {
    const u = x * Math.cos(cam.yaw) - y * Math.sin(cam.yaw);
    const v = x * Math.sin(cam.yaw) + y * Math.cos(cam.yaw);
    const p = 1 + (v * Math.sin(cam.pitch) + z * Math.cos(cam.pitch)) / 2600;
    const s = Math.min(W, H * 1.25) / 1180 * cam.zoom;
    return [W / 2 + u * p * s, H / 2 + 20 + (v * Math.cos(cam.pitch) - z * Math.sin(cam.pitch)) * p * s];
  }
  function shape(c, z) {
    const path = new Path2D();
    for (const poly of c.rings) for (const ring of poly) {
      ring.forEach(([x, y], i) => { const [px, py] = project(x, y, z); i ? path.lineTo(px, py) : path.moveTo(px, py); });
      path.closePath();
    }
    return path;
  }

  function draw() {
    frame = 0;
    if (!counties.length || !W) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // floor grid, matching the national atlas
    ctx.strokeStyle = 'rgba(151,180,134,.16)'; ctx.lineWidth = .7;
    for (let g = -700; g <= 700; g += 100) {
      for (const [a, b] of [[[g, -700], [g, 700]], [[-700, g], [700, g]]]) {
        const p = project(...a, -6), q = project(...b, -6);
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      }
    }
    const order = counties.map(c => ({c, d: project(...c.center, 0)[1]})).sort((a, b) => a.d - b.d);
    for (const {c} of order) {
      const h = height(c) * rise;
      const base = color(c), active = c === chosen || c === hovered;
      if (h > 0) {
        const step = Math.max(1.2, h / 34);
        ctx.fillStyle = rgb(base, .55);
        for (let z = 0; z < h; z += step) ctx.fill(shape(c, z), 'evenodd');
      }
      c.top = shape(c, h);
      ctx.fillStyle = c.total ? rgb(base, active ? 1.08 : 1) : '#1b231a';
      ctx.fill(c.top, 'evenodd');
      ctx.lineWidth = active ? 2.2 : .6;
      ctx.strokeStyle = active ? '#d1f897' : c.total ? 'rgba(16,21,16,.75)' : '#3b4a37';
      if (!c.total) ctx.setLineDash([3, 3]);
      ctx.stroke(c.top);
      ctx.setLineDash([]);
    }
    // labels: biggest counties plus the selected one
    const labeled = [...counties].filter(c => c.total).sort((a, b) => b.total - a.total).slice(0, W < 600 ? 4 : 7);
    if (chosen && !labeled.includes(chosen)) labeled.push(chosen);
    ctx.font = `${W < 600 ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const placed = [];
    for (const c of labeled) {
      const [x, y] = project(...c.center, height(c) * rise);
      const w = ctx.measureText(c.name).width * 1.15 + 8;
      if (c !== chosen && placed.some(b => Math.abs(b[0] - x) < (b[2] + w) / 2 && Math.abs(b[1] - y) < 15)) continue;
      placed.push([x, y, w]);
      ctx.lineWidth = 3; ctx.strokeStyle = '#101510'; ctx.fillStyle = c === chosen ? '#d1f897' : '#ebece0';
      ctx.strokeText(c.name.toUpperCase(), x, y - 4); ctx.fillText(c.name.toUpperCase(), x, y - 4);
    }
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    W = box.width; H = box.height;
    canvas.width = Math.round(W * devicePixelRatio); canvas.height = Math.round(H * devicePixelRatio);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    draw();
  }

  function statusLine() {
    const status = document.getElementById('county-status');
    status.replaceChildren();
    const chip = el('span', doc.status === 'historical' ? 'HISTORICAL' : doc.status === 'certified' ? 'CERTIFIED' : 'UNOFFICIAL · LIVE', 'cv-chip ' + doc.status);
    status.append(chip, el('span', `${doc.year} ${doc.office} by county. Final certified counts as compiled by the MIT Election Lab. 2026 county returns are not loaded yet.`));
  }
  function summary() {
    const totals = new Map();
    let all = 0;
    for (const c of counties) for (const x of c.cands ?? []) { const k = x.n + '|' + x.p; totals.set(k, (totals.get(k) ?? 0) + x.v); all += x.v; }
    return {all, cands: [...totals].map(([k, v]) => ({n: k.split('|')[0], p: k.split('|')[1], v})).sort((a, b) => b.v - a.v)};
  }
  function candidateRows(cands, total, limit = 3) {
    return cands.slice(0, limit).map(x => {
      const row = el('div', null, 'candidate ' + (x.p === 'D' ? 'dem' : x.p === 'R' ? 'rep' : 'other'));
      const text = el('div', null, 'candtext');
      text.append(el('span', x.n), el('strong', pct(x.v, total).toFixed(1) + '%'));
      const track = el('div', null, 'track'), fill = el('span');
      fill.style.width = pct(x.v, total) + '%'; track.append(fill);
      row.append(text, track, el('div', fmt.format(x.v) + ' votes', 'hint'));
      return row;
    });
  }
  function showCard() {
    card.replaceChildren();
    const credit = el('p', null, 'cv-credit');
    const a = el('a', doc.sources.returns.name + ' ↗'); a.href = doc.sources.returns.url; a.target = '_blank'; a.rel = 'noopener';
    credit.append('Source: ', a);
    if (!chosen) {
      const s = summary();
      card.append(el('div', 'STATEWIDE · SUM OF COUNTIES', 'micro'), el('h3', stateNames[code]), el('p', fmt.format(s.all) + ' votes in ' + counties.filter(c => c.total).length + ' counties', 'hint'), ...candidateRows(s.cands, s.all));
      if (doc.gaps.length || doc.unshapedReturns) card.append(el('p', `${doc.gaps.length} areas with no joined returns. ${gapNotes[code] ?? ''}`.trim(), 'cv-gap'));
      card.append(el('p', 'Tap a county for its returns.', 'hint'), credit);
      return;
    }
    const c = chosen;
    card.append(el('div', 'COUNTY · ' + doc.year + ' ' + doc.office.toUpperCase(), 'micro'), el('h3', c.name));
    if (!c.total) {
      card.append(el('p', 'No county returns joined for this area. ' + (gapNotes[code] ?? 'The source has no row matching this county.'), 'cv-gap'));
    } else {
      const m = margin(c), share = pct(c.total, summary().all);
      card.append(el('p', `${fmt.format(c.total)} votes · ${share.toFixed(1)}% of the state`, 'hint'), ...candidateRows(c.cands, c.total));
      card.append(el('p', `Margin · ${m.lead} +${m.pts.toFixed(1)} points`, 'hint'));
    }
    const back = el('button', '← Statewide', 'cv-back'); back.type = 'button';
    back.addEventListener('click', () => select(null));
    card.append(back, credit);
  }
  function select(c, fromTour = false) {
    chosen = c; if (!fromTour) stopTour();
    pick.value = c ? c.fips : '';
    showCard(); queue();
  }

  function startTour() {
    stopTour();
    const ranked = counties.filter(c => c.total).sort((a, b) => b.total - a.total).slice(0, 12);
    let i = 0;
    const step = () => { select(ranked[i++ % ranked.length], true); };
    step(); tourTimer = setInterval(step, 6000);
  }
  function stopTour() { clearInterval(tourTimer); tourTimer = 0; }

  function animateRise() {
    if (reduced) { rise = 1; queue(); return; }
    const start = performance.now();
    const tick = now => { rise = Math.min(1, (now - start) / 900); rise = 1 - Math.pow(1 - rise, 3); draw(); if (rise < 1) requestAnimationFrame(tick); };
    rise = 0; requestAnimationFrame(tick);
  }

  function hit(x, y) {
    const r = canvas.getBoundingClientRect(), px = (x - r.left) * devicePixelRatio, py = (y - r.top) * devicePixelRatio;
    const order = counties.map(c => ({c, d: project(...c.center, 0)[1]})).sort((a, b) => b.d - a.d);
    for (const {c} of order) if (c.top && ctx.isPointInPath(c.top, px, py, 'evenodd')) return c;
    return null;
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    gesture = {moved: 0, cam: {...cam}, pts: new Map(pointers)};
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') { const c = hit(e.clientX, e.clientY); if (c !== hovered) { hovered = c; canvas.style.cursor = c ? 'pointer' : 'grab'; queue(); } }
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    gesture.moved += Math.hypot(e.clientX - prev[0], e.clientY - prev[1]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], [a0, b0] = [...gesture.pts.values()];
      if (a0 && b0) cam.zoom = Math.min(5, Math.max(.6, gesture.cam.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, Math.hypot(a0[0] - b0[0], a0[1] - b0[1]))));
    } else {
      cam.yaw -= (e.clientX - prev[0]) * .006;
      cam.pitch = Math.min(1.12, Math.max(0, cam.pitch + (e.clientY - prev[1]) * .004));
    }
    if (gesture.moved > 6) stopTour();
    queue();
  });
  const release = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture && gesture.moved < 6 && e.type === 'pointerup' && !pointers.size) select(hit(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (hovered) { hovered = null; queue(); } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.min(5, Math.max(.6, cam.zoom * Math.exp(-e.deltaY * .0015))); queue(); }, {passive: false});
  canvas.addEventListener('keydown', e => {
    const k = {ArrowLeft: () => cam.yaw += .12, ArrowRight: () => cam.yaw -= .12, ArrowUp: () => cam.pitch = Math.max(0, cam.pitch - .08), ArrowDown: () => cam.pitch = Math.min(1.12, cam.pitch + .08), '+': () => cam.zoom = Math.min(5, cam.zoom * 1.2), '=': () => cam.zoom = Math.min(5, cam.zoom * 1.2), '-': () => cam.zoom = Math.max(.6, cam.zoom / 1.2)}[e.key];
    if (k) { e.preventDefault(); k(); stopTour(); queue(); }
  });
  document.querySelectorAll('[data-height]').forEach(b => b.addEventListener('click', () => {
    heightMode = b.dataset.height;
    document.querySelectorAll('[data-height]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    animateRise();
  }));
  document.getElementById('cv-reset').addEventListener('click', () => { cam = {...home}; select(null); });
  document.getElementById('cv-close').addEventListener('click', () => view.close());
  pick.addEventListener('change', () => select(counties.find(c => c.fips === pick.value) ?? null));
  view.addEventListener('close', () => {
    stopTour(); code = '';
    const p = new URLSearchParams(location.search); p.delete('county');
    const q = p.toString();
    if (location.protocol !== 'file:') history.replaceState(null, '', q ? '?' + q : location.pathname);
  });
  new ResizeObserver(() => view.open && resize()).observe(canvas.parentElement);

  async function open(state) {
    if (!/^[A-Z]{2}$/.test(state)) return;
    code = state;
    document.getElementById('county-title').textContent = stateNames[state] + ' by county';
    card.replaceChildren(el('p', 'Loading county shapes and returns…', 'hint'));
    counties = []; chosen = null; hovered = null; cam = {...home};
    if (!view.open) view.showModal();
    const p = new URLSearchParams(location.search); p.set('county', state);
    if (location.protocol !== 'file:') history.replaceState(null, '', '?' + p);
    try {
      const response = await fetch('counties/' + state + '.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      doc = await response.json();
      if (code !== state) return;
      counties = prepare(doc);
    } catch {
      card.replaceChildren(el('p', 'County data for this state is not available yet.', 'cv-gap'));
      document.getElementById('county-status').replaceChildren();
      return;
    }
    pick.replaceChildren(el('option', 'Jump to a county'), ...[...counties].sort((a, b) => a.name.localeCompare(b.name)).map(c => { const o = el('option', c.name); o.value = c.fips; return o; }));
    pick.firstChild.value = '';
    statusLine(); resize(); showCard(); animateRise();
    if (document.body.classList.contains('tv-mode') && matchMedia('(min-width: 760px)').matches) startTour();
  }
  function button(state) {
    const b = el('button', 'Open the 3D county map ↗', 'county-open');
    b.type = 'button';
    b.addEventListener('click', () => open(state));
    return b;
  }
  const initial = new URLSearchParams(location.search).get('county');
  if (initial && Object.hasOwn(stateNames, initial)) addEventListener('DOMContentLoaded', () => open(initial));
  return {open, button};
})();
