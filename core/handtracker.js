// Free, in-browser hand tracking (MediaPipe Hand Landmarker). Exposes the index fingertip as normalised x,y.
// Add ?debug=1 to any page URL to see camera size, delegate (GPU/CPU), frames/s, hand detections/s, ms per detection and errors.
import {HandLandmarker, FilesetResolver} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const DEBUG = new URLSearchParams(location.search).has("debug");
export class HandTracker {
  constructor({facing = "environment", mirror = false} = {}) {
    Object.assign(this, {facing, mirror, x: .5, y: .5, seen: -1e9, lastVT: -1, lastFrame: 0, n: 0, hits: 0, errs: 0, ms: 0, dbgT: 0, video: document.createElement("video")});
  }
  async openCam() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: this.facing}, width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30}}, audio: false});
    Object.assign(this.video, {srcObject: this.stream, playsInline: true, muted: true});
    await this.video.play(); this.lastFrame = performance.now();
  }
  async start() {
    const fs = await FilesetResolver.forVisionTasks(BASE);
    const make = d => HandLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: MODEL, delegate: d}, runningMode: "VIDEO", numHands: 1,
      minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4});
    try { this.lm = await make("GPU"); this.delegate = "GPU"; } catch { this.lm = await make("CPU"); this.delegate = "CPU"; }
    await this.openCam();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && this.on) this.video.play().catch(() => {}); });
    if (DEBUG) this.dbg = document.body.appendChild(Object.assign(document.createElement("div"), {style: "position:fixed;bottom:4px;left:4px;z-index:9;font:12px monospace;color:#f0b429;background:#000a;padding:2px 6px"}));
    this.on = true; this.loop();
  }
  loop() {
    if (!this.on) return;
    const v = this.video, t = performance.now();
    try {                                                           // an error must never kill the loop (that caused "stuck" tracking)
      if (v.readyState >= 2 && v.currentTime !== this.lastVT) {     // detect once per new camera frame
        this.lastVT = v.currentTime; this.lastFrame = t;
        const t0 = performance.now(), p = this.lm.detectForVideo(v, t).landmarks[0]?.[8];
        this.ms = performance.now() - t0; this.n++;
        if (p) { this.x = this.mirror ? 1 - p.x : p.x; this.y = p.y; this.seen = t; this.hits++; }
      }
    } catch (e) { this.errs++; this.lastErr = e.message; }
    if (t - this.lastFrame > 3000 && !this.reopening) {              // camera frozen: restart it
      this.reopening = true; this.video.play().catch(() => {});
      this.openCam().catch(() => {}).finally(() => { this.reopening = false; this.lastFrame = performance.now(); });
    }
    if (DEBUG && t - this.dbgT > 1000) { this.dbg.textContent = `${v.videoWidth}x${v.videoHeight} ${this.delegate} frames/s ${this.n} hand ${this.hits} ${this.ms.toFixed(0)}ms err ${this.errs}${this.lastErr ? " " + this.lastErr.slice(0, 40) : ""}`; this.n = this.hits = 0; this.dbgT = t; }
    requestAnimationFrame(() => this.loop());
  }
  get tracked() { return performance.now() - this.seen < 700; }      // a little more tolerant of brief dropouts
  stop() { this.on = false; this.stream?.getTracks().forEach(t => t.stop()); this.dbg?.remove(); }
}
