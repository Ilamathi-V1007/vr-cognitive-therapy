import {HandTracker} from "../../core/handtracker.js";
import {saveTrial, exportJSON, clearTrials} from "../../core/storage.js";
import {cmci, decide, clamp} from "../../core/cmci.js";
const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const W = 640, H = 480, DWELL = 600, STEP = 800, GAP = 1000, REST_EVERY = 8;
const board = Object.assign(document.createElement("canvas"), {width: W, height: H}), g = board.getContext("2d");
const view = $("view"), vg = view.getContext("2d");
const mobile = /Android|iPhone/i.test(navigator.userAgent);
const cfg = {facing: q.get("cam") || (mobile ? "environment" : "user")};
cfg.mirror = q.has("mirror") ? q.get("mirror") === "1" : cfg.facing === "user";
let tracker = null, mouse = false, vr = false, fit = {x: 0, y: 0, s: 1};
const cur = {x: W / 2, y: H / 2}, mpos = {x: W / 2, y: H / 2};
const S = {phase: "idle", grid: 4, len: 3, ok: 0, bad: 0, n: 0, seq: [], hit: 0, errors: 0, t: 0, tRecall: 0, tFirst: 0, samples: [], lostMs: 0,
  dw: {ms: 0, lock: false}, errLock: null, retry: null, cued: false, log: [], score: 0, msg: "Hold your fingertip on the circle to begin", sub: "", sub2: "", block: [], cm: [], restUntil: 0, corr: [], pendErr: null};

// Geometry: pulli (dots) on a grid; the kolam line travels through the cells BETWEEN pulli, so it loops around them.
const sp = n => Math.min(90, 340 / (n - 1));
const pulli = n => Array.from({length: n * n}, (_, i) => ({x: W / 2 + (i % n - (n - 1) / 2) * sp(n), y: H / 2 + (Math.floor(i / n) - (n - 1) / 2) * sp(n)}));
const cells = n => { const m = n - 1; return Array.from({length: m * m}, (_, i) => ({x: W / 2 + (i % m - (m - 1) / 2) * sp(n), y: H / 2 + (Math.floor(i / m) - (m - 1) / 2) * sp(n)})); };
function genSeq(n, L) {                         // self-avoiding walk over cells (no crossings), orthogonal steps only
  const m = n - 1;
  for (let k = 0; k < 60; k++) {
    const p = [Math.floor(Math.random() * m * m)];
    while (p.length < L) {
      const a = p.at(-1), x = a % m, y = Math.floor(a / m);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([u, v]) => u >= 0 && v >= 0 && u < m && v < m).map(([u, v]) => v * m + u).filter(i => !p.includes(i));
      if (!nb.length) break; p.push(nb[Math.floor(Math.random() * nb.length)]);
    }
    if (p.length === L) return p;
  }
  return genSeq(n, L - 1);
}
// Scoring. Span = longest sequence reproduced correctly at least twice (Corsi-style), counting only un-cued trials.
const span = () => { const c = {}; S.log.forEach(r => r.ok && !r.cued && (c[r.len] = (c[r.len] || 0) + 1)); return Math.max(0, ...Object.keys(c).filter(l => c[l] >= 2).map(Number)); };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function summary() { const r = S.log.filter(x => !x.cued);
  return `Span ${span()}  |  Accuracy ${Math.round(100 * mean(r.map(x => x.accuracy)))}%  |  ${mean(r.filter(x => x.hit).map(x => x.durMs / 1000 / x.hit)).toFixed(1)} s per step`; }

