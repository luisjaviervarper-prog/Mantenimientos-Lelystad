// Acceso: huella / Face ID con WebAuthn (desbloqueo local) y PIN de respaldo.
import { db } from './db.js';

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 5 * 60 * 1000;
export const AUTOBLOQUEO_MS = 10 * 60 * 1000;

export async function hashPin(pin, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}

export async function getUsuario() { return db.kvGet('usuario'); }

export async function registrar(datos, pin) {
  const h = await hashPin(pin);
  const u = { ...datos, pinSalt: h.salt, pinHash: h.hash, creado: new Date().toISOString(), credId: null };
  await db.kvSet('usuario', u);
  return u;
}

export async function cambiarPin(pin) {
  const u = await getUsuario();
  const h = await hashPin(pin);
  u.pinSalt = h.salt; u.pinHash = h.hash;
  await db.kvSet('usuario', u);
}

export async function huellaDisponible() {
  try {
    return !!(window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export async function activarHuella() {
  const u = await getUsuario();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'OSMOS Mantenimiento' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: u.email || u.nombre, displayName: u.nombre },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  u.credId = b64(cred.rawId);
  await db.kvSet('usuario', u);
  return true;
}

export async function desactivarHuella() {
  const u = await getUsuario();
  u.credId = null;
  await db.kvSet('usuario', u);
}

export async function entrarConHuella() {
  const u = await getUsuario();
  if (!u?.credId) throw new Error('Huella no activada');
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(u.credId), transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  // Sin servidor: la verificación de la huella la hace el sistema operativo del móvil.
  // Comprobamos que responde la credencial registrada en este dispositivo.
  return !!a && b64(a.rawId) === u.credId;
}

export async function estadoBloqueo() {
  const s = (await db.kvGet('intentos')) || { n: 0, hasta: 0 };
  return s;
}

export async function entrarConPin(pin) {
  const s = await estadoBloqueo();
  if (s.hasta > Date.now()) return { ok: false, bloqueado: s.hasta };
  const u = await getUsuario();
  const h = await hashPin(pin, u.pinSalt);
  if (h.hash === u.pinHash) {
    await db.kvSet('intentos', { n: 0, hasta: 0 });
    return { ok: true };
  }
  s.n += 1;
  if (s.n >= MAX_INTENTOS) { s.hasta = Date.now() + BLOQUEO_MS; s.n = 0; }
  await db.kvSet('intentos', s);
  return { ok: false, restantes: s.hasta > Date.now() ? 0 : MAX_INTENTOS - s.n, bloqueado: s.hasta > Date.now() ? s.hasta : 0 };
}
