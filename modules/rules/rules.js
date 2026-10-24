import {HandTracker} from "../../core/handtracker.js";
import {saveTrial, exportJSON, clearTrials} from "../../core/storage.js";
import {cmci, decide, dtScore, clamp} from "../../core/cmci.js";
const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const W = 640, H = 480, DWELL = 600, BLOCK = 10, HOLD = 500;
const board = Object.assign(document.createElement("canvas"), {width: W, height: H}), g = board.getContext("2d");
const view = $("view"), vg = view.getContext("2d");
const mobile = /Android|iPhone/i.test(navigator.userAgent);
const cfg = {facing: q.get("cam") || (mobile ? "environment" : "user")};
cfg.mirror = q.has("mirror") ? q.get("mirror") === "1" : cfg.facing === "user";
let tracker = null, mouse = false, vr = false, fit = {x: 0, y: 0, s: 1};
const cur = {x: W / 2, y: H / 2}, mpos = {x: W / 2, y: H / 2};
const COL = {green: "#3d9a5b", blue: "#2f6fbf", red: "#d9534f"}, NAME = {L: "LEFT", R: "RIGHT"};
// Difficulty levels: response window (ms), trials between silent rule swaps, whether the rule reminder stays visible
const LV = [{win: 4000, sw: 999, leg: 1}, {win: 3500, sw: 12, leg: 1}, {win: 3000, sw: 10, leg: 1}, {win: 3000, sw: 8, leg: 0}, {win: 2500, sw: 6, leg: 0}, {win: 2000, sw: 5, leg: 0}];
const S = {phase: "idle", level: 0, rule: {green: "L", blue: "R"}, prev: {green: "L", blue: "R"}, pend: false, since: 0, color: "", isSwitch: false,
  tStim: 0, t: 0, ready: 0, n: 0, block: [], log: [], score: 0, dw: {ms: 0, lock: false}, msg: "Hold your fingertip on the circle to begin", sub: "", sub2: "", swaps: 0, cm: [], restUntil: 0, samp: [], sx: 0, sy: 0, tOn: null};
const zone = x => x < W * .28 ? "L" : x > W * .72 ? "R" : null, inC = x => Math.abs(x - W / 2) < W * .14;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN, f0 = v => isNaN(v) ? "n/a" : Math.round(v);