function startTrial() {
  const cued = !!S.retry;
  Object.assign(S, {phase: "show", seq: S.retry || genSeq(S.grid, S.len), retry: null, cued, hit: 0, errors: 0, samples: [], lostMs: 0, tFirst: 0, errLock: null, corr: [], pendErr: null, sub2: "", t: performance.now(), msg: cued ? "Look again, carefully" : "Watch the kolam being drawn"});
}
function endTrial(ok) {
  const s = S.samples; let path = 0, jerk = 0;
  for (let i = 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  for (let i = 3; i < s.length; i++) jerk += Math.abs(s[i].x - 3 * s[i - 1].x + 3 * s[i - 2].x - s[i - 3].x) + Math.abs(s[i].y - 3 * s[i - 1].y + 3 * s[i - 2].y - s[i - 3].y);
  const rec = {ts: Date.now(), trial: ++S.n, grid: S.grid, len: S.len, ok, cued: S.cued, errors: S.errors, hit: S.hit, accuracy: +(S.hit / S.len).toFixed(2),
    points: S.hit * 10 + (ok && !S.errors ? 10 : 0), firstStepMs: S.tFirst ? Math.round(S.tFirst - S.tRecall) : null, durMs: Math.round(performance.now() - S.tRecall),
    pathPx: Math.round(path), jerkProxy: s.length > 3 ? +(jerk / s.length).toFixed(2) : null, handLostMs: Math.round(S.lostMs), input: mouse ? "mouse" : cfg.facing, mirror: cfg.mirror};
  const ideal = Math.max(S.hit, 1) * sp(S.grid);
  Object.assign(rec, {pathEff: path ? +clamp(ideal / path).toFixed(2) : null, corrMs: S.corr.length ? Math.round(mean(S.corr)) : null, recovered: S.errors ? +ok : null});
  S.log.push(rec); S.block.push(rec); S.score += rec.points; saveTrial(rec);
  if (!ok) S.retry = S.seq;                      // errorless-style support: show the same kolam again once
  Object.assign(S, {phase: "feedback", t: performance.now(), msg: ok ? (S.errors ? "Completed" : "Perfect!") : "Good try. Let us look again", sub: `+${rec.points} points`});
}
const pal = () => vr ? {BG: "#24424a", INK: "#fff3dc", ACC: "#ffb454", ZONE: "#335a64"} : {BG: "#fff3dc", INK: "#2f3d3c", ACC: "#e8833a", ZONE: "#ffe3c2"};
function blockEnd(now) {
  const B = S.block.filter(r => !r.cued); S.block = [];
  if (!B.length) return startTrial();
  const secStep = mean(B.filter(r => r.hit).map(r => r.durMs / 1000 / r.hit)), mm = B.filter(r => r.pathEff != null);
  const C = mean([mean(B.map(r => r.accuracy)), clamp(1 - secStep / 4)]);                         // accuracy + speed
  const M = mean(mm.map(r => (clamp(1 - (r.firstStepMs ?? 4000) / 4000) + r.pathEff) / 2));        // initiation + path efficiency (drift)
  const er = B.filter(r => r.errors), cm = er.filter(r => r.corrMs != null);
  const E = er.length ? mean([mean(er.map(r => +r.recovered)), cm.length ? clamp(1 - mean(cm.map(r => r.corrMs)) / 3000) : 0]) : 1;   // recovery + correction delay
  const val = cmci({C, M, E}), h = B.length / 2, acc = a => mean(a.map(r => r.accuracy));
  const fatigue = (S.cm.length && S.cm.at(-1) - val >= 20) || (B.length >= 4 && acc(B.slice(h)) <= acc(B.slice(0, h)) - .3);
  const d = decide(S.cm, val, fatigue); S.cm.push(val);
  if (d.move > 0) { if (S.len < S.grid + 2) S.len++; else if (S.grid < 6) { S.grid++; S.len = 3; } }
  else if (d.move < 0) { if (S.len > 3) S.len--; else if (S.grid > 4) { S.grid--; S.len = 3; } }
  const p = v => Math.round(100 * v);
  saveTrial({module: "kolam", type: "block", ts: Date.now(), cmci: val, C: +C.toFixed(2), M: +M.toFixed(2), E: +E.toFixed(2), fatigue, move: d.move, grid: S.grid, len: S.len});
  Object.assign(S, {phase: "rest", restUntil: now + (fatigue ? 20000 : 4000), msg: fatigue ? "Please rest for a little while" : "🌸 +1 flower, ⭐ +3. Rest, then hold the circle", sub: `CMCI ${val}   C ${p(C)}  M ${p(M)}  E ${p(E)}`, sub2: summary()});
}
function step(now, dt) {
  const raw = mouse ? mpos : {x: (tracker.x - .1) / .8 * W, y: (tracker.y - .1) / .8 * H};
  cur.x += (Math.min(W, Math.max(0, raw.x)) - cur.x) * .35; cur.y += (Math.min(H, Math.max(0, raw.y)) - cur.y) * .35;
  const ok = mouse || tracker.tracked;
  if (S.phase === "show" && now - S.t > S.len * STEP + GAP) Object.assign(S, {phase: "recall", tRecall: now, msg: "Now draw it yourself", sub: ""});
  if (S.phase === "feedback" && now - S.t > 1800) {
    if (S.n % REST_EVERY === 0 && !S.retry) blockEnd(now); else startTrial();
  }
  if (S.phase === "recall") {
    if (!ok) S.lostMs += dt; else {
      S.samples.push({x: cur.x, y: cur.y});
      const C = cells(S.grid), r = sp(S.grid) * .32, near = C.findIndex(c => Math.hypot(c.x - cur.x, c.y - cur.y) < r);
      if (near === S.seq[S.hit]) { S.hit++; S.tFirst ||= now; if (S.pendErr) { S.corr.push(now - S.pendErr); S.pendErr = null; } S.errLock = null; S.msg = ""; }
      else if (near < 0) S.errLock = null;
      else if (near !== S.errLock && !S.seq.slice(0, S.hit).includes(near)) { S.errors++; S.pendErr ||= now; S.errLock = near; S.msg = "Follow the line you saw"; }
      if (S.hit === S.len) endTrial(true); else if (S.errors >= 3) endTrial(false);
    }
  }
  const go = (S.phase === "idle" || (S.phase === "rest" && now >= S.restUntil)) && ok && Math.hypot(cur.x - W / 2, cur.y - H / 2) < 63;
  if (!go) S.dw = {ms: 0, lock: false}; else if (!S.dw.lock && (S.dw.ms += dt) >= DWELL) { S.dw.lock = true; startTrial(); }
}
function curve(p, c, w) {                        // smooth line through cell centres, so it bends around the pulli
  if (p.length < 2) return; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
  g.lineTo(p.at(-1).x, p.at(-1).y); g.stroke();
}
function draw(now) {
  const {BG, INK, ACC, ZONE} = pal();
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  if (tracker && !mouse && !vr) { g.save(); g.globalAlpha = .22; if (cfg.mirror) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(tracker.video, 0, 0, W, H); g.restore(); }
  g.lineCap = g.lineJoin = "round";
  const C = cells(S.grid), pts = ids => ids.map(i => C[i]), play = !["idle", "rest"].includes(S.phase);
  if (S.phase === "show") curve(pts(S.seq.slice(0, Math.min(S.len, Math.floor((now - S.t) / STEP) + 1))), ACC, 9);
  if (S.phase === "recall") { const ink = pts(S.seq.slice(0, S.hit)); curve(ink.concat([cur]), INK, 9);
    if (!S.hit) { g.strokeStyle = ACC; g.lineWidth = 3; g.beginPath(); g.arc(C[S.seq[0]].x, C[S.seq[0]].y, 16, 0, 7); g.stroke(); } }
  if (S.phase === "feedback") curve(pts(S.seq), S.hit === S.len ? INK : ACC, 9);
  if (play) pulli(S.grid).forEach(d => { g.fillStyle = INK; g.beginPath(); g.arc(d.x, d.y, 7, 0, 7); g.fill(); });
  else { g.strokeStyle = ACC; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, 55, 0, 7); g.stroke();
    if (S.dw.ms) { g.lineWidth = 8; g.beginPath(); g.arc(W / 2, H / 2, 55, -1.57, -1.57 + 6.28 * S.dw.ms / DWELL); g.stroke(); }
    g.fillStyle = ACC; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, 7); g.fill(); }
  g.fillStyle = INK; g.textAlign = "center"; g.font = "22px Georgia"; g.fillText(S.msg, W / 2, 40);
  g.font = "16px Georgia"; g.fillText(S.sub, W / 2, 68); g.fillText(S.sub2, W / 2, 92);
  g.font = "14px Georgia"; g.fillText(`Pulli ${S.grid}x${S.grid}  Length ${S.len}  Span ${span()}  CMCI ${S.cm.at(-1) ?? "-"}  Points ${S.score}  Trial ${S.n}`, W / 2, H - 16);
  if (!mouse && tracker && !tracker.tracked) { g.fillStyle = ACC; g.fillText("Show your hand to the camera", W / 2, H - 44); }
  g.fillStyle = ACC; g.beginPath(); g.arc(cur.x, cur.y, 11, 0, 7); g.fill();
}
function render() {
  view.width = view.clientWidth * devicePixelRatio; view.height = view.clientHeight * devicePixelRatio;
  vg.fillStyle = "#000"; vg.fillRect(0, 0, view.width, view.height);
  const panes = vr ? 2 : 1, pw = view.width / panes, s = Math.min(pw / W, view.height / H) * (vr ? .85 : .98);
  fit = {s: s / devicePixelRatio, x: (pw - W * s) / 2 / devicePixelRatio, y: (view.height - H * s) / 2 / devicePixelRatio};
  for (let i = 0; i < panes; i++) vg.drawImage(board, i * pw + (pw - W * s) / 2, (view.height - H * s) / 2, W * s, H * s);
}
let prev = performance.now();
(function loop(now) { const dt = now - prev; prev = now; if (tracker || mouse) { step(now, dt); draw(now); render(); } requestAnimationFrame(loop); })(prev);

