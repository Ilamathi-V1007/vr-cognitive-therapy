// Shared therapy games and CMCI round scoring, used by the Bloom hub and the Mindhaven island.
import {cmci, decide, dtScore, clamp} from "./cmci.js";
export const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sh = a => [...a].sort(() => Math.random() - .5), rnd = a => a[Math.floor(Math.random() * a.length)], esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
export const D = {mem: ["Memory", "🧠"], att: ["Attention", "🎯"], lang: ["Language", "📖"], rea: ["Reasoning", "🧩"], vis: ["Patterns", "🔷"], exe: ["Planning", "🗓️"]};
const OBJ = [["🍎", "apple"], ["🔑", "key"], ["📖", "book"], ["🕯️", "candle"], ["🧣", "scarf"], ["🍯", "honey jar"], ["🌻", "sunflower"], ["🧺", "basket"], ["⏰", "clock"], ["🍐", "pear"], ["🎩", "hat"], ["🪴", "plant"]];
const CATS = [[["🍎", "apple"], ["🍐", "pear"], ["🍌", "banana"], ["🍇", "grapes"]], [["🔨", "hammer"], ["🪚", "saw"], ["🔧", "wrench"], ["🪛", "screwdriver"]], [["🐈", "cat"], ["🐕", "dog"], ["🐇", "rabbit"], ["🐦", "bird"]], [["🎻", "violin"], ["🎺", "trumpet"], ["🥁", "drum"], ["🎹", "piano"]], [["🚲", "bicycle"], ["🚌", "bus"], ["🚂", "train"], ["⛵", "boat"]]];
const SHP = [["●", "red circle", "#d9534f"], ["■", "blue square", "#2f6fbf"], ["▲", "green triangle", "#3d9a5b"], ["◆", "purple diamond", "#8a5bbf"], ["★", "orange star", "#e08a1e"]];
const PIC = [["🐘", "elephant"], ["🍞", "bread"], ["⛵", "boat"], ["🔔", "bell"], ["🚲", "bicycle"], ["🌙", "moon"], ["🧤", "gloves"], ["🪑", "chair"], ["🐝", "bee"], ["☂️", "umbrella"]];
const ROUT = [["Wake up", "Wash your face", "Get dressed", "Eat breakfast", "Go for a walk"], ["Boil the water", "Put tea in the cup", "Pour the water", "Wait a few minutes", "Add milk"], ["Take an umbrella", "Open the door", "Walk to the market", "Buy vegetables", "Come home"]];
const it = ([e, n]) => ({k: n, label: n, html: `<b class="em">${e}</b><span>${esc(n)}</span>`}), sp = ([e, n, c]) => ({k: n, label: n, html: `<b class="em" style="color:${c}">${e}</b><span>${n}</span>`}), tx = t => ({k: t, label: t, html: `<span>${esc(t)}</span>`});
// Each game: make(level, ctx) returns one trial with exactly one correct answer. ref = scoring scale in ms (not enforced; play is untimed).
export const GAMES = [
  {id: "missing", t: "Missing Keepsake", d: "mem", i: "🧺", ref: 10000, how: "Look at the items, press Ready, then pick the one that disappeared.", make(L) { const s = sh(OBJ), n = 2 + L, sc = s.slice(0, n + 1), g = sc[0]; return {study: sc.map(it), q: "Which item disappeared?", show: sc.slice(1).map(it), opts: sh([g, ...s.slice(n + 1, n + 4)]).map(it), ans: g[1]}; }},
  {id: "odd", t: "The Odd One Out", d: "rea", i: "🧩", ref: 10000, how: "Most of these belong together. Pick the one that does not.", make(L) { const [a, b] = sh(CATS), k = Math.min(4, 2 + Math.ceil(L / 2)), o = rnd(b); return {q: "Which one does not belong?", opts: sh([...sh(a).slice(0, k), o]).map(it), ans: o[1]}; }},
  {id: "pattern", t: "Pattern Garden", d: "vis", i: "🔷", ref: 12000, how: "Look at the pattern and choose the shape that comes next.", make(L) { const u = sh(SHP), base = [[0, 1], [0, 0, 1], [0, 1, 2], [0, 0, 1, 2], [0, 1, 2, 1]][L - 1], seq = [...base, ...base, ...base].slice(0, base.length * 2 + 1); return {q: "Which shape comes next?", show: seq.map(i => sp(u[i])), opts: sh(u.slice(0, 4)).map(sp), ans: u[base[seq.length % base.length]][1]}; }},
  {id: "lamps", t: "Lantern Rules", d: "att", i: "🏮", ref: 6000, how: "Match each lantern to the rule: Green means Left, Blue means Right, Red means Stay. Sometimes the rule changes.", make(L, c) { c.rule ||= {Green: "Left", Blue: "Right"}; c.since = (c.since ?? 9) + 1; c.swaps ||= 0; if (c.since >= [99, 10, 8, 6, 5][L - 1] && c.swaps < 9) { c.rule = {Green: c.rule.Blue, Blue: c.rule.Green}; c.swaps++; c.since = 0; c.note = "The rule has changed!"; } const col = Math.random() < .25 ? "Red" : rnd(["Green", "Blue"]), hex = {Red: "#d9534f", Green: "#3d9a5b", Blue: "#2f6fbf"}[col]; return {q: "What does this lantern ask for?", cond: c.swaps && c.since <= 3 ? "uncertain" : "stable", show: [{html: `<b class="em" style="color:${hex}">🏮</b><span>${col} lantern</span>`}], hint: L <= 2 ? `Green: ${c.rule.Green}. Blue: ${c.rule.Blue}. Red: Stay.` : c.note, opts: ["Left", "Right", "Stay"].map(tx), ans: col === "Red" ? "Stay" : c.rule[col]}; }},
  {id: "words", t: "Name That Picture", d: "lang", i: "📖", ref: 9000, how: "Look at the picture and choose its name.", make(L) { const s = sh(PIC), a = s[0]; return {q: "What is this?", show: [{html: `<b class="em">${a[0]}</b>`}], opts: sh(s.slice(0, 2 + L > 6 ? 6 : 2 + L)).map(x => tx(x[1])), ans: a[1]}; }},
  {id: "next", t: "What Comes Next", d: "exe", i: "🗓️", ref: 12000, how: "Read the steps so far and choose the step that comes next.", make(L) { const r = rnd(ROUT), n = Math.min(4, 1 + Math.ceil(L / 2) + 0), at = Math.min(r.length - 1, n), dec = sh(ROUT.flat().filter(s => !r.includes(s))).slice(0, 1 + Math.ceil(L / 2)); return {q: "What comes next?", show: r.slice(0, at).map(tx), opts: sh([r[at], ...dec]).map(tx), ans: r[at]}; }},
];
export function score(R, ref) {   // CMCI components for one round (0..1, higher = better)
  const ok = R.filter(r => r.ok), rt = mean(ok.map(r => r.rt)), acc = mean(R.map(r => +r.ok)), pr = R.map(r => r.prec).filter(v => v != null), Pe = R.filter(r => r.pe), f = r => r.ok ? clamp(1 - r.rt / ref) : 0;
  return {C: mean([acc, isNaN(rt) ? 0 : clamp(1 - rt / ref)]), M: pr.length ? mean(pr) : .8,                                   // C: accuracy + speed; M: tap steadiness
    E: Pe.length ? mean([mean(Pe.map(r => +r.ok)), isNaN(rt) ? 1 : clamp(1 - Math.max(0, mean(Pe.map(r => r.rt)) - rt) / (.5 * ref))]) : 1, // E: recovery after a mistake
    DT: dtScore(R.filter(r => r.cond !== "uncertain").map(f), R.filter(r => r.cond === "uncertain").map(f))};                    // DT: cost after a rule change
}

// End-of-round result: CMCI, fatigue flag and the suggested next level (h = this game's previous CMCI values).
export function roundResult(g, L, R, h) {
  const c = score(R, g.ref), val = cmci(c), half = R.length / 2, acc = a => mean(a.map(r => +r.ok));
  const fatigue = (h.length && h.at(-1) - val >= 20) || acc(R.slice(half)) <= acc(R.slice(0, half)) - .3, d = decide(h.slice(-3), val, fatigue);
  return {c, val, fatigue, acc: acc(R), nl: clamp(L + d.move, 1, 5)};
}