// Scoring (standard paradigms): accuracy, go RT, inhibition rate (no-go success), switch cost (RT on first go trial after a rule swap minus repeat trials)
function summary() {
  const L = S.log, go = L.filter(r => r.color !== "red"), red = L.filter(r => r.color === "red");
  const rt = (a) => mean(a.filter(r => r.correct).map(r => r.rtMs));
  const cost = rt(go.filter(r => r.isSwitch)) - rt(go.filter(r => !r.isSwitch));
  return `Accuracy ${f0(100 * mean(L.map(r => +r.correct)))}%  |  Go RT ${f0(rt(go))} ms  |  Stop ${f0(100 * mean(red.map(r => +r.correct)))}%  |  Switch cost ${f0(cost)} ms`;
}
function nextTrial() {
  const lv = LV[S.level], r = Math.random(); S.msg = ""; S.sub = ""; S.sub2 = "";
  S.color = r < .25 ? "red" : r < .625 ? "green" : "blue";
  if (++S.since >= lv.sw) { S.prev = {...S.rule}; S.rule = {green: S.rule.blue, blue: S.rule.green}; S.pend = true; S.swaps++; S.since = 0; if (lv.leg) S.sub = "The rule has changed"; }
  S.isSwitch = S.pend && S.color !== "red"; if (S.isSwitch) S.pend = false;
  Object.assign(S, {phase: "ready", ready: 0});
}
function respond(dir, el) {
  const win = LV[S.level].win, red = S.color === "red", exp = red ? null : S.rule[S.color];
  const correct = red ? dir === null : dir === exp;
  const err = correct ? null : red ? "commission" : dir === null ? "omission" : "wrong";
  const persev = err === "wrong" && S.prev[S.color] !== S.rule[S.color] && dir === S.prev[S.color] && S.since <= 3;
  const rec = {module: "rules", ts: Date.now(), trial: ++S.n, level: S.level, color: S.color, isSwitch: S.isSwitch, expected: exp, response: dir, correct, err, persev,
    rtMs: dir ? Math.round(el) : null, windowMs: win, points: correct ? 10 + (!red && el < win / 2 ? 5 : 0) : 0, input: mouse ? "mouse" : cfg.facing};
  let path = 0; for (let i = 1; i < S.samp.length; i++) path += Math.hypot(S.samp[i].x - S.samp[i - 1].x, S.samp[i].y - S.samp[i - 1].y);
  const st = S.samp.length ? Math.hypot(S.samp.at(-1).x - S.sx, S.samp.at(-1).y - S.sy) : 0;
  Object.assign(rec, {afterSwap: S.swaps > 0 && S.since <= 3, onsetMs: S.tOn ? Math.round(S.tOn - S.tStim) : null, pathEff: path > 5 ? +clamp(st / path).toFixed(2) : null});
  S.log.push(rec); S.block.push(rec); S.score += rec.points; saveTrial(rec);
  Object.assign(S, {phase: "feedback", t: performance.now(), msg: correct ? "Good" : err === "commission" ? "That one means stay still" : err === "omission" ? "A little quicker next time" : "Check the rule", sub: ""});
}
const pal = () => vr ? {BG: "#24424a", INK: "#fff3dc", ACC: "#ffb454", ZONE: "#335a64"} : {BG: "#fff3dc", INK: "#2f3d3c", ACC: "#e8833a", ZONE: "#ffe3c2"};
function blockEnd(now) {
  const B = S.block, win = LV[S.level].win; S.block = [];
  const go = B.filter(r => r.color !== "red"), red = B.filter(r => r.color === "red"), ok = go.filter(r => r.correct), nz = v => isNaN(v) ? 0 : v;
  const rtM = mean(ok.map(r => r.rtMs)), sw = ok.filter(r => r.isSwitch), rp = ok.filter(r => !r.isSwitch);
  const cost = sw.length && rp.length ? mean(sw.map(r => r.rtMs)) - mean(rp.map(r => r.rtMs)) : NaN;
  const C = nz(mean([go.length ? ok.length / go.length : NaN, red.length ? mean(red.map(r => +r.correct)) : NaN, clamp(1 - rtM / win), clamp(1 - Math.max(0, cost) / (.5 * win))].filter(v => !isNaN(v))));   // accuracy, stop rate, speed, switch cost
  const M = nz(mean(ok.map(r => ((1 - Math.min(1, (r.onsetMs ?? win) / win)) + (r.pathEff ?? .5)) / 2)));                                                                                                 // initiation latency + path efficiency (drift)
  const P = B.filter((r, i) => i && !B[i - 1].correct), prt = mean(P.filter(r => r.rtMs).map(r => r.rtMs));
  const E = P.length ? mean([mean(P.map(r => +r.correct)), isNaN(prt) || isNaN(rtM) ? 1 : clamp(1 - Math.max(0, prt - rtM) / (.3 * win))]) : 1;                                                           // post-error recovery + correction delay
  const perf = r => r.correct ? (r.color === "red" ? 1 : clamp(1 - r.rtMs / win)) : 0;
  const DT = dtScore(B.filter(r => !r.afterSwap).map(perf), B.filter(r => r.afterSwap).map(perf));                                                                                                       // stable rule vs just after a rule swap
  const comps = {C, M, E, DT}, val = cmci(comps), half = B.length / 2, acc = a => mean(a.map(r => +r.correct));
  const fatigue = (S.cm.length && S.cm.at(-1) - val >= 20) || acc(B.slice(half)) <= acc(B.slice(0, half)) - .3;
  const d = decide(S.cm, val, fatigue); S.cm.push(val); S.level = clamp(S.level + d.move, 0, 5);
  const p = v => v == null ? "-" : Math.round(100 * v);
  saveTrial({module: "rules", type: "block", ts: Date.now(), cmci: val, ...comps, fatigue, move: d.move, level: S.level});
  Object.assign(S, {phase: "rest", restUntil: now + (fatigue ? 20000 : 4000), msg: fatigue ? "Please rest for a little while" : "🌸 +1 flower, ⭐ +3. Rest, then hold the circle", sub: `CMCI ${val}   C ${p(C)}  M ${p(M)}  E ${p(E)}  DT ${p(DT)}`, sub2: summary()});
}
function step(now, dt) {
  const raw = mouse ? mpos : {x: (tracker.x - .1) / .8 * W, y: (tracker.y - .1) / .8 * H};
  cur.x += (Math.min(W, Math.max(0, raw.x)) - cur.x) * .35; cur.y += (Math.min(H, Math.max(0, raw.y)) - cur.y) * .35;
  const ok = mouse || tracker.tracked;
  if (S.phase === "ready") { S.msg = S.msg || "Bring your hand to the middle"; S.ready = ok && inC(cur.x) ? S.ready + dt : 0; if (S.ready >= HOLD) Object.assign(S, {phase: "stim", tStim: now, sx: cur.x, sy: cur.y, samp: [], tOn: null}); }
  if (S.phase === "stim") { if (!ok) S.tStim += dt; else { S.samp.push({x: cur.x, y: cur.y}); if (!S.tOn && Math.hypot(cur.x - S.sx, cur.y - S.sy) > 14) S.tOn = now; const el = now - S.tStim, z = zone(cur.x); if (z) respond(z, el); else if (el >= LV[S.level].win) respond(null, el); } }
  if (S.phase === "feedback" && now - S.t > 800) {
    if (S.block.length >= BLOCK) blockEnd(now); else nextTrial();
  }
  const go = (S.phase === "idle" || (S.phase === "rest" && now >= S.restUntil)) && ok && Math.hypot(cur.x - W / 2, cur.y - H / 2) < 63;
  if (!go) S.dw = {ms: 0, lock: false}; else if (!S.dw.lock && (S.dw.ms += dt) >= DWELL) { S.dw.lock = true; nextTrial(); }
}
function draw(now) {
  const {BG, INK, ACC, ZONE} = pal();
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  if (tracker && !mouse && !vr) { g.save(); g.globalAlpha = .22; if (cfg.mirror) { g.translate(W, 0); g.scale(-1, 1); } g.drawImage(tracker.video, 0, 0, W, H); g.restore(); }
  const play = !["idle", "rest"].includes(S.phase);
  g.textAlign = "center";
  if (play) { g.fillStyle = ZONE; g.fillRect(0, 100, W * .28, 280); g.fillRect(W * .72, 100, W * .28, 280);
    g.fillStyle = INK; g.font = "20px Georgia"; g.fillText("< LEFT", W * .14, 245); g.fillText("RIGHT >", W * .86, 245);
    g.strokeStyle = ACC; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, 70, 0, 7); g.stroke();
    if (S.phase === "stim" || S.phase === "feedback") { g.fillStyle = COL[S.color]; g.beginPath(); g.arc(W / 2, H / 2, 46, 0, 7); g.fill(); }
    if (LV[S.level].leg) { g.font = "15px Georgia"; const items = [["green", `Green: ${NAME[S.rule.green]}`], ["blue", `Blue: ${NAME[S.rule.blue]}`], ["red", "Red: STAY"]];
      items.forEach(([c, t], i) => { g.fillStyle = COL[c]; g.fillText(t, W * (.2 + .3 * i), 96); }); } }
  else { g.strokeStyle = ACC; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, 55, 0, 7); g.stroke();
    if (S.dw.ms) { g.lineWidth = 8; g.beginPath(); g.arc(W / 2, H / 2, 55, -1.57, -1.57 + 6.28 * S.dw.ms / DWELL); g.stroke(); }
    g.fillStyle = ACC; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, 7); g.fill(); }
  g.fillStyle = INK; g.font = "22px Georgia"; g.fillText(S.msg, W / 2, 40);
  g.font = "15px Georgia"; g.fillText(S.sub, W / 2, 68); g.fillText(S.sub2, W / 2, 92);
  g.font = "14px Georgia"; g.fillText(`Level ${S.level + 1}  CMCI ${S.cm.at(-1) ?? "-"}  Points ${S.score}  Trial ${S.n}`, W / 2, H - 16);
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