const say = t => $("st").textContent = t;
$("cam").onclick = async () => {
  say("Loading hand tracking..."); mouse = false;
  try { tracker?.stop(); tracker = new HandTracker(cfg); await tracker.start(); say(`Camera: ${cfg.facing}, mirror ${cfg.mirror ? "on" : "off"}`); navigator.wakeLock?.request("screen").catch(() => {}); }
  catch (e) { tracker = null; say("Camera failed: " + e.message + " (camera needs HTTPS or localhost)"); }
};
$("mouse").onclick = () => { mouse = true; say("Mouse mode: move the pointer"); };
$("flip").onclick = () => { cfg.facing = cfg.facing === "user" ? "environment" : "user"; cfg.mirror = cfg.facing === "user"; $("cam").click(); };
$("mir").onclick = () => { cfg.mirror = !cfg.mirror; if (tracker) tracker.mirror = cfg.mirror; say("Mirror " + (cfg.mirror ? "on" : "off")); };
$("vr").onclick = async () => { vr = true; $("bar").hidden = true; document.body.classList.add("vr"); await document.documentElement.requestFullscreen?.().catch(() => {}); screen.orientation?.lock?.("landscape").catch(() => {}); };
view.addEventListener("pointerdown", () => { if (vr) { vr = false; $("bar").hidden = false; document.body.classList.remove("vr"); document.exitFullscreen?.().catch(() => {}); } });
view.addEventListener("pointermove", e => { const rc = view.getBoundingClientRect(); mpos.x = (e.clientX - rc.left - fit.x) / fit.s; mpos.y = (e.clientY - rc.top - fit.y) / fit.s; });
$("exp").onclick = exportJSON; $("clr").onclick = () => confirm("Delete all stored trials on this device?") && clearTrials();
