// Fotos: compresión (máx. 1600 px, JPEG 0,75), GPS y almacenamiento en IndexedDB.
import { db, uid } from './db.js';

let posCache = null, posTime = 0;
export function gps() {
  if (posCache && Date.now() - posTime < 120000) return Promise.resolve(posCache);
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => { posCache = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy) }; posTime = Date.now(); res(posCache); },
      () => res(null), { timeout: 6000, maximumAge: 120000, enableHighAccuracy: true });
  });
}

export async function comprimir(file, max = 1600, calidad = 0.75) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', calidad));
  return { blob, w, h };
}

export async function guardarFoto(file, mant, paso) {
  const [{ blob, w, h }, pos] = await Promise.all([comprimir(file), gps()]);
  const f = { id: uid('f'), mant, paso, blob, w, h, fecha: new Date().toISOString(), gps: pos };
  await db.put('fotos', f);
  return f.id;
}

export const getFoto = id => db.get('fotos', id);
export const borrarFoto = id => db.del('fotos', id);

const urls = new Map();
export async function urlFoto(id) {
  if (urls.has(id)) return urls.get(id);
  const f = await getFoto(id);
  if (!f) return '';
  const u = URL.createObjectURL(f.blob);
  urls.set(id, u);
  return u;
}
