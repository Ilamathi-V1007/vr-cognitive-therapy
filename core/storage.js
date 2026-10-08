// Offline trial storage (IndexedDB) + JSON export. Nothing leaves the device.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open("vrct", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("trials", {autoIncrement: true});
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const run = async (mode, fn) => { const db = await open();
  return new Promise((res, rej) => { const t = db.transaction("trials", mode); const q = fn(t.objectStore("trials"));
    t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); }); };
export const saveTrial = r => run("readwrite", s => s.add(r));
export const allTrials = () => run("readonly", s => s.getAll());
export const clearTrials = () => run("readwrite", s => s.clear());
export async function exportJSON() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(await allTrials(), null, 1)], {type: "application/json"}));
  a.download = `kolam-session-${Date.now()}.json`; a.click();
}
