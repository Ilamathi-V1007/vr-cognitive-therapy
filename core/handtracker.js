// Free, in-browser hand tracking (MediaPipe Hand Landmarker). Exposes the index fingertip as normalised x,y.
import {HandLandmarker, FilesetResolver} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export class HandTracker {
  constructor({facing = "environment", mirror = false} = {}) {
    Object.assign(this, {facing, mirror, x: .5, y: .5, seen: -1e9, last: 0, video: document.createElement("video")});
  }
  async start() {
    const fs = await FilesetResolver.forVisionTasks(BASE);
    const make = d => HandLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: MODEL, delegate: d}, runningMode: "VIDEO", numHands: 1});
    try { this.lm = await make("GPU"); } catch { this.lm = await make("CPU"); }
    this.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: this.facing}, width: {ideal: 480}, height: {ideal: 360}}, audio: false});
    Object.assign(this.video, {srcObject: this.stream, playsInline: true, muted: true});
    await this.video.play();
    this.on = true; this.loop();
  }
  loop() {
    if (!this.on) return;
    const t = performance.now();
    if (t - this.last >= 40 && this.video.readyState >= 2) {   // ~25 detections/s, decoupled from rendering
      this.last = t;
      const p = this.lm.detectForVideo(this.video, t).landmarks[0]?.[8];
      if (p) { this.x = this.mirror ? 1 - p.x : p.x; this.y = p.y; this.seen = t; }
    }
    requestAnimationFrame(() => this.loop());
  }
  get tracked() { return performance.now() - this.seen < 500; }
  stop() { this.on = false; this.stream?.getTracks().forEach(t => t.stop()); }
}
