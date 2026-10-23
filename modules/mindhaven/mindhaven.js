// Mindhaven: an island-themed front end for the shared CMCI-scored games (core/games.js).
// Rounds are saved to the same store as the Bloom hub, so progress here is derived from real scored rounds and shows up in the session report.
import {allTrials, saveTrial} from "../../core/storage.js";
import {roundResult, mean} from "../../core/games.js";
import {GAMES2 as GAMES} from "../../core/games2.js";
const $ = s => document.querySelector(s), app = $("#app"), live = $("#live"), N = 8, KEY = "mindhaven.v2";
const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let S = {onboarded: false, size: 1, contrast: false, motion: true, speak: false, ...J(KEY, {})}, LV = J("bloom.lv", {}), view = "home", arg = null, G = null, blocks = [];
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const say = t => { live.textContent = t; if (S.speak && "speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } };
const prefs = () => { document.documentElement.style.fontSize = [18, 22, 27][S.size] + "px"; document.body.classList.toggle("hc", S.contrast); document.body.classList.toggle("calm", !S.motion); };
const REG = {
  meadow: {n: "Memory Meadow", f: "memory", e: "🌻", x: 120, y: 200, c: "#8fb996", games: ["basket", "where"], keep: ["Golden Leaf", "A leaf that holds the first light of morning."], story: "A quiet garden full of keepsakes. Its colours return as you practise remembering."},
  forest: {n: "Focus Forest", f: "attention and flexibility", e: "🌲", x: 250, y: 90, c: "#5f9c8a", games: ["count", "stroop"], keep: ["Crystal Flower", "It hums softly when you give it your full attention."], story: "Lanterns hang between the trees. Follow their rules, even when the rules change."},
  village: {n: "Everyday Village", f: "planning", e: "🏡", x: 370, y: 200, c: "#e0a867", games: ["market"], keep: ["Glowing Seashell", "Carried to the village market by the tide."], story: "The market is open again. Every day goes better with a little planning."},
  library: {n: "Storybook Library", f: "language and reasoning", e: "📚", x: 175, y: 285, c: "#b9a9d6", games: ["opposites"], keep: ["Storybook", "Its pages fill with pictures whenever someone reads aloud."], story: "Shelves of stories wait for readers who enjoy a good connection."},
  bay: {n: "Discovery Bay", f: "patterns", e: "🗼", x: 330, y: 290, c: "#7fb4cf", games: ["compass"], keep: ["Miniature Lighthouse", "Its small light shows the way across the bay."], story: "A lighthouse stays dark until its pattern is complete."},
};
const CH = ["", "The Awakening: learn the paths and begin gently.", "The Explorer: visit every region of the isles.", "The Problem Solver: try the longer rounds.", "The Island Guardian: keep the isles glowing in your own way."];
const gm = id => GAMES.find(g => g.id === id), cnt = k => blocks.filter(r => REG[k].games.includes(r.module.slice(3))).length, chap = () => blocks.length < 3 ? 1 : blocks.length < 8 ? 2 : blocks.length < 15 ? 3 : 4;
const lastOf = id => blocks.filter(r => r.module === "mh:" + id).at(-1), regOf = id => Object.keys(REG).find(k => REG[k].games.includes(id));
const btn = (t, a, v = "", c = "") => `<button class="btn ${c}" data-act="${a}" data-v="${v}">${t}</button>`;
const part = (n, v) => v == null || isNaN(v) ? "" : `<div class="row"><span style="min-width:9rem">${n}</span><div class="bar" style="flex:1"><i style="width:${Math.round(100 * v)}%"></i></div><b>${Math.round(100 * v)}</b></div>`;

const ISLE = [   // living island: each round unlocks the next surprise (derived from the number of rounds played)
  [1, `<circle class="lant" cx="430" cy="48" r="26" fill="#ffd166"/>`, "The sun has risen over the isles! ☀️"],
  [2, `<rect x="232" y="300" width="34" height="26" fill="#e8a24c"/><path d="M226 300l23-22 23 22z" fill="#b4561f"/>`, "A cosy cottage has appeared between the library and the bay! 🏠"],
  [3, `<rect x="433" y="236" width="14" height="44" fill="#fff"/><path d="M430 236l10-14 10 14z" fill="#d9534f"/><circle class="lant" cx="440" cy="230" r="5" fill="#ffd166"/>`, "The lighthouse stands tall on the shore! 🗼"],
  [4, `<g class="boat"><path d="M20 346h50l-8 14H28z" fill="#b4561f"/><path d="M45 304v42l22-8z" fill="#fff"/></g>`, "A little boat has sailed into the bay! ⛵"],
  [5, `<text x="28" y="262" font-size="22">🌷🌼🌷</text>`, "Flowers are blooming along the shore! 🌷"],
  [6, `<rect class="lant" x="242" y="308" width="6" height="7" fill="#ffd166"/><rect class="lant" x="252" y="308" width="6" height="7" fill="#ffd166"/>`, "Lights are glowing in the cottage windows! 💡"],
  [8, `<text class="bird" x="0" y="34" font-size="22">🕊️</text><text class="bird" x="-120" y="64" font-size="18">🕊️</text>`, "Birds have returned to the sky! 🕊️"],
  [10, `<circle class="lant" cx="150" cy="150" r="3" fill="#ffe08a"/><circle class="lant" cx="205" cy="170" r="3" fill="#ffe08a"/><circle class="lant" cx="300" cy="170" r="3" fill="#ffe08a"/><circle class="lant" cx="90" cy="120" r="3" fill="#ffe08a"/>`, "Fireflies are dancing at dusk! ✨"],
  [12, `<path d="M40 130a70 70 0 0 1 140 0" fill="none" stroke="#e57373" stroke-width="6"/><path d="M48 130a62 62 0 0 1 124 0" fill="none" stroke="#ffd166" stroke-width="6"/><path d="M56 130a54 54 0 0 1 108 0" fill="none" stroke="#81c784" stroke-width="6"/>`, "A rainbow arches over the island! 🌈"],
];
const extras = () => ISLE.filter(x => blocks.length >= x[0]).map(x => x[1]).join("");
const nextNews = () => ISLE.find(x => x[0] > blocks.length);
function mapSvg() {
  const regs = Object.entries(REG).map(([k, r]) => `<g class="reg" tabindex="0" role="button" data-act="region" data-v="${k}" aria-label="${r.n}, ${r.f}. Rounds completed: ${cnt(k)}" style="filter:saturate(${(.3 + .7 * Math.min(1, cnt(k) / 3)).toFixed(2)})"><circle cx="${r.x}" cy="${r.y}" r="48" fill="${r.c}" stroke="#fff" stroke-width="4"/><text x="${r.x}" y="${r.y + 8}" font-size="30" text-anchor="middle">${r.e}</text><text x="${r.x}" y="${r.y + 70}" font-size="14" font-weight="700" text-anchor="middle" stroke="#fffdf7" stroke-width="4" paint-order="stroke">${r.n}</text></g>`).join("");
  const lamps = [[60, 60], [420, 70], [440, 190], [40, 190]].map(([x, y]) => `<circle class="lant" cx="${x}" cy="${y}" r="6" fill="#e8a24c"/>`).join("");
  return `<svg class="map" viewBox="0 0 480 380" role="group" aria-label="Map of the Memory Isles"><ellipse cx="240" cy="205" rx="225" ry="165" fill="#fbf6ea" opacity=".9"/><path d="M0 330q60-20 120 0t120 0 120 0 120 0v50H0z" fill="#7fb4cf" opacity=".5"/>${lamps}${extras()}${regs}</svg>`;
}
function onboard() { return `<div class="card"><h2>Welcome to Mindhaven</h2><p><b class="em" style="display:inline">🏮</b> <b>Hello, I am Lumi.</b> A little curiosity can lead to wonderful discoveries. Each round you play brings colour back to the Memory Isles.</p><p>Choose what is comfortable. You can change it later.</p>
  <label>Text size <select data-set="size" style="font:inherit"><option value="0">Standard</option><option value="1" selected>Large</option><option value="2">Extra large</option></select></label><br><label><input type="checkbox" data-set="motion" checked> Gentle animations</label><br><label><input type="checkbox" data-set="speak"> Read instructions aloud</label>
  <p>${btn("Begin", "begin", "", "pri")}${btn("Skip for now", "begin")}</p><small class="note">Mindhaven offers cognitive wellness activities for engagement and practice. It is not a medical assessment or a substitute for professional advice, diagnosis, or treatment.</small></div>`; }
function home() { const rest = Math.round(100 * Object.keys(REG).reduce((a, k) => a + Math.min(1, cnt(k) / 3), 0) / 5);
  return `<div class="card"><h2>Chapter ${chap()}</h2><p>${CH[chap()]}</p><p>Island restored: <b>${rest}%</b> · ⭐ ${blocks.length * 3} stars · 🗝️ ${S.onboarded ? Object.keys(REG).filter(k => cnt(k)).length : 0}/5 keepsakes</p><div class="bar" role="progressbar" aria-valuenow="${rest}" aria-valuemin="0" aria-valuemax="100"><i style="width:${rest}%"></i></div></div>${mapSvg()}<p class="note">Choose a region. Every round of ${N} questions restores a little more of the island.</p>`; }
function region() { const r = REG[arg], got = cnt(arg) > 0;
  return `<div class="card"><h2>${r.e} ${r.n}</h2><p>${r.story}</p><p><b>Focus:</b> ${r.f}</p><p>${got ? "🗝️ Keepsake found: <b>" + r.keep[0] + "</b>. " + r.keep[1] : "🗝️ A keepsake waits here for your first round."}</p>
  ${r.games.map(id => { const g = gm(id), l = lastOf(id); return `<div class="card"><b class="em" style="display:inline">${g.i}</b> <b>${g.t}</b><br><small class="note">Level ${LV[id] || 1} · ${l ? "Last round score " + l.cmci : "Not played yet"}</small><p>${g.how}</p>${btn("Play a round", "play", id, "pri")}</div>`; }).join("")}${btn("Back to the island", "nav", "home")}</div>`; }
function gameView() { const {g, tr, n} = G, head = `<div class="card"><div class="row"><h2>${g.i} ${g.t}</h2><span class="note">Level ${G.L} · Question ${n + 1} of ${N}</span></div><div class="bar" aria-hidden="true"><i style="width:${100 * n / N}%"></i></div><p>${g.how}</p>`;
  if (G.ph === "study") return head + `<p><b>Remember these:</b></p><div class="row">${tr.study.map(o => `<div class="card">${o.html}</div>`).join("")}</div>${btn("I am ready", "ready", "", "pri")}</div>`;
  if (G.fb) return head + `<h2 class="pop">${G.fb}</h2></div>`;
  return head + `<p><b>${tr.q}</b></p>${tr.hint ? `<p class="note">${esc(tr.hint)}</p>` : ""}<div class="row">${(tr.show || []).map(o => `<div class="card">${o.html}</div>`).join("")}</div><div class="row">${tr.opts.map((o, i) => `<button class="btn opt" data-act="pick" data-v="${i}" aria-label="${esc(o.label)}">${o.html}</button>`).join("")}</div><p>${btn("Stop for now", "nav", "home")}</p></div>`; }
function done() { const {g, res: r, L, rg, first} = G, R = REG[rg];
  return `<div class="card pop"><h2>🌟 ${R.n} grows brighter!</h2><p>You earned ⭐⭐⭐ for taking part.</p>${ISLE.filter(x => x[0] === blocks.length).map(x => `<p class="pop" style="background:#fff3c4;border-radius:1rem;padding:.7rem"><b>Island news:</b> ${x[2]}</p>`).join("")}${nextNews() ? `<p class="note">Next surprise on the island in ${nextNews()[0] - blocks.length} more round${nextNews()[0] - blocks.length > 1 ? "s" : ""}.</p>` : "<p class=\"note\">The island is fully alive. Keep it glowing!</p>"}${first ? `<p>🗝️ <b>New keepsake: ${R.keep[0]}</b><br>${R.keep[1]}</p>` : ""}<h3>Round score (CMCI): ${r.val} / 100</h3>${part("Thinking", r.c.C)}${part("Steadiness", r.c.M)}${part("Recovery", r.c.E)}${part("Flexibility", r.c.DT)}
  <p>${r.fatigue ? "A longer break might feel nice before the next round. " : ""}Next time we suggest ${r.nl > L ? "a little harder" : r.nl < L ? "a little easier" : "the same"} level (${r.nl}). This only tunes the game and says nothing about your health.</p>${btn("Play again", "play", g.id, "pri")}${btn("Back to the island", "nav", "home")}<a class="btn" href="../hub/#report" style="text-decoration:none;display:inline-block;line-height:2.2rem">Session report</a></div>`; }
function progress() { const rows = Object.entries(REG).map(([k, r]) => { const x = blocks.filter(b => r.games.includes(b.module.slice(3))); return `<div class="row"><span style="min-width:11rem">${r.e} ${r.n}</span><div class="bar" style="flex:1"><i style="width:${x.length ? mean(x.map(b => b.cmci)) : 0}%"></i></div><b>${x.length ? Math.round(mean(x.map(b => b.cmci))) : "-"}</b><small>(${x.length} rounds)</small></div>`; }).join("");
  return `<div class="card"><h2>Your progress</h2><p>Chapter ${chap()} · ${blocks.length} rounds · ⭐ ${blocks.length * 3} stars · Regions visited ${Object.keys(REG).filter(k => cnt(k)).length}/5</p><p>${blocks.length ? "Thank you for taking part. Every visit counts." : "Your first discovery is waiting on the island."}</p></div>
  <div class="card"><h3>Average round score (CMCI) by region</h3>${rows}<p><small class="note">Scores vary with sleep, mood, vision, hearing and familiarity. One result means nothing on its own.</small></p></div>
  <div class="card"><a class="btn pri" href="../hub/#report" style="text-decoration:none;display:inline-block;line-height:2.2rem">Open the session report</a><p><small class="note">A printable record of every round, to discuss with a clinician. Not a diagnostic report.</small></p></div>`; }
function settings() { return `<div class="card"><h2>Settings</h2><label>Text size <select data-set="size" style="font:inherit">${["Standard", "Large", "Extra large"].map((t, i) => `<option value="${i}" ${S.size === i ? "selected" : ""}>${t}</option>`).join("")}</select></label><br><label><input type="checkbox" data-set="contrast" ${S.contrast ? "checked" : ""}> High contrast</label><br><label><input type="checkbox" data-set="motion" ${S.motion ? "checked" : ""}> Gentle animations</label><br><label><input type="checkbox" data-set="speak" ${S.speak ? "checked" : ""}> Read instructions aloud</label><p><small class="note">Everything is stored on this device only.</small></p></div>`; }
function help() { return `<div class="card"><h2>Help and safety</h2><p>Mindhaven offers cognitive wellness activities for engagement and practice. It is not a medical assessment or a substitute for professional advice, diagnosis, or treatment. It does not prevent, cure or slow dementia.</p><p>If you notice new, persistent or worsening difficulties with memory or thinking, please talk to a qualified healthcare professional.</p><p>There is no timer. Stop at any time with "Stop for now".</p></div>`; }

function start(id) { G = {g: gm(id), L: LV[id] || 1, ctx: {}, n: 0, R: []}; view = "game"; nextQ(); }
function nextQ() { G.tr = G.g.make(G.L, G.ctx); G.ph = G.tr.study ? "study" : "play"; if (G.ph === "play") G.t0 = performance.now(); render(); say(G.g.how); }
function pick(i, el, ev) { const o = G.tr.opts[i], rt = performance.now() - G.t0, r = el.getBoundingClientRect(), ok = o.k === G.tr.ans;
  const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)), prec = ev.clientX || ev.clientY ? 1 - .5 * Math.min(1, d / (Math.hypot(r.width, r.height) / 2)) : null;
  G.R.push({ok, rt, prec, cond: G.tr.cond || "stable", pe: G.R.length > 0 && !G.R.at(-1).ok}); G.n++; G.fb = ok ? "Lovely! ✔" : "Good try! On to the next."; say(G.fb); render();
  setTimeout(() => { G.fb = null; G.n >= N ? finish() : nextQ(); }, 900); }
