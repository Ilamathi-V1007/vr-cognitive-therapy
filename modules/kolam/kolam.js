import {HandTracker} from "../../core/handtracker.js";
import {saveTrial, exportJSON, clearTrials} from "../../core/storage.js";
const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const W = 640, H = 480, DWELL = 600, SHOW_STEP = 800, GAP = 1000, REST_EVERY = 8;
const board = Object.assign(document.createElement("canvas"), {width: W, height: H}), g = board.getContext("2d");
const view = $("view"), vg = view.getContext("2d");
const mobile = /Android|iPhone/i.test(navigator.userAgent);
const cfg = {facing: q.get("cam") || (mobile ? "environment" : "user")};
cfg.mirror = q.has("mirror") ? q.get("mirror") === "1" : cfg.facing === "user";
let tracker = null, mouse = false, vr = false, fit = {x: 0, y: 0, s: 1};
const cur = {x: W / 2, y: H / 2}, mpos = {x: W / 2, y: H / 2};
const S = {phase: "idle", grid: 3, len: 3, ok: 0, bad: 0, n: 0, seq: [], picked: [], errors: 0, t: 0, tRecall: 0,
  firstPick: 0, samples: [], lostMs: 0, dw: {id: null, ms: 0, lock: null}, msg: "Hold your fingertip on the dot to begin"};
const say = t => $("st").textContent = t;