async function finish() { const {g, L, R} = G, rg = regOf(g.id), first = cnt(rg) === 0, res = roundResult(g, L, R, blocks.filter(r => r.module === "mh:" + g.id).map(r => r.cmci));
  LV[g.id] = res.nl; put("bloom.lv", LV); await saveTrial({module: "mh:" + g.id, type: "block", ts: Date.now(), cmci: res.val, ...res.c, level: L, accuracy: +res.acc.toFixed(2), fatigue: res.fatigue, via: "mindhaven"});
  Object.assign(G, {res, rg, first}); view = "done"; render(); say("Round complete"); }
async function render() { prefs(); if (view !== "game") blocks = (await allTrials()).filter(r => r.type === "block" && r.cmci != null && r.module.startsWith("mh:"));
  const cur = ["region", "game", "done"].includes(view) ? "home" : view; document.querySelectorAll("nav button").forEach(x => x.dataset.v === cur ? x.setAttribute("aria-current", "page") : x.removeAttribute("aria-current"));
  app.innerHTML = !S.onboarded ? onboard() : ({home, region, game: gameView, done, progress, settings, help}[view])(); }
const go = (v, a) => { view = v; arg = a; render(); app.focus(); scrollTo(0, 0); };
document.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act, v = el.dataset.v;
  if (a === "nav") go(v); else if (a === "region") go("region", v); else if (a === "play") start(v); else if (a === "begin") { S.onboarded = true; put(KEY, S); go("home"); }
  else if (a === "ready") { G.ph = "play"; G.t0 = performance.now(); render(); } else if (a === "pick" && !G.fb) pick(+v, el, e); });
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("g[data-act]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", {bubbles: true})); } });
document.addEventListener("change", e => { const k = e.target.dataset.set; if (!k) return; S[k] = e.target.type === "checkbox" ? e.target.checked : +e.target.value; put(KEY, S); prefs(); });
render();