const dots = n => Array.from({length: n * n}, (_, i) => ({id: i, x: 120 + (i % n) * 400 / (n - 1), y: 80 + Math.floor(i / n) * 320 / (n - 1)}));
function genSeq(n, L) {                       // kolam-like path: prefer neighbouring, unvisited dots
  const used = [Math.floor(Math.random() * n * n)];
  while (used.length < L) {
    const [a] = [used.at(-1)], free = [...Array(n * n).keys()].filter(i => !used.includes(i));
    const near = free.filter(i => Math.abs(i % n - a % n) <= 1 && Math.abs(Math.floor(i / n) - Math.floor(a / n)) <= 1);
    const pool = near.length ? near : free; used.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return used;
}
function targets() {
  if (S.phase === "idle" || S.phase === "rest") return [{id: "go", x: W / 2, y: H / 2, r: 55}];
  return S.phase === "recall" ? dots(S.grid).map(d => ({...d, r: 32})) : [];
}
function startTrial() {
  Object.assign(S, {phase: "show", seq: genSeq(S.grid, S.len), picked: [], errors: 0, samples: [], lostMs: 0, firstPick: 0, t: performance.now(), msg: "Watch the pattern"});
}
function endTrial(ok) {
  const s = S.samples; let path = 0, jerk = 0;
  for (let i = 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  for (let i = 3; i < s.length; i++) jerk += Math.abs(s[i].x - 3 * s[i - 1].x + 3 * s[i - 2].x - s[i - 3].x) + Math.abs(s[i].y - 3 * s[i - 1].y + 3 * s[i - 2].y - s[i - 3].y);
  S.n++;
  saveTrial({ts: Date.now(), trial: S.n, grid: S.grid, len: S.len, ok, errors: S.errors, picked: S.picked.length,
    firstSelectMs: S.firstPick ? Math.round(S.firstPick - S.tRecall) : null, durMs: Math.round(performance.now() - S.tRecall),
    pathPx: Math.round(path), jerkProxy: s.length > 3 ? +(jerk / s.length).toFixed(2) : null, handLostMs: Math.round(S.lostMs),
    input: mouse ? "mouse" : cfg.facing, mirror: cfg.mirror});
  // simple staircase: 2 clean successes -> harder, 2 failures -> easier
  if (ok && !S.errors) { S.bad = 0; if (++S.ok >= 2) { S.ok = 0; if (S.len < S.grid + 3) S.len++; else if (S.grid < 5) { S.grid++; S.len = 3; } } }
  else if (!ok) { S.ok = 0; if (++S.bad >= 2) { S.bad = 0; if (S.len > 3) S.len--; else if (S.grid > 3) { S.grid--; S.len = 3; } } }
  else S.ok = 0;
  Object.assign(S, {phase: "feedback", t: performance.now(), msg: ok ? "Well done" : "Good try"});
}
function onSelect(id) {
  if (id === "go") return startTrial();
  if (id === S.seq[S.picked.length]) { S.picked.push(id); S.firstPick ||= performance.now(); S.msg = ""; }
  else { S.errors++; S.msg = "Not that one"; }
  if (S.picked.length === S.len) endTrial(true); else if (S.errors >= 3) endTrial(false);
}
function step(now, dt) {
  const raw = mouse ? mpos : {x: (tracker.x - .1) / .8 * W, y: (tracker.y - .1) / .8 * H};
  cur.x += (Math.min(W, Math.max(0, raw.x)) - cur.x) * .35; cur.y += (Math.min(H, Math.max(0, raw.y)) - cur.y) * .35;
  const ok = mouse || tracker.tracked;
  if (S.phase === "show" && now - S.t > S.len * SHOW_STEP + GAP) Object.assign(S, {phase: "recall", tRecall: now, msg: "Now repeat it"});
  if (S.phase === "feedback" && now - S.t > 1500) S.n && S.n % REST_EVERY === 0 ? Object.assign(S, {phase: "rest", msg: "Rest. Hold the dot when ready"}) : startTrial();
  if (S.phase === "recall") { if (!ok) S.lostMs += dt; else S.samples.push({x: cur.x, y: cur.y}); }
  const hit = ok && targets().find(t => Math.hypot(t.x - cur.x, t.y - cur.y) < t.r + 8);
  if (!hit) { S.dw = {id: null, ms: 0, lock: null}; return; }
  if (S.dw.lock === hit.id) return;
  if (S.dw.id !== hit.id) S.dw = {id: hit.id, ms: 0, lock: null};
  S.dw.ms += dt;
  if (S.dw.ms >= DWELL) { const id = hit.id; S.dw = {id: null, ms: 0, lock: id}; onSelect(id); }
}
function draw(now) {
  g.fillStyle = "#12141f"; g.fillRect(0, 0, W, H);
  if (tracker && !mouse && !vr) { g.save(); g.globalAlpha = .22; if (cfg.mirror) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(tracker.video, 0, 0, W, H); g.restore(); }
  const D = dots(S.grid), P = id => D[id];
  g.lineCap = g.lineJoin = "round"; g.lineWidth = 7;
  const line = (ids, c, partial) => { if (ids.length < 2) return; g.strokeStyle = c; g.beginPath(); ids.forEach((id, i) => i ? g.lineTo(P(id).x, P(id).y) : g.moveTo(P(id).x, P(id).y)); g.stroke(); };
  if (S.phase === "show") { const k = Math.min(S.len, Math.floor((now - S.t) / SHOW_STEP) + 1); line(S.seq.slice(0, k), "#f0b429"); }
  if (S.phase === "recall" || S.phase === "feedback") line(S.picked, "#efeadf");
  if (S.phase !== "idle" && S.phase !== "rest") D.forEach(d => { g.fillStyle = "#efeadf"; g.beginPath(); g.arc(d.x, d.y, 9, 0, 7); g.fill(); });
  targets().forEach(t => { const on = S.dw.id === t.id; g.strokeStyle = "#f0b429"; g.lineWidth = 3; g.beginPath(); g.arc(t.x, t.y, t.r, 0, 7); g.stroke();
    if (on) { g.lineWidth = 8; g.beginPath(); g.arc(t.x, t.y, t.r, -1.57, -1.57 + 6.28 * S.dw.ms / DWELL); g.stroke(); }
    if (t.id === "go") { g.fillStyle = "#f0b429"; g.beginPath(); g.arc(t.x, t.y, 14, 0, 7); g.fill(); } });
  g.fillStyle = "#efeadf"; g.font = "22px Georgia"; g.textAlign = "center"; g.fillText(S.msg, W / 2, 40);
  g.font = "14px Georgia"; g.fillText(`Grid ${S.grid}x${S.grid}  Length ${S.len}  Trial ${S.n}`, W / 2, H - 16);
  if (!mouse && tracker && !tracker.tracked) { g.fillStyle = "#f0b429"; g.fillText("Show your hand to the camera", W / 2, H - 44); }
  g.fillStyle = "#f0b429"; g.beginPath(); g.arc(cur.x, cur.y, 11, 0, 7); g.fill();
}
function render(now) {
  view.width = innerWidth * devicePixelRatio; view.height = innerHeight * devicePixelRatio;
  vg.fillStyle = "#000"; vg.fillRect(0, 0, view.width, view.height);
  const panes = vr ? 2 : 1, pw = view.width / panes, s = Math.min(pw / W, view.height / H) * (vr ? .85 : .98);
  fit = {s: s / devicePixelRatio, x: (pw - W * s) / 2 / devicePixelRatio, y: (view.height - H * s) / 2 / devicePixelRatio};
  for (let i = 0; i < panes; i++) vg.drawImage(board, i * pw + (pw - W * s) / 2, (view.height - H * s) / 2, W * s, H * s);
}
let prev = performance.now();
(function loop(now) { const dt = now - prev; prev = now; if (tracker || mouse) { step(now, dt); draw(now); render(now); } requestAnimationFrame(loop); })(prev);

$("cam").onclick = async () => {
  say("Loading hand tracking..."); mouse = false;
  try { tracker?.stop(); tracker = new HandTracker(cfg); await tracker.start(); say(`Camera: ${cfg.facing}, mirror ${cfg.mirror ? "on" : "off"}`); navigator.wakeLock?.request("screen").catch(() => {}); }
  catch (e) { tracker = null; say("Camera failed: " + e.message + " (camera needs HTTPS or localhost)"); }
};
$("mouse").onclick = () => { mouse = true; say("Mouse mode: move the pointer over the dots"); };
$("flip").onclick = () => { cfg.facing = cfg.facing === "user" ? "environment" : "user"; cfg.mirror = cfg.facing === "user"; $("cam").click(); };
$("mir").onclick = () => { cfg.mirror = !cfg.mirror; if (tracker) tracker.mirror = cfg.mirror; say("Mirror " + (cfg.mirror ? "on" : "off")); };
$("vr").onclick = async () => { vr = true; $("bar").hidden = true; await document.documentElement.requestFullscreen?.().catch(() => {}); screen.orientation?.lock?.("landscape").catch(() => {}); };
view.addEventListener("pointerdown", () => { if (vr) { vr = false; $("bar").hidden = false; document.exitFullscreen?.().catch(() => {}); } });
view.addEventListener("pointermove", e => { mpos.x = (e.clientX - fit.x) / fit.s; mpos.y = (e.clientY - fit.y) / fit.s; });
$("exp").onclick = exportJSON; $("clr").onclick = () => confirm("Delete all stored trials on this device?") && clearTrials();
