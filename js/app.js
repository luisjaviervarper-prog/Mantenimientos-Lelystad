// OSMOS Mantenimiento — interfaz principal
import { db, uid } from './db.js';
import * as auth from './auth.js';
import { t, tPaso, setIdioma, getIdioma } from './i18n.js';
import { datos, instalacion, perfilDe, clave, evaluarFila, criterioCampo, validarPaso, estadoPaso, pasoOmitido,
  instanciasDe, progresoFase, progresoTotal, resumen, resultadoDe, defectosDePaso, medidaNoCumple } from './guion.js';
import { guardarFoto, urlFoto, getFoto, borrarFoto } from './fotos.js';
import { generarInforme, csvInforme, nombreInforme } from './pdf.js';
import { crearZip, leerZip } from './zip.js';
import { enviar, tamano, descargar } from './share.js';

const VERSION = '1.0.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');
const hoy = () => new Date().toISOString().slice(0, 10);

const S = { usuario: null, ajustes: null, desbloqueado: false, oculto: 0, crit: null, defs: null };

const AJUSTES_DEF = { idioma: 'es', destinatario: 'oscar.rio@osmos.es', equipos: [], personal: [], ultimaCopia: null };
const LMRA_DEF = [
  '¿Conocemos el trabajo, la zona y sus riesgos?',
  '¿Todo el equipo está designado (VP/VOP) y con la designación vigente?',
  '¿Tenemos la autorización de GXO / permiso de trabajo?',
  '¿Disponemos de EPIs y herramienta adecuada y en buen estado?',
  '¿Está la zona delimitada y sin riesgo para terceros?',
  '¿Conocemos la ruta de evacuación y el teléfono de emergencia?',
  '¿Las condiciones del entorno son seguras (humedad, luz, espacio)?',
];

// ---------------------------------------------------------------- utilidades UI
function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

function modal(html, { onMount, cerrarFuera = true } = {}) {
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  document.body.appendChild(w);
  const close = () => w.remove();
  if (cerrarFuera) w.addEventListener('click', e => { if (e.target === w) close(); });
  $$('[data-cerrar]', w).forEach(b => b.addEventListener('click', close));
  onMount?.(w, close);
  return close;
}

function confirmar(msg, si = 'Aceptar', no = t('Cancelar')) {
  return new Promise(res => modal(`<p class="lead">${esc(msg)}</p>
    <div class="row end"><button class="btn sec" data-no>${esc(no)}</button><button class="btn" data-si>${esc(si)}</button></div>`,
  { cerrarFuera: false, onMount: (w, c) => { $('[data-si]', w).onclick = () => { c(); res(true); }; $('[data-no]', w).onclick = () => { c(); res(false); }; } }));
}

function pedirTexto(titulo, valor = '', { qr = false, ph = '' } = {}) {
  return new Promise(res => modal(`<h3>${esc(titulo)}</h3>
    <div class="row"><input class="inp grow" id="pt" value="${esc(valor)}" placeholder="${esc(ph)}">${qr ? '<button class="btn sec" id="ptqr" title="Escanear QR">QR</button>' : ''}</div>
    <div class="row end"><button class="btn sec" data-no>${t('Cancelar')}</button><button class="btn" data-si>${t('Guardar')}</button></div>`,
  { cerrarFuera: false, onMount: (w, c) => {
    const i = $('#pt', w); i.focus();
    $('[data-si]', w).onclick = () => { c(); res(i.value.trim()); };
    $('[data-no]', w).onclick = () => { c(); res(null); };
    i.onkeydown = e => { if (e.key === 'Enter') { c(); res(i.value.trim()); } };
    if (qr) $('#ptqr', w).onclick = async () => { const v = await escanearQR(); if (v) i.value = v; };
  } }));
}

async function escanearQR() {
  if (!('BarcodeDetector' in window)) { toast('Este navegador no lee QR. Escribe el código a mano.', 'warn'); return null; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch { toast('No se pudo abrir la cámara', 'err'); return null; }
  const det = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'] });
  return new Promise(res => {
    let activo = true;
    const close = modal(`<h3>Escanear código</h3><video id="qv" playsinline autoplay muted class="qrvideo"></video>
      <div class="row end"><button class="btn sec" data-c>${t('Cancelar')}</button></div>`, {
      cerrarFuera: false, onMount: (w, c) => {
        const v = $('#qv', w); v.srcObject = stream;
        const fin = val => { activo = false; stream.getTracks().forEach(tr => tr.stop()); c(); res(val); };
        $('[data-c]', w).onclick = () => fin(null);
        const loop = async () => {
          if (!activo) return;
          try { const r = await det.detect(v); if (r.length) return fin(r[0].rawValue); } catch { /* */ }
          setTimeout(loop, 300);
        };
        v.onloadedmetadata = loop;
      },
    });
  });
}

function padFirma(titulo) {
  return new Promise(res => modal(`<h3>${esc(titulo)}</h3><canvas id="fc" class="firma-pad"></canvas>
    <div class="row between"><button class="btn sec" id="fl">Limpiar</button>
    <span><button class="btn sec" data-no>${t('Cancelar')}</button> <button class="btn" id="fok">${t('Guardar')}</button></span></div>`,
  { cerrarFuera: false, onMount: (w, c) => {
    const cv = $('#fc', w);
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#003A69';
    let dib = false, vacio = true;
    const p = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.onpointerdown = e => { dib = true; vacio = false; cv.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...p(e)); };
    cv.onpointermove = e => { if (dib) { x.lineTo(...p(e)); x.stroke(); } };
    cv.onpointerup = () => { dib = false; };
    $('#fl', w).onclick = () => { x.clearRect(0, 0, cv.width, cv.height); vacio = true; };
    $('[data-no]', w).onclick = () => { c(); res(null); };
    $('#fok', w).onclick = () => { if (vacio) return toast('Firma vacía', 'warn'); c(); res(cv.toDataURL('image/png')); };
  } }));
}

function pedirFotos(multiple = true) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.multiple = multiple;
    i.onchange = () => res([...i.files]);
    i.click();
  });
}

const fmtF = d => d ? new Date(d).toLocaleDateString(getIdioma() === 'en' ? 'en-GB' : 'es-ES') : '';
const caducado = f => f && new Date(f) < new Date(hoy());

// ---------------------------------------------------------------- arranque
async function init() {
  S.ajustes = { ...AJUSTES_DEF, ...(await db.kvGet('ajustes')) };
  setIdioma(S.ajustes.idioma);
  S.usuario = await auth.getUsuario();
  [S.crit, S.defs] = await Promise.all([datos.criterios(), datos.defectos()]);
  window.addEventListener('hashchange', render);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) S.oculto = Date.now();
    else if (S.desbloqueado && S.oculto && Date.now() - S.oculto > auth.AUTOBLOQUEO_MS) { S.desbloqueado = false; render(); }
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
}

async function guardarAjustes() { await db.kvSet('ajustes', S.ajustes); }

async function render() {
  window.scrollTo(0, 0);
  if (!S.usuario) return vRegistro();
  if (!S.desbloqueado) return vBloqueo();
  const [ruta, ...args] = (location.hash.slice(1) || 'inicio').split('/').map(decodeURIComponent);
  const v = { inicio: vInicio, nuevo: vNuevo, m: vMant, f: vFase, p: vPaso, d: vDefectos, i: vInforme, ajustes: vAjustes }[ruta] || vInicio;
  try { await v(...args); } catch (e) { console.error(e); app().innerHTML = `<div class="pad"><p class="err">Error: ${esc(e.message)}</p><a class="btn" href="#inicio">Inicio</a></div>`; }
}

function barra(titulo, { atras = null, extra = '' } = {}) {
  return `<header class="bar">
    ${atras ? `<a class="bar-back" href="${atras}" aria-label="${t('Volver')}">‹</a>` : '<img src="assets/logo-osmos.png" class="bar-logo" alt="OSMOS Sistemas Eléctricos">'}
    <div class="bar-title">${esc(titulo)}</div>
    <div class="bar-extra">${extra}</div>
  </header>`;
}

// ---------------------------------------------------------------- registro y bloqueo
function vRegistro() {
  app().innerHTML = `<div class="lock">
    <img src="assets/logo-osmos.png" class="lock-logo" alt="OSMOS Sistemas Eléctricos">
    <h1>Mantenimiento MT / BT</h1>
    <p class="muted">Primer acceso en este móvil. Tus datos se guardan solo en este dispositivo.</p>
    <form id="reg" class="card form">
      <label>Nombre y apellidos<input class="inp" name="nombre" required autocomplete="name"></label>
      <label>Empresa<input class="inp" name="empresa" value="OSMOS Sistemas Eléctricos" required></label>
      <label>Correo<input class="inp" name="email" type="email" autocomplete="email"></label>
      <label>Teléfono<input class="inp" name="tel" type="tel" autocomplete="tel"></label>
      <label>PIN de 6 cifras<input class="inp" name="pin" inputmode="numeric" pattern="\\d{6}" maxlength="6" type="password" required></label>
      <label>Repite el PIN<input class="inp" name="pin2" inputmode="numeric" pattern="\\d{6}" maxlength="6" type="password" required></label>
      <button class="btn big">Crear acceso</button>
    </form></div>`;
  $('#reg').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!/^\d{6}$/.test(f.pin)) return toast('El PIN debe tener 6 cifras', 'err');
    if (f.pin !== f.pin2) return toast('Los PIN no coinciden', 'err');
    const { pin, pin2, ...d } = f;
    S.usuario = await auth.registrar(d, pin);
    S.desbloqueado = true;
    if (await auth.huellaDisponible()) {
      if (await confirmar('¿Activar la entrada con huella / Face ID en este móvil?', 'Activar huella', 'Ahora no')) {
        try { await auth.activarHuella(); S.usuario = await auth.getUsuario(); toast('Huella activada', 'ok'); }
        catch { toast('No se pudo activar la huella. Puedes hacerlo en Ajustes.', 'warn'); }
      }
    }
    location.hash = '#inicio'; render();
  };
}

async function vBloqueo() {
  const hayHuella = !!S.usuario.credId && await auth.huellaDisponible();
  app().innerHTML = `<div class="lock">
    <img src="assets/logo-osmos.png" class="lock-logo" alt="OSMOS Sistemas Eléctricos">
    <h1>Mantenimiento MT / BT</h1>
    <p class="muted">${esc(S.usuario.nombre)}</p>
    ${hayHuella ? `<button class="btn big huella" id="bh"><span class="ico-huella" aria-hidden="true"></span>${t('Entrar con huella')}</button>` : ''}
    <form id="fp" class="card form ${hayHuella ? 'hidden' : ''}">
      <label>PIN<input class="inp pin" name="pin" inputmode="numeric" maxlength="6" type="password" autocomplete="off" required></label>
      <button class="btn big">${t('Entrar')}</button>
      <p id="perr" class="err"></p>
    </form>
    ${hayHuella ? `<button class="link" id="bp">${t('Usar PIN')}</button>` : ''}
  </div>`;
  const ok = () => { S.desbloqueado = true; render(); };
  if (hayHuella) {
    const go = async () => { try { if (await auth.entrarConHuella()) ok(); } catch { toast('No se reconoció la huella. Usa el PIN.', 'warn'); $('#fp').classList.remove('hidden'); } };
    $('#bh').onclick = go;
    $('#bp').onclick = () => { $('#fp').classList.remove('hidden'); $('#fp input').focus(); };
  }
  $('#fp').onsubmit = async e => {
    e.preventDefault();
    const r = await auth.entrarConPin(e.target.pin.value);
    e.target.pin.value = '';
    if (r.ok) return ok();
    $('#perr').textContent = r.bloqueado
      ? `Demasiados intentos. Espera hasta las ${new Date(r.bloqueado).toLocaleTimeString().slice(0, 5)}.`
      : `${t('PIN incorrecto')}. Quedan ${r.restantes} intentos.`;
  };
}

// ---------------------------------------------------------------- inicio
async function vInicio() {
  const ms = (await db.all('mant')).sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
  const insts = await datos.instalaciones();
  const filtro = S.filtro || { q: '', estado: 'todos', inst: '' };
  const diasCopia = S.ajustes.ultimaCopia ? Math.floor((Date.now() - new Date(S.ajustes.ultimaCopia)) / 86400000) : null;
  const avisoCopia = ms.length && (diasCopia === null || diasCopia >= 7);
  const est = { curso: t('En curso'), terminado: t('Terminado'), enviado: t('Enviado') };
  app().innerHTML = barra(t('Mantenimientos'), { extra: `<a href="#ajustes" class="bar-btn" aria-label="${t('Ajustes')}">⚙</a><button class="bar-btn" id="lock" aria-label="${t('Bloquear')}">🔒</button>` }) + `
    <main class="pad">
      <a href="#nuevo" class="btn big amber full">＋ ${t('Nuevo mantenimiento')}</a>
      ${avisoCopia ? `<a href="#ajustes" class="banner warn">${diasCopia === null ? 'Aún no has hecho ninguna copia de seguridad.' : `Hace ${diasCopia} días que no haces copia de seguridad.`} Toca para hacerla.</a>` : ''}
      <div class="filtros">
        <input class="inp" id="q" placeholder="${t('Buscar…')}" value="${esc(filtro.q)}">
        <div class="row">
          <select class="inp" id="fe">${['todos', 'curso', 'terminado', 'enviado'].map(k => `<option value="${k}" ${filtro.estado === k ? 'selected' : ''}>${k === 'todos' ? t('Todos') : est[k]}</option>`).join('')}</select>
          <select class="inp" id="fi"><option value="">${t('Instalación')}: ${t('Todos')}</option>${insts.map(i => `<option value="${i.id}" ${filtro.inst === i.id ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}</select>
        </div>
      </div>
      <div id="lista"></div>
    </main>`;
  $('#lock').onclick = () => { S.desbloqueado = false; render(); };
  const pinta = () => {
    const q = filtro.q.toLowerCase();
    const l = ms.filter(m => (filtro.estado === 'todos' || m.estado === filtro.estado) && (!filtro.inst || m.instalacion === filtro.inst) &&
      (!q || [m.ot, m.ubicacion, m.instNombre, m.guionTitulo, m.fecha].join(' ').toLowerCase().includes(q)));
    $('#lista').innerHTML = l.length ? l.map(m => `<a class="card item" href="#m/${m.id}">
        <div class="item-top"><span class="tag ${m.tipo}">${m.tipo}</span><span class="estado ${m.estado}">${est[m.estado]}</span>${m.ejemplo ? '<span class="tag gris">Ejemplo</span>' : ''}</div>
        <div class="item-title">${esc(m.instNombre)} · ${esc(m.ubicacion)}</div>
        <div class="muted small">OT ${esc(m.ot || '-')} · ${fmtF(m.fecha)} · ${m.defectos.length} ${t('Defectos').toLowerCase()}</div>
        <div class="prog"><span style="width:${m.pct || 0}%"></span></div>
      </a>`).join('') : `<p class="muted center">Sin mantenimientos. Pulsa «${t('Nuevo mantenimiento')}».</p>`;
  };
  $('#q').oninput = e => { filtro.q = e.target.value; S.filtro = filtro; pinta(); };
  $('#fe').onchange = e => { filtro.estado = e.target.value; S.filtro = filtro; pinta(); };
  $('#fi').onchange = e => { filtro.inst = e.target.value; S.filtro = filtro; pinta(); };
  pinta();
}

// ---------------------------------------------------------------- nuevo
async function vNuevo() {
  const insts = await datos.instalaciones();
  app().innerHTML = barra(t('Nuevo mantenimiento'), { atras: '#inicio' }) + `
    <main class="pad"><form id="fn" class="card form">
      <label>${t('Instalación')}<select class="inp" name="instalacion" required>${insts.map(i => `<option value="${i.id}">${esc(i.nombre)}</option>`).join('')}</select></label>
      <label>${t('Guion')}<select class="inp" name="guion" required></select></label>
      <label><span id="lubi"></span><div class="row"><input class="inp grow" name="ubicacion" list="dlubi" required><button type="button" class="btn sec" id="qr">QR</button></div><datalist id="dlubi"></datalist></label>
      <label>${t('Nº de OT')}<input class="inp" name="ot" required></label>
      <label>${t('Fecha')}<input class="inp" type="date" name="fecha" value="${hoy()}" required></label>
      <label>${t('Equipo de trabajo')} <span class="muted small">(separados por comas)</span><input class="inp" name="tecnicos" value="${esc(S.usuario.nombre)}"></label>
      <button class="btn big">${t('Empezar')}</button>
    </form></main>`;
  const f = $('#fn');
  const upd = async () => {
    const inst = insts.find(i => i.id === f.instalacion.value);
    const gs = await Promise.all(inst.guiones.map(datos.guion));
    f.guion.innerHTML = gs.map(g => `<option value="${g.id}">${g.tipo} · ${esc(g.titulo)}</option>`).join('');
    updG();
  };
  const updG = async () => {
    const inst = insts.find(i => i.id === f.instalacion.value);
    const g = await datos.guion(f.guion.value);
    $('#lubi').textContent = g.tipo === 'MT' ? t('Centro / estación') : t('Edificio / zona');
    $('#dlubi').innerHTML = (g.tipo === 'MT' ? inst.centrosMT : inst.zonasBT).map(c => `<option value="${esc(c)}">`).join('');
  };
  f.instalacion.onchange = upd; f.guion.onchange = updG;
  $('#qr').onclick = async () => { const v = await escanearQR(); if (v) f.ubicacion.value = v; };
  await upd();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const inst = insts.find(i => i.id === d.instalacion);
    const g = await datos.guion(d.guion);
    const m = {
      id: uid('m'), creado: new Date().toISOString(), actualizado: new Date().toISOString(), estado: 'curso',
      instalacion: inst.id, instNombre: inst.nombre, guion: g.id, guionTitulo: g.titulo, tipo: g.tipo,
      ubicacion: d.ubicacion.trim(), ot: d.ot.trim(), fecha: d.fecha,
      tecnicos: d.tecnicos.split(',').map(s => s.trim()).filter(Boolean),
      resp: {}, inst: {}, defectos: [], equiposUsados: [], enviado: [], pct: 0, version: VERSION,
    };
    await db.put('mant', m);
    location.hash = `#m/${m.id}`;
  };
}

// ---------------------------------------------------------------- contexto de mantenimiento
async function ctx(id) {
  const m = await db.get('mant', id);
  if (!m) throw new Error('Mantenimiento no encontrado');
  const g = await datos.guion(m.guion);
  const inst = await instalacion(m.instalacion);
  return { m, g, inst, perfil: perfilDe(inst) };
}

async function guardarM(m, g, perfil) {
  m.actualizado = new Date().toISOString();
  if (g) m.pct = progresoTotal(g, m, S.crit, perfil).pct;
  await db.put('mant', m);
}

// ---------------------------------------------------------------- vista mantenimiento (fases)
async function vMant(id) {
  const { m, g, inst, perfil } = await ctx(id);
  const pt = progresoTotal(g, m, S.crit, perfil);
  app().innerHTML = barra(`${m.instNombre} · ${m.ubicacion}`, { atras: '#inicio', extra: `<button class="bar-btn" id="info" aria-label="Reglas">ⓘ</button>` }) + `
    <main class="pad">
      <div class="card">
        <div class="row between"><div><span class="tag ${g.tipo}">${g.tipo}</span> <b>${esc(g.titulo)}</b></div></div>
        <div class="muted small">OT ${esc(m.ot)} · ${fmtF(m.fecha)} · ${esc(m.tecnicos.join(', '))}</div>
        <div class="prog big"><span style="width:${pt.pct}%"></span></div>
        <div class="small">${pt.pct}% · ${pt.hechos}/${pt.total} pasos</div>
      </div>
      <h3>${t('Fases')}</h3>
      <div class="fases">${g.fases.map(f => {
        const p = progresoFase(g, f, m, S.crit, perfil);
        const pct = Math.round(p.hechos / p.total * 100);
        const n = f.repetir ? instanciasDe(m, f).length : 0;
        return `<a class="card fase ${pct === 100 ? 'ok' : pct ? 'medio' : ''}" href="#${f.repetir ? 'f' : 'p'}/${m.id}/${f.n}${f.repetir ? '' : '/-/0'}">
          <span class="fase-n">${f.n}</span>
          <span class="fase-t">${esc(f.titulo)}${f.repetir ? `<br><span class="muted small">${n} ${esc(f.repetir)}${n === 1 ? '' : 's'}</span>` : ''}</span>
          <span class="fase-p">${pct}%</span></a>`;
      }).join('')}</div>
      <div class="acciones">
        <a class="btn sec full" href="#d/${m.id}">${t('Ver defectos')} (${m.defectos.length})</a>
        <a class="btn full" href="#i/${m.id}">${t('Informe')}</a>
        <button class="btn link danger" id="del">${t('Borrar')} mantenimiento</button>
      </div>
    </main>`;
  $('#info').onclick = () => modal(`<h3>${esc(g.titulo)}</h3><p>${esc(g.intro)}</p><h4>Reglas</h4><ul>${g.reglas.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    ${inst.alcance ? `<h4>Alcance</h4><table class="tbl">${inst.alcance.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : ''}
    <div class="row end"><button class="btn" data-cerrar>${t('Cerrar')}</button></div>`);
  $('#del').onclick = async () => {
    if (!await confirmar('¿Borrar este mantenimiento y todas sus fotos? No se puede deshacer.', t('Borrar'))) return;
    const fotos = await db.byIndex('fotos', 'mant', m.id);
    await Promise.all(fotos.map(f => borrarFoto(f.id)));
    await db.del('mant', m.id);
    location.hash = '#inicio';
  };
}

// ---------------------------------------------------------------- fase repetible (celdas, trafos, cuadros, luminarias)
async function vFase(id, fn) {
  const { m, g, perfil } = await ctx(id);
  const f = g.fases.find(x => x.n === +fn);
  const lista = instanciasDe(m, f);
  const nom = f.repetir;
  app().innerHTML = barra(`${t('Fase')} ${f.n} · ${f.titulo}`, { atras: `#m/${m.id}` }) + `
    <main class="pad">
      <button class="btn big amber full" id="add">＋ ${t('Añadir')} ${esc(nom)}</button>
      <div id="li">${lista.map((i, k) => {
        let tot = 0, h = 0;
        f.pasos.forEach(p => { tot++; const e = estadoPaso(f, p, m, i.id, S.crit, perfil); if (['hecho', 'na', 'omitido'].includes(e)) h++; });
        const nd = m.defectos.filter(d => d.inst === i.id).length;
        return `<div class="card item row between">
          <a class="grow" href="#p/${m.id}/${f.n}/${i.id}/0"><div class="item-title">${esc(i.nombre)}</div>
          <div class="muted small">${h}/${tot} pasos${nd ? ` · ${nd} defecto(s)` : ''}</div><div class="prog"><span style="width:${Math.round(h / tot * 100)}%"></span></div></a>
          <button class="bar-btn dark" data-ren="${k}" aria-label="Renombrar">✎</button><button class="bar-btn dark" data-del="${k}" aria-label="${t('Borrar')}">✕</button></div>`;
      }).join('') || `<p class="muted center">Añade cada ${esc(nom)} que vayas a revisar.</p>`}</div>
      <a class="btn sec full" href="#m/${m.id}">${t('Fases')}</a>
    </main>`;
  $('#add').onclick = async () => {
    const sug = `${nom[0].toUpperCase() + nom.slice(1)} ${lista.length + 1}`;
    const n = await pedirTexto(`Nombre o código del ${nom}`, sug, { qr: true });
    if (!n) return;
    const i = { id: uid('i'), nombre: n };
    m.inst['F' + f.n] = [...lista, i];
    await guardarM(m, g, perfil);
    location.hash = `#p/${m.id}/${f.n}/${i.id}/0`;
  };
  $$('[data-ren]').forEach(b => b.onclick = async () => {
    const i = lista[+b.dataset.ren];
    const n = await pedirTexto(`Nombre del ${nom}`, i.nombre, { qr: true });
    if (!n) return;
    i.nombre = n; await guardarM(m, g, perfil); render();
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const i = lista[+b.dataset.del];
    if (!await confirmar(`¿Quitar «${i.nombre}» y sus datos?`, t('Borrar'))) return;
    m.inst['F' + f.n] = lista.filter(x => x !== i);
    Object.keys(m.resp).filter(k => k.endsWith('@' + i.id)).forEach(k => delete m.resp[k]);
    m.defectos = m.defectos.filter(d => d.inst !== i.id);
    await guardarM(m, g, perfil); render();
  });
}

// ---------------------------------------------------------------- paso
async function vPaso(id, fn, instId, idx) {
  const C = await ctx(id);
  const { m, g, inst, perfil } = C;
  const f = g.fases.find(x => x.n === +fn);
  const iid = instId === '-' ? null : instId;
  const ins = iid ? instanciasDe(m, f).find(i => i.id === iid) : null;
  idx = +idx;
  const p = f.pasos[idx];
  const k = clave(p, iid);
  const r = m.resp[k] ||= {};
  const omit = pasoOmitido(f, p, m, iid);
  const volver = f.repetir ? `#f/${m.id}/${f.n}` : `#m/${m.id}`;
  const base = `#p/${m.id}/${f.n}/${instId}/`;
  const guardar = () => guardarM(m, g, perfil);

  // ID del cuadro/luminaria: por defecto el nombre de la instancia
  p.campos.forEach(c => { if (c.t === 'ID' && !r.id && ins) r.id = ins.nombre; });

  app().innerHTML = barra(`${t('Fase')} ${f.n} · ${f.titulo}${ins ? ' — ' + ins.nombre : ''}`, { atras: volver }) + `
    <div class="pasos-dots">${f.pasos.map((q, j) => {
      const e = estadoPaso(f, q, m, iid, S.crit, perfil);
      return `<a href="${base}${j}" class="dot ${e} ${j === idx ? 'act' : ''}" aria-label="Paso ${j + 1}"></a>`;
    }).join('')}</div>
    <main class="pad paso">
      <div class="muted small">${t('Paso')} ${idx + 1} / ${f.pasos.length}${p.seccion ? ` · <span class="tag gris">${esc(p.seccion)}</span>` : ''}</div>
      <h2 class="paso-t">${esc(tPaso(p))}</h2>
      ${omit ? `<div class="banner">Paso con corte: se omite porque en este ${esc(f.repetir || 'bloque')} se eligió «Sin corte».</div>` : ''}
      <label class="na"><input type="checkbox" id="na" ${r.na ? 'checked' : ''}> ${t('No procede este paso')}</label>
      <div id="namot" class="${r.na ? '' : 'hidden'}"><input class="inp" id="namotv" placeholder="Motivo (opcional)" value="${esc(r.naMotivo || '')}"></div>
      <div id="campos" class="${r.na || omit ? 'off' : ''}"></div>
      <div id="defs"></div>
      <div id="errs"></div>
    </main>
    <footer class="nav">
      <a class="btn sec" href="${idx > 0 ? base + (idx - 1) : volver}">‹ ${t('Anterior')}</a>
      <button class="btn" id="sig">${t('Siguiente')} ›</button>
    </footer>`;

  $('#na').onchange = async e => { r.na = e.target.checked; $('#namot').classList.toggle('hidden', !r.na); $('#campos').classList.toggle('off', r.na); await guardar(); };
  $('#namotv').onchange = async e => { r.naMotivo = e.target.value; await guardar(); };

  const cont = $('#campos');
  const repintar = () => pintarCampos();
  async function pintarDefectos() {
    const ds = p.campos.some(c => c.t === 'DEFECTOS') ? m.defectos.filter(d => !iid || d.inst === iid) : defectosDePaso(m, p, iid);
    const mc = medidaNoCumple(p, r, S.crit, perfil);
    const necesita = Object.values(r.cina || {}).includes('I') || Object.values(r.okko || {}).includes('KO') || mc.falla;
    $('#defs').innerHTML = `
      ${necesita && !defectosDePaso(m, p, iid).length ? '<div class="banner err">Punto incorrecto o medida fuera de criterio: hay que abrir un defecto.</div>' : ''}
      ${mc.aviso ? '<div class="banner warn">Valor por encima del orientativo: revísalo con el proyecto.</div>' : ''}
      <div class="defs">${await Promise.all(ds.map(async d => `<button class="card def g-${esc(d.gravedad).replace(' ', '')}" data-ed="${d.id}">
          ${d.fotos?.[0] ? `<img src="${await urlFoto(d.fotos[0])}" alt="">` : ''}
          <span><b>${esc(d.codigo)}</b> · ${esc(d.gravedad)}<br><span class="small">${esc(d.texto)}</span><br><span class="small muted">${esc(t(d.estado))}</span></span></button>`)).then(a => a.join(''))}</div>
      <button class="btn sec full" id="adef">＋ ${t('Añadir defecto')}</button>`;
    $('#adef').onclick = () => editarDefecto(C, { paso: p, inst: ins, f }, null, () => { pintarDefectos(); pintarDots(); });
    $$('[data-ed]').forEach(b => b.onclick = () => editarDefecto(C, { paso: p, inst: ins, f }, m.defectos.find(d => d.id === b.dataset.ed), () => { pintarDefectos(); pintarDots(); }));
  }
  function pintarDots() {
    $$('.pasos-dots .dot').forEach((d, j) => { d.className = `dot ${estadoPaso(f, f.pasos[j], m, iid, S.crit, perfil)} ${j === idx ? 'act' : ''}`; });
  }

  async function pintarCampos() {
    const html = [];
    for (const [ci, c] of p.campos.entries()) html.push(await campoHTML(c, ci));
    cont.innerHTML = html.join('');
    bindCampos();
    pintarDefectos();
  }

  async function fotosHTML(ids, attr) {
    const th = await Promise.all((ids || []).map(async (fid, j) => `<div class="thumb"><img src="${await urlFoto(fid)}" alt=""><button class="x" data-dfoto="${attr}" data-j="${j}" aria-label="Quitar">✕</button></div>`));
    return th.join('');
  }

  async function campoHTML(c, ci) {
    switch (c.t) {
      case 'CINA': {
        const v = r.cina?.[ci];
        const b = [['C', 'Correcto'], ['I', 'Incorrecto'], ['N', 'No procede'], ['A', 'Corregido']];
        return `<div class="campo"><div class="cina">${b.map(([l, n]) => `<button class="cina-b ${l} ${v === l ? 'sel' : ''}" data-cina="${ci}" data-v="${l}"><b>${l}</b><span>${t(n)}</span></button>`).join('')}</div>
          ${c.nota ? `<div class="muted small">${esc(c.nota)}</div>` : ''}
          ${v === 'A' ? `<div class="sub"><div class="small">Foto del antes y del después de la corrección (${(r.fotosA || []).length}/2)</div><div class="thumbs">${await fotosHTML(r.fotosA, 'A')}<button class="thumb add" data-fotoA>📷</button></div></div>` : ''}</div>`;
      }
      case 'OKKO': {
        const v = r.okko?.[ci];
        return `<div class="campo"><div class="cina two">${['OK', 'KO'].map(l => `<button class="cina-b ${l === 'OK' ? 'C' : 'I'} ${v === l ? 'sel' : ''}" data-okko="${ci}" data-v="${l}"><b>${l}</b></button>`).join('')}</div>${c.nota ? `<div class="muted small">${esc(c.nota)}</div>` : ''}</div>`;
      }
      case 'FOTO': {
        const ids = r.fotos?.[ci] || [];
        let guia = '';
        if (/despu[eé]s/i.test(p.texto)) {
          const antes = f.pasos.find(q => /antes/i.test(q.texto) && q.campos.some(x => x.t === 'FOTO'));
          const ra = antes && m.resp[clave(antes, iid)];
          const fa = ra?.fotos && Object.values(ra.fotos).flat()[0];
          if (fa) guia = `<div class="guia"><img src="${await urlFoto(fa)}" alt=""><span class="small">Haz la foto desde el mismo punto que la del antes</span></div>`;
        }
        return `<div class="campo"><div class="lbl">📷 ${c.termica ? 'Imagen térmica' : t('Fotos')} ${c.n > 1 ? `(${ids.length}/${c.n})` : ''}${c.nota ? ` · <span class="muted">${esc(c.nota)}</span>` : ''}</div>
          ${guia}<div class="thumbs">${await fotosHTML(ids, ci)}<button class="thumb add" data-foto="${ci}" aria-label="${t('Hacer foto')}">📷<span>${t('Hacer foto')}</span></button></div></div>`;
      }
      case 'FOTO*': return '';
      case 'MED': {
        const filas = (r.med ||= {})[ci] ||= [c.campos.map(() => '')];
        const eqs = S.ajustes.equipos;
        const eqSel = (r.medEq ||= {})[ci] || '';
        const eqObj = eqs.find(e => `${e.nombre} (${e.serie})` === eqSel);
        const crits = c.campos.map(cc => criterioCampo(S.crit, cc, perfil)).filter(Boolean);
        const rowsH = filas.map((fila, fi) => {
          const ev = evaluarFila(p, c, fila, S.crit, perfil);
          return `<div class="med-fila">${c.multi ? `<div class="small muted">#${fi + 1} ${filas.length > 1 ? `<button class="link danger" data-delfila="${ci}" data-fi="${fi}">quitar</button>` : ''}</div>` : ''}
            <div class="med-grid">${c.campos.map((cc, k) => cc.tipo === 'hora'
              ? `<label class="med"><span>${esc(cc.label)}</span><div class="row"><input class="inp" type="time" data-med="${ci}" data-fi="${fi}" data-k="${k}" value="${esc(fila[k])}"><button class="btn sec sm" data-ahora="${ci}" data-fi="${fi}" data-k="${k}">Ahora</button></div></label>`
              : cc.tipo === 'okko'
                ? `<label class="med"><span>${esc(cc.label)}</span><select class="inp" data-med="${ci}" data-fi="${fi}" data-k="${k}"><option value=""></option>${['OK', 'KO'].map(o => `<option ${fila[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`
                : `<label class="med ${ev.campos[k]?.ok === false ? (ev.campos[k].aviso ? 'warn' : 'bad') : ''}"><span>${esc(cc.label)}</span><div class="unit"><input class="inp" inputmode="decimal" data-med="${ci}" data-fi="${fi}" data-k="${k}" value="${esc(fila[k])}"><em>${esc(cc.unidad)}</em></div></label>`).join('')}</div>
            <div class="med-extra" data-extra="${ci}-${fi}">${ev.extra.map(x => `<div class="small ${x.ok ? 'okc' : 'err'}">${esc(x.msg)}</div>`).join('')}</div></div>`;
        }).join('');
        return `<div class="campo"><div class="lbl">📏 Medida${c.nota ? ` · <span class="muted">${esc(c.nota)}</span>` : ''}</div>${rowsH}
          ${c.multi ? `<div><button class="btn sec sm" data-addfila="${ci}">＋ ${t('Añadir')}</button></div>` : ''}
          ${c.campos[0].tipo !== 'hora' ? `<label class="small">${t('Equipo usado')}<select class="inp" data-medeq="${ci}"><option value="">—</option>${eqs.map(e => { const v = `${e.nombre} (${e.serie})`; return `<option ${v === eqSel ? 'selected' : ''}>${esc(v)}${caducado(e.caducidad) ? ' ⚠ calibración caducada' : ''}</option>`; }).join('')}</select></label>
          ${eqObj && caducado(eqObj.caducidad) ? `<div class="banner warn small">El certificado de calibración de este equipo caducó el ${fmtF(eqObj.caducidad)}.</div>` : ''}
          ${!eqs.length ? '<div class="small muted">Da de alta tus equipos de medida en Ajustes.</div>' : ''}` : ''}
          ${crits.length ? `<div class="crit">${t('Criterio')}: ${crits.map(x => esc(x.txt)).join(' · ')}</div>` : ''}</div>`;
      }
      case 'SINO': return `<div class="campo"><label class="sino ${r.sino?.[ci] ? 'sel' : ''}"><input type="checkbox" data-sino="${ci}" ${r.sino?.[ci] ? 'checked' : ''}><span>✔ ${c.nota ? esc(c.nota) : 'Hecho / confirmado'}</span></label></div>`;
      case 'TXT': return `<div class="campo"><label class="lbl">✎ Observación${c.det ? ` (${esc(c.det)})` : ''}<textarea class="inp" rows="3" data-txt="${ci}" placeholder="Escribe o dicta con el micrófono del teclado">${esc(r.txt?.[ci] || '')}</textarea></label></div>`;
      case 'SEL': {
        const v = r.sel?.[ci];
        if (c.fuente === 'equipos') {
          const eqs = S.ajustes.equipos;
          return `<div class="campo"><div class="lbl">Equipos usados</div>${eqs.length ? eqs.map((e, j) => {
            const val = `${e.nombre} (${e.serie})`;
            return `<label class="chk ${caducado(e.caducidad) ? 'bad' : ''}"><input type="checkbox" data-eq="${ci}" value="${esc(val)}" ${(v || []).includes(val) ? 'checked' : ''}> ${esc(val)} <span class="small">${e.caducidad ? (caducado(e.caducidad) ? '⚠ calibración caducada ' : 'calibración hasta ') + fmtF(e.caducidad) : ''}</span></label>`;
          }).join('') : '<p class="muted small">No tienes equipos dados de alta.</p>'}
            <button class="btn sec sm" id="addeq">＋ Dar de alta equipo</button></div>`;
        }
        if (c.opciones?.length && !c.libre) {
          return `<div class="campo"><div class="lbl">${esc(c.label || 'Selección')}</div><div class="opts">${c.opciones.map(o => `<button class="opt ${v === o ? 'sel' : ''} ${c.rol === 'resultado' ? 'res-' + o : ''}" data-sel="${ci}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
        }
        return `<div class="campo"><label class="lbl">${esc(c.label || 'Selección' + (c.det ? ' (' + c.det + ')' : ''))}<input class="inp" list="dl${ci}" data-selt="${ci}" value="${esc(v || '')}"><datalist id="dl${ci}">${(c.opciones || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist></label></div>`;
      }
      case 'ID': return `<div class="campo"><label class="lbl">${esc(c.label)}<div class="row"><input class="inp grow" data-id value="${esc(r.id || '')}">${c.qr ? '<button class="btn sec" data-qr>QR</button>' : ''}</div></label></div>`;
      case 'FIRMA': return `<div class="campo"><div class="lbl">✍ Firmas</div>${c.quien.map((q, j) => `<div class="firma"><div class="small">${esc(q)}${j ? ' (opcional)' : ''}</div>
          ${r.firmas?.[q] ? `<img src="${r.firmas[q]}" alt="Firma">` : ''}<button class="btn sec sm" data-firma="${esc(q)}">${r.firmas?.[q] ? 'Repetir firma' : 'Firmar'}</button></div>`).join('')}</div>`;
      case 'LMRA': {
        const qs = inst.lmra || LMRA_DEF;
        r.lmra ||= {};
        return `<div class="campo"><div class="lbl">LMRA · Last Minute Risk Analysis</div>${qs.map((q, j) => `<div class="lmra"><span>${esc(q)}</span><span class="opts">
          <button class="opt ${r.lmra[j] === true ? 'sel' : ''}" data-lmra="${j}" data-v="1">Sí</button><button class="opt ${r.lmra[j] === false ? 'sel no' : ''}" data-lmra="${j}" data-v="0">No</button></span></div>`).join('')}
          ${Object.values(r.lmra).includes(false) ? '<div class="banner err">Si alguna respuesta es NO, no se empieza el trabajo hasta resolverlo.</div>' : ''}</div>`;
      }
      case 'ROLES': {
        r.roles ||= {};
        const per = S.ajustes.personal;
        const est = n => { const x = per.find(q => q.nombre === n); return !x ? '' : caducado(x.caducidad) ? `<span class="err small">designación ${esc(x.designacion)} caducada</span>` : `<span class="okc small">${esc(x.designacion)} hasta ${fmtF(x.caducidad)}</span>`; };
        return `<div class="campo"><datalist id="dlper">${per.map(q => `<option value="${esc(q.nombre)}">`).join('')}</datalist>
          <label class="lbl">IV · responsable de la instalación<input class="inp" list="dlper" data-rol="IV" value="${esc(r.roles.IV || '')}"></label>${est(r.roles.IV)}
          <label class="lbl">WV · responsable del trabajo<input class="inp" list="dlper" data-rol="WV" value="${esc(r.roles.WV || '')}"></label>${est(r.roles.WV)}
          <div class="small muted">Equipo: ${m.tecnicos.map(n => `${esc(n)} ${est(n)}`).join(' · ')}</div></div>`;
      }
      case 'RESUMEN': {
        const R = resumen(g, m);
        return `<div class="campo"><div class="lbl">Resumen automático</div><ul class="res">
          ${Object.entries(R.inst).map(([k2, v]) => `<li>${esc(k2)}s revisados: <b>${v}</b></li>`).join('')}
          <li>${t('Defectos')}: <b>${R.nDefectos}</b> (${Object.entries(R.porGravedad).map(([k2, v]) => `${esc(k2)}: ${v}`).join(' · ') || '—'})</li>
          ${R.lumKO ? `<li>Luminarias KO: <b>${R.lumKO}</b></li>` : ''}
          ${perfil === 'lelystad' ? `<li>Constataciones GnO cerradas: <b>${R.gnoCerradas}</b></li>` : ''}
          <li>C ${R.cont.C} · I ${R.cont.I} · N ${R.cont.N} · A ${R.cont.A}</li></ul>
          <label class="sino ${r.resumenOk ? 'sel' : ''}"><input type="checkbox" data-resok ${r.resumenOk ? 'checked' : ''}><span>✔ Confirmo el resumen</span></label></div>`;
      }
      case 'DEFECTOS': return `<div class="campo"><div class="lbl">Revisa los defectos ${ins ? 'de ' + esc(ins.nombre) : 'del mantenimiento'} y añade los que falten.</div></div>`;
      default: return '';
    }
  }

  function evaluarMed(ci) {
    const c = p.campos[ci];
    (r.med[ci] || []).forEach((fila, fi) => {
      const ev = evaluarFila(p, c, fila, S.crit, perfil);
      c.campos.forEach((cc, k) => {
        const lab = $(`[data-med="${ci}"][data-fi="${fi}"][data-k="${k}"]`, cont)?.closest('.med');
        if (!lab) return;
        lab.classList.toggle('bad', ev.campos[k]?.ok === false && !ev.campos[k].aviso);
        lab.classList.toggle('warn', ev.campos[k]?.ok === false && !!ev.campos[k].aviso);
      });
      const ex = $(`[data-extra="${ci}-${fi}"]`, cont);
      if (ex) ex.innerHTML = ev.extra.map(x => `<div class="small ${x.ok ? 'okc' : 'err'}">${esc(x.msg)}</div>`).join('');
    });
  }

  function bindCampos() {
    $$('[data-cina]', cont).forEach(b => b.onclick = async () => { (r.cina ||= {})[b.dataset.cina] = b.dataset.v; await guardar(); repintar(); pintarDots(); });
    $$('[data-okko]', cont).forEach(b => b.onclick = async () => { (r.okko ||= {})[b.dataset.okko] = b.dataset.v; await guardar(); repintar(); pintarDots(); });
    $$('[data-foto]', cont).forEach(b => b.onclick = async () => {
      const files = await pedirFotos();
      if (!files.length) return;
      b.disabled = true; b.textContent = '…';
      for (const fl of files) { const fid = await guardarFoto(fl, m.id, k); ((r.fotos ||= {})[b.dataset.foto] ||= []).push(fid); }
      await guardar(); repintar(); pintarDots();
    });
    $$('[data-fotoA]', cont).forEach(b => b.onclick = async () => {
      const files = await pedirFotos();
      for (const fl of files) (r.fotosA ||= []).push(await guardarFoto(fl, m.id, k));
      await guardar(); repintar(); pintarDots();
    });
    $$('[data-dfoto]', cont).forEach(b => b.onclick = async () => {
      if (!await confirmar('¿Quitar esta foto?', t('Borrar'))) return;
      const arr = b.dataset.dfoto === 'A' ? r.fotosA : r.fotos[b.dataset.dfoto];
      const [fid] = arr.splice(+b.dataset.j, 1);
      await borrarFoto(fid); await guardar(); repintar(); pintarDots();
    });
    $$('[data-med]', cont).forEach(i => {
      const ev = async () => {
        r.med[i.dataset.med][i.dataset.fi][i.dataset.k] = i.value.trim();
        await guardar();
      };
      i.oninput = ev;
      // al salir del campo se evalúa el criterio sin volver a pintar (para no perder el foco)
      i.onchange = async () => { await ev(); evaluarMed(+i.dataset.med); pintarDefectos(); pintarDots(); };
    });
    $$('[data-ahora]', cont).forEach(b => b.onclick = async () => { r.med[b.dataset.ahora][b.dataset.fi][b.dataset.k] = new Date().toTimeString().slice(0, 5); await guardar(); repintar(); pintarDots(); });
    $$('[data-addfila]', cont).forEach(b => b.onclick = async () => { const c = p.campos[b.dataset.addfila]; r.med[b.dataset.addfila].push(c.campos.map(() => '')); await guardar(); repintar(); });
    $$('[data-delfila]', cont).forEach(b => b.onclick = async () => { r.med[b.dataset.delfila].splice(+b.dataset.fi, 1); await guardar(); repintar(); pintarDots(); });
    $$('[data-medeq]', cont).forEach(s => s.onchange = async () => { r.medEq[s.dataset.medeq] = s.value.replace(/ ⚠.*$/, ''); await guardar(); repintar(); });
    $$('[data-sino]', cont).forEach(i => i.onchange = async () => { (r.sino ||= {})[i.dataset.sino] = i.checked; await guardar(); repintar(); pintarDots(); });
    $$('[data-txt]', cont).forEach(i => i.oninput = async () => { (r.txt ||= {})[i.dataset.txt] = i.value; await guardar(); });
    $$('[data-sel]', cont).forEach(b => b.onclick = async () => {
      (r.sel ||= {})[b.dataset.sel] = b.dataset.v;
      if (p.campos[b.dataset.sel].rol === 'resultado') m.resultado = b.dataset.v;
      await guardar(); repintar(); pintarDots();
    });
    $$('[data-selt]', cont).forEach(i => i.onchange = async () => { (r.sel ||= {})[i.dataset.selt] = i.value.trim(); await guardar(); pintarDots(); });
    $$('[data-eq]', cont).forEach(i => i.onchange = async () => {
      const ci = i.dataset.eq;
      const sel = new Set(r.sel?.[ci] || []);
      i.checked ? sel.add(i.value) : sel.delete(i.value);
      (r.sel ||= {})[ci] = [...sel];
      m.equiposUsados = S.ajustes.equipos.filter(e => sel.has(`${e.nombre} (${e.serie})`)).map(e => ({ ...e }));
      await guardar(); pintarDots();
    });
    $('#addeq', cont)?.addEventListener('click', () => editarEquipo(null, () => repintar()));
    $$('[data-id]', cont).forEach(i => i.onchange = async () => { r.id = i.value.trim(); if (ins && r.id) ins.nombre = r.id; await guardar(); pintarDots(); });
    $$('[data-qr]', cont).forEach(b => b.onclick = async () => { const v = await escanearQR(); if (v) { r.id = v; if (ins) ins.nombre = v; await guardar(); repintar(); } });
    $$('[data-firma]', cont).forEach(b => b.onclick = async () => { const d = await padFirma(b.dataset.firma); if (d) { (r.firmas ||= {})[b.dataset.firma] = d; await guardar(); repintar(); pintarDots(); } });
    $$('[data-lmra]', cont).forEach(b => b.onclick = async () => { r.lmra[b.dataset.lmra] = b.dataset.v === '1'; await guardar(); repintar(); pintarDots(); });
    $$('[data-rol]', cont).forEach(i => i.onchange = async () => { r.roles[i.dataset.rol] = i.value.trim(); await guardar(); repintar(); pintarDots(); });
    $$('[data-resok]', cont).forEach(i => i.onchange = async () => { r.resumenOk = i.checked; await guardar(); repintar(); pintarDots(); });
  }

  await pintarCampos();

  $('#sig').onclick = async () => {
    // asegurar que el último input se ha guardado
    document.activeElement?.blur?.();
    await new Promise(res => setTimeout(res, 30));
    const errs = validarPaso(f, p, m, iid, S.crit, perfil);
    if (errs.length) {
      $('#errs').innerHTML = `<div class="banner err"><b>Para avanzar:</b><ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>Si el paso no aplica, marca «${t('No procede este paso')}».</div>`;
      $('#errs').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    await guardar();
    if (idx < f.pasos.length - 1) location.hash = base + (idx + 1);
    else if (f.repetir) { toast(`${ins.nombre} completado`, 'ok'); location.hash = volver; }
    else {
      const sigF = g.fases[g.fases.indexOf(f) + 1];
      if (!sigF) { location.hash = `#i/${m.id}`; return; }
      location.hash = sigF.repetir ? `#f/${m.id}/${sigF.n}` : `#p/${m.id}/${sigF.n}/-/0`;
    }
  };
}

// ---------------------------------------------------------------- defectos
function catalogo(perfil, tipo) {
  const c = S.defs[perfil];
  return { escala: c.escala, desc: c.descripcion, lista: c.catalogo.filter(d => d.guion === tipo) };
}

function editarDefecto(C, contexto, d, after) {
  const { m, g, perfil } = C;
  const cat = catalogo(perfil, g.tipo);
  const nuevo = !d;
  d = d ? structuredClone(d) : {
    id: uid('d'), codigo: '', texto: '', gravedad: '', desc: '', propuesta: '', estado: 'Abierto', fotos: [],
    paso: contexto?.paso?.id || null, inst: contexto?.inst?.id || null,
    ubic: [m.ubicacion, contexto?.inst?.nombre, contexto?.f ? `F${contexto.f.n}` : ''].filter(Boolean).join(' · '),
  };
  // gravedad sugerida por termografía
  if (nuevo && contexto?.paso) {
    const r = m.resp[clave(contexto.paso, d.inst)];
    contexto.paso.campos.forEach((c, ci) => c.t === 'MED' && (r?.med?.[ci] || []).forEach(fila => {
      evaluarFila(contexto.paso, c, fila, S.crit, perfil).extra.forEach(x => { if (x.gravedad) d.gravedad = x.gravedad; });
    }));
  }
  modal(`<h3>${nuevo ? t('Añadir defecto') : t('Defecto') + ' ' + esc(d.codigo)}</h3>
    <div class="form">
      <label>${t('Defecto')}<select class="inp" id="dcod"><option value="">— Elegir del catálogo —</option>
        ${cat.lista.map(x => `<option value="${x.codigo}" ${d.codigo === x.codigo ? 'selected' : ''}>${x.codigo} · ${esc(x.texto)}</option>`).join('')}
        <option value="OTRO" ${d.codigo === 'OTRO' ? 'selected' : ''}>Otro (describir)</option></select></label>
      <label id="lotro" class="${d.codigo === 'OTRO' ? '' : 'hidden'}">Defecto<input class="inp" id="dotro" value="${esc(d.codigo === 'OTRO' ? d.texto : '')}"></label>
      <label>${perfil === 'lelystad' ? t('Clase') : t('Gravedad')}<div class="opts" id="dgr">${cat.escala.map(e => `<button type="button" class="opt g-${e.replace(' ', '')} ${d.gravedad === e ? 'sel' : ''}" data-g="${e}">${e}</button>`).join('')}</div>
        <span class="small muted" id="dgrdesc">${esc(cat.desc[d.gravedad] || '')}</span></label>
      <label id="ljus" class="hidden">Justificación del cambio de gravedad<input class="inp" id="djus" value="${esc(d.justif || '')}"></label>
      <label>${t('Ubicación')}<input class="inp" id="dubi" value="${esc(d.ubic)}"></label>
      <label>${t('Descripción')}<textarea class="inp" id="ddesc" rows="2">${esc(d.desc)}</textarea></label>
      <label>${t('Propuesta')} de solución<textarea class="inp" id="dprop" rows="2">${esc(d.propuesta)}</textarea></label>
      <label>${t('Estado')}<select class="inp" id="dest">${['Abierto', 'Corregido en visita', 'Corregido después'].map(e => `<option ${d.estado === e ? 'selected' : ''} value="${e}">${t(e)}</option>`).join('')}</select></label>
      ${perfil === 'lelystad' ? `<label>ID constatación GnO (si existe)<input class="inp" id="dgno" value="${esc(d.gno || '')}"></label>
        <label>Responsable<select class="inp" id="dresp">${['Osmos', 'INSTRA', 'Otros'].map(e => `<option ${d.resp === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>` : ''}
      <div class="lbl">📷 Foto del defecto (obligatoria)</div><div class="thumbs" id="dfotos"></div>
    </div>
    <div class="row between">${nuevo ? '<span></span>' : `<button class="btn link danger" id="dborrar">${t('Borrar')}</button>`}
      <span><button class="btn sec" data-cerrar>${t('Cancelar')}</button> <button class="btn" id="dok">${t('Guardar')}</button></span></div>`, {
    cerrarFuera: false,
    onMount: (w, close) => {
      let defGr = cat.lista.find(x => x.codigo === d.codigo)?.gravedad;
      const chkJus = () => $('#ljus', w).classList.toggle('hidden', !(defGr && cat.escala.includes(defGr) && d.gravedad && d.gravedad !== defGr));
      const pintaFotos = async () => {
        $('#dfotos', w).innerHTML = (await Promise.all(d.fotos.map(async (fid, j) => `<div class="thumb"><img src="${await urlFoto(fid)}" alt=""><button class="x" data-j="${j}">✕</button></div>`))).join('') +
          `<button class="thumb add" id="dfadd">📷<span>${t('Hacer foto')}</span></button>`;
        $('#dfadd', w).onclick = async () => { for (const fl of await pedirFotos()) d.fotos.push(await guardarFoto(fl, m.id, 'defecto:' + d.id)); pintaFotos(); };
        $$('#dfotos .x', w).forEach(b => b.onclick = () => { d.fotos.splice(+b.dataset.j, 1); pintaFotos(); });
      };
      pintaFotos();
      $('#dcod', w).onchange = e => {
        d.codigo = e.target.value;
        $('#lotro', w).classList.toggle('hidden', d.codigo !== 'OTRO');
        const x = cat.lista.find(q => q.codigo === d.codigo);
        defGr = x?.gravedad;
        if (x && cat.escala.includes(x.gravedad)) {
          d.gravedad = x.gravedad;
          $$('#dgr .opt', w).forEach(b => b.classList.toggle('sel', b.dataset.g === d.gravedad));
          $('#dgrdesc', w).textContent = cat.desc[d.gravedad] || '';
        } else if (x) $('#dgrdesc', w).textContent = 'Gravedad: ' + x.gravedad;
        chkJus();
      };
      $$('#dgr .opt', w).forEach(b => b.onclick = () => {
        d.gravedad = b.dataset.g;
        $$('#dgr .opt', w).forEach(q => q.classList.toggle('sel', q === b));
        $('#dgrdesc', w).textContent = cat.desc[d.gravedad] || '';
        chkJus();
      });
      chkJus();
      $('#dborrar', w)?.addEventListener('click', async () => {
        if (!await confirmar('¿Borrar este defecto?', t('Borrar'))) return;
        m.defectos = m.defectos.filter(x => x.id !== d.id);
        await guardarM(m, g, perfil); close(); after?.();
      });
      $('#dok', w).onclick = async () => {
        const x = cat.lista.find(q => q.codigo === d.codigo);
        d.texto = d.codigo === 'OTRO' ? $('#dotro', w).value.trim() : x?.texto || '';
        d.ubic = $('#dubi', w).value.trim();
        d.desc = $('#ddesc', w).value.trim();
        d.propuesta = $('#dprop', w).value.trim();
        d.estado = $('#dest', w).value;
        d.justif = $('#djus', w).value.trim();
        if (perfil === 'lelystad') { d.gno = $('#dgno', w).value.trim(); d.resp = $('#dresp', w).value; }
        const errs = [];
        if (!d.codigo) errs.push('Elige el defecto.');
        if (d.codigo === 'OTRO' && !d.texto) errs.push('Describe el defecto.');
        if (!d.gravedad) errs.push('Elige la ' + (perfil === 'lelystad' ? 'clase' : 'gravedad') + '.');
        if (!d.fotos.length) errs.push('Haz al menos una foto del defecto.');
        if (!$('#ljus', w).classList.contains('hidden') && !d.justif) errs.push('Justifica el cambio de gravedad.');
        if (errs.length) return toast(errs.join(' '), 'err');
        const i = m.defectos.findIndex(q => q.id === d.id);
        if (i >= 0) m.defectos[i] = d; else m.defectos.push(d);
        await guardarM(m, g, perfil); close(); after?.();
      };
    },
  });
}

async function vDefectos(id) {
  const C = await ctx(id);
  const { m, g, perfil } = C;
  const cat = catalogo(perfil, g.tipo);
  app().innerHTML = barra(`${t('Defectos')} · ${m.ubicacion}`, { atras: `#m/${m.id}` }) + `
    <main class="pad">
      <div class="row wrap">${cat.escala.map(e => `<span class="tag g-${e.replace(' ', '')}">${e}: ${m.defectos.filter(d => d.gravedad === e).length}</span>`).join(' ')}</div>
      <div class="defs" id="dl"></div>
      <button class="btn sec full" id="add">＋ ${t('Añadir defecto')}</button>
    </main>`;
  $('#dl').innerHTML = (await Promise.all(m.defectos.map(async d => `<button class="card def g-${d.gravedad.replace(' ', '')}" data-ed="${d.id}">
      ${d.fotos?.[0] ? `<img src="${await urlFoto(d.fotos[0])}" alt="">` : ''}
      <span><b>${esc(d.codigo)}</b> · ${esc(d.gravedad)} · <span class="small">${esc(t(d.estado))}</span><br>${esc(d.texto)}<br><span class="small muted">${esc(d.ubic)}${d.gno ? ' · GnO ' + esc(d.gno) : ''}</span></span></button>`))).join('') ||
    `<p class="muted center">${t('Sin defectos registrados.')}</p>`;
  $$('[data-ed]').forEach(b => b.onclick = () => editarDefecto(C, null, m.defectos.find(d => d.id === b.dataset.ed), render));
  $('#add').onclick = () => editarDefecto(C, null, null, render);
}

// ---------------------------------------------------------------- informe y envío
let logoCache = null;
async function logoBytes() {
  if (!logoCache) logoCache = new Uint8Array(await (await fetch('assets/logo-osmos.png')).arrayBuffer());
  return logoCache;
}

async function vInforme(id) {
  const C = await ctx(id);
  const { m, g, inst, perfil } = C;
  const pendientes = [];
  g.fases.forEach(f => {
    const insts = f.repetir ? instanciasDe(m, f) : [null];
    if (f.repetir && !insts.length) pendientes.push(`F${f.n} ${f.titulo}: sin ${f.repetir}s`);
    insts.forEach(i => f.pasos.forEach(p => {
      const e = estadoPaso(f, p, m, i?.id || null, S.crit, perfil);
      if (e === 'pendiente' || e === 'incompleto') pendientes.push(`F${f.n}${i ? ' ' + i.nombre : ''} · ${p.texto.slice(0, 60)}`);
    }));
  });
  const res = resultadoDe(g, m);
  app().innerHTML = barra(`${t('Informe')} · ${m.ubicacion}`, { atras: `#m/${m.id}` }) + `
    <main class="pad">
      <div class="card">
        <div class="item-title">${esc(m.instNombre)} · ${esc(m.ubicacion)} · ${g.tipo}</div>
        <div class="small muted">OT ${esc(m.ot)} · ${fmtF(m.fecha)}</div>
        <div class="res-big res-${esc(res)}">${t('Resultado global')}: ${esc(res || 'sin indicar')}</div>
        <div class="small">${m.defectos.length} ${t('Defectos').toLowerCase()}</div>
      </div>
      ${pendientes.length ? `<details class="banner warn"><summary>Quedan ${pendientes.length} pasos sin completar. Puedes generar el informe igualmente (saldrá incompleto).</summary><ul class="small">${pendientes.slice(0, 40).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '<div class="banner ok">Todos los pasos completados.</div>'}
      <div class="card form">
        <label>${t('Idioma')} del informe<select class="inp" id="il"><option value="es">Castellano</option><option value="en" ${perfil === 'lelystad' ? 'selected' : ''}>English</option></select></label>
        <label class="chk"><input type="checkbox" id="icsv"> ${t('Enviar también los datos (CSV)')}</label>
        <button class="btn big" id="gen">📄 ${t('Generar informe PDF')}</button>
        <div id="out" class="hidden">
          <p class="small" id="info"></p>
          <button class="btn sec full" id="ver">Ver PDF</button>
          <button class="btn full wa" id="wa">${t('Enviar por WhatsApp')}</button>
          <button class="btn full" id="ml">${t('Enviar por correo')}</button>
          <button class="btn sec full" id="sv">${t('Guardar en el móvil')}</button>
        </div>
      </div>
      ${m.enviado.length ? `<div class="small muted">Enviado: ${m.enviado.map(e => `${fmtF(e.fecha)} (${esc(e.canal)})`).join(', ')}</div>` : ''}
    </main>`;
  let pdfFile = null;
  $('#gen').onclick = async () => {
    const b = $('#gen'); b.disabled = true; b.textContent = 'Generando…';
    try {
      pdfFile = await generarInforme({ m, g, inst, usuario: S.usuario, getFoto, lang: $('#il').value, logoBytes: await logoBytes() });
      if (!pendientes.length && m.estado === 'curso') { m.estado = 'terminado'; m.terminado = new Date().toISOString(); await guardarM(m, g, perfil); }
      $('#out').classList.remove('hidden');
      $('#info').textContent = `${pdfFile.name} · ${tamano(pdfFile.size)}`;
      toast('Informe generado', 'ok');
    } catch (e) { console.error(e); toast('Error al generar el PDF: ' + e.message, 'err'); }
    b.disabled = false; b.textContent = '📄 ' + t('Generar informe PDF');
  };
  const archivos = () => {
    const fs = [pdfFile];
    if ($('#icsv').checked) fs.push(new File([csvInforme(m, g)], pdfFile.name.replace(/\.pdf$/, '.csv'), { type: 'text/csv' }));
    return fs;
  };
  const texto = () => `Informe de mantenimiento ${g.tipo} ${m.instNombre} – ${m.ubicacion} – ${fmtF(m.fecha)}. OT ${m.ot}. Resultado: ${resultadoDe(g, m) || '-'}. Defectos: ${m.defectos.length}.`;
  const env = async canal => {
    const r = await enviar({ files: archivos(), titulo: `Informe mantenimiento ${m.instNombre} ${m.ubicacion} ${fmtF(m.fecha)}`, texto: texto(), canal, destinatario: S.ajustes.destinatario });
    if (r === 'cancelado') return;
    if (canal !== 'guardar') { m.enviado.push({ fecha: new Date().toISOString(), canal }); if (m.estado !== 'curso') m.estado = 'enviado'; await guardarM(m, g, perfil); }
    toast(r === 'compartido' ? 'Enviado' : canal === 'guardar' ? 'Guardado' : 'Archivo descargado: adjúntalo en el mensaje', 'ok');
  };
  $('#ver').onclick = () => window.open(URL.createObjectURL(pdfFile), '_blank');
  $('#wa').onclick = () => env('whatsapp');
  $('#ml').onclick = () => env('correo');
  $('#sv').onclick = () => env('guardar');
}

// ---------------------------------------------------------------- ajustes
function editarEquipo(e, after) {
  const nuevo = !e;
  e = e || { nombre: '', serie: '', caducidad: '' };
  modal(`<h3>${nuevo ? 'Nuevo equipo de medida' : 'Equipo de medida'}</h3><div class="form">
    <label>Equipo<input class="inp" id="en" value="${esc(e.nombre)}" placeholder="Metrel MI3100SE, HT GSC60…"></label>
    <label>Nº de serie<input class="inp" id="es" value="${esc(e.serie)}"></label>
    <label>Caducidad del certificado de calibración<input class="inp" type="date" id="ec" value="${esc(e.caducidad)}"></label></div>
    <div class="row between">${nuevo ? '<span></span>' : `<button class="btn link danger" id="edel">${t('Borrar')}</button>`}<span><button class="btn sec" data-cerrar>${t('Cancelar')}</button> <button class="btn" id="eok">${t('Guardar')}</button></span></div>`, {
    onMount: (w, close) => {
      $('#eok', w).onclick = async () => {
        const n = { nombre: $('#en', w).value.trim(), serie: $('#es', w).value.trim(), caducidad: $('#ec', w).value };
        if (!n.nombre || !n.serie) return toast('Indica equipo y nº de serie', 'err');
        if (nuevo) S.ajustes.equipos.push(n); else Object.assign(e, n);
        await guardarAjustes(); close(); after?.();
      };
      $('#edel', w)?.addEventListener('click', async () => { S.ajustes.equipos = S.ajustes.equipos.filter(x => x !== e); await guardarAjustes(); close(); after?.(); });
    },
  });
}

function editarPersona(p, after) {
  const nuevo = !p;
  p = p || { nombre: '', designacion: 'VP BT', caducidad: '' };
  modal(`<h3>Personal designado</h3><div class="form">
    <label>Nombre<input class="inp" id="pn" value="${esc(p.nombre)}"></label>
    <label>Designación (NEN 3140 / 3840)<select class="inp" id="pd">${['VP MT', 'VP BT', 'VP MT + BT', 'VOP'].map(x => `<option ${p.designacion === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label>Caducidad<input class="inp" type="date" id="pc" value="${esc(p.caducidad)}"></label></div>
    <div class="row between">${nuevo ? '<span></span>' : `<button class="btn link danger" id="pdel">${t('Borrar')}</button>`}<span><button class="btn sec" data-cerrar>${t('Cancelar')}</button> <button class="btn" id="pok">${t('Guardar')}</button></span></div>`, {
    onMount: (w, close) => {
      $('#pok', w).onclick = async () => {
        const n = { nombre: $('#pn', w).value.trim(), designacion: $('#pd', w).value, caducidad: $('#pc', w).value };
        if (!n.nombre) return toast('Indica el nombre', 'err');
        if (nuevo) S.ajustes.personal.push(n); else Object.assign(p, n);
        await guardarAjustes(); close(); after?.();
      };
      $('#pdel', w)?.addEventListener('click', async () => { S.ajustes.personal = S.ajustes.personal.filter(x => x !== p); await guardarAjustes(); close(); after?.(); });
    },
  });
}

async function vAjustes() {
  const A = S.ajustes;
  const u = S.usuario;
  const hd = await auth.huellaDisponible();
  app().innerHTML = barra(t('Ajustes'), { atras: '#inicio' }) + `
    <main class="pad">
      <section class="card form">
        <h3>Técnico</h3>
        <label>Nombre<input class="inp" id="un" value="${esc(u.nombre)}"></label>
        <label>Empresa<input class="inp" id="ue" value="${esc(u.empresa)}"></label>
        <label>Correo<input class="inp" id="um" value="${esc(u.email || '')}"></label>
        <label>Teléfono<input class="inp" id="ut" value="${esc(u.tel || '')}"></label>
      </section>
      <section class="card form">
        <h3>Acceso</h3>
        ${hd ? (u.credId ? `<p class="okc">✔ Entrada con huella activada</p><button class="btn sec" id="hoff">Desactivar huella</button>`
          : `<button class="btn" id="hon">Activar entrada con huella / Face ID</button>`) : '<p class="muted small">Este dispositivo o navegador no permite la entrada con huella. Se usará el PIN.</p>'}
        <button class="btn sec" id="cpin">Cambiar PIN</button>
        <p class="small muted">La huella protege el acceso en este móvil. Los datos no salen del dispositivo salvo que los envíes.</p>
      </section>
      <section class="card form">
        <h3>${t('Idioma')} y envío</h3>
        <label>${t('Idioma')}<select class="inp" id="lang"><option value="es">Castellano</option><option value="en" ${A.idioma === 'en' ? 'selected' : ''}>English</option></select></label>
        <label>Destinatario por defecto de los informes (correo)<input class="inp" id="dest" type="email" value="${esc(A.destinatario)}"></label>
      </section>
      <section class="card">
        <h3>${t('Equipos de medida')}</h3>
        <div id="eqs">${A.equipos.map((e, i) => `<button class="item-line" data-eq="${i}"><span>${esc(e.nombre)} · ${esc(e.serie)}</span><span class="${caducado(e.caducidad) ? 'err' : 'muted'} small">${e.caducidad ? (caducado(e.caducidad) ? 'Caducado ' : 'Hasta ') + fmtF(e.caducidad) : 'sin fecha'}</span></button>`).join('') || '<p class="muted small">Ninguno.</p>'}</div>
        <button class="btn sec sm" id="addeq">＋ ${t('Añadir')}</button>
      </section>
      <section class="card">
        <h3>${t('Personal designado')} <span class="small muted">(Lelystad · VP/VOP)</span></h3>
        <div id="per">${A.personal.map((p, i) => `<button class="item-line" data-per="${i}"><span>${esc(p.nombre)} · ${esc(p.designacion)}</span><span class="${caducado(p.caducidad) ? 'err' : 'muted'} small">${p.caducidad ? (caducado(p.caducidad) ? 'Caducada ' : 'Hasta ') + fmtF(p.caducidad) : ''}</span></button>`).join('') || '<p class="muted small">Nadie.</p>'}</div>
        <button class="btn sec sm" id="addper">＋ ${t('Añadir')}</button>
      </section>
      <section class="card form">
        <h3>${t('Copia de seguridad')}</h3>
        <p class="small">Guarda todos los mantenimientos, fotos, firmas, equipos y personal en un archivo .zip. ${A.ultimaCopia ? 'Última copia: ' + new Date(A.ultimaCopia).toLocaleString() : 'Aún no has hecho ninguna.'}</p>
        <button class="btn big" id="bk">💾 ${t('Crear copia de seguridad')}</button>
        <div id="bkout" class="hidden">
          <p class="small" id="bkinfo"></p>
          <button class="btn full wa" id="bkwa">Enviar copia por WhatsApp</button>
          <button class="btn full" id="bkml">${t('Enviar por correo')}</button>
          <button class="btn sec full" id="bksv">${t('Guardar en el móvil')}</button>
        </div>
        <button class="btn sec" id="rs">📂 ${t('Restaurar copia')}</button>
      </section>
      <section class="card form">
        <h3>Datos de ejemplo</h3>
        <button class="btn sec" id="ej">Crear un mantenimiento de ejemplo por guion</button>
        <button class="btn sec" id="ejdel">Borrar los datos de ejemplo</button>
      </section>
      <section class="card form">
        <h3>Zona peligrosa</h3>
        <button class="btn link danger" id="reset">Borrar todos los datos de este móvil</button>
      </section>
      <p class="center small muted">OSMOS Mantenimiento v${VERSION}</p>
    </main>`;
  const savU = async () => {
    Object.assign(S.usuario, { nombre: $('#un').value.trim(), empresa: $('#ue').value.trim(), email: $('#um').value.trim(), tel: $('#ut').value.trim() });
    await db.kvSet('usuario', S.usuario);
  };
  ['#un', '#ue', '#um', '#ut'].forEach(s => $(s).onchange = savU);
  $('#hon')?.addEventListener('click', async () => {
    try { await auth.activarHuella(); S.usuario = await auth.getUsuario(); toast('Huella activada', 'ok'); render(); }
    catch (e) { toast('No se pudo activar: ' + e.message, 'err'); }
  });
  $('#hoff')?.addEventListener('click', async () => { await auth.desactivarHuella(); S.usuario = await auth.getUsuario(); render(); });
  $('#cpin').onclick = async () => {
    const a = await pedirTexto('PIN actual');
    if (a == null) return;
    if (!(await auth.entrarConPin(a)).ok) return toast(t('PIN incorrecto'), 'err');
    const n = await pedirTexto('Nuevo PIN (6 cifras)');
    if (!/^\d{6}$/.test(n || '')) return toast('El PIN debe tener 6 cifras', 'err');
    await auth.cambiarPin(n); S.usuario = await auth.getUsuario(); toast('PIN cambiado', 'ok');
  };
  $('#lang').onchange = async e => { A.idioma = e.target.value; setIdioma(A.idioma); await guardarAjustes(); render(); };
  $('#dest').onchange = async e => { A.destinatario = e.target.value.trim(); await guardarAjustes(); };
  $('#addeq').onclick = () => editarEquipo(null, render);
  $$('[data-eq]').forEach(b => b.onclick = () => editarEquipo(A.equipos[+b.dataset.eq], render));
  $('#addper').onclick = () => editarPersona(null, render);
  $$('[data-per]').forEach(b => b.onclick = () => editarPersona(A.personal[+b.dataset.per], render));

  let zip = null;
  $('#bk').onclick = async () => {
    $('#bk').disabled = true; $('#bk').textContent = 'Preparando…';
    try {
      zip = await crearCopia();
      $('#bkout').classList.remove('hidden');
      $('#bkinfo').textContent = `${zip.name} · ${tamano(zip.size)}${zip.size > 100 * 1024 * 1024 ? ' · Es grande: por WhatsApp puede tardar.' : ''}`;
    } catch (e) { toast('Error: ' + e.message, 'err'); }
    $('#bk').disabled = false; $('#bk').textContent = '💾 ' + t('Crear copia de seguridad');
  };
  const envCopia = async canal => {
    const r = await enviar({ files: [zip], titulo: 'Copia de seguridad OSMOS Mantenimiento', texto: `Copia de seguridad de OSMOS Mantenimiento (${S.usuario.nombre}, ${new Date().toLocaleString()}).`, canal, destinatario: A.destinatario });
    if (r === 'cancelado') return;
    A.ultimaCopia = new Date().toISOString(); await guardarAjustes();
    toast('Copia ' + (r === 'compartido' ? 'enviada' : 'guardada'), 'ok');
  };
  $('#bkwa').onclick = () => envCopia('whatsapp');
  $('#bkml').onclick = () => envCopia('correo');
  $('#bksv').onclick = () => envCopia('guardar');
  $('#rs').onclick = restaurarCopia;
  $('#ej').onclick = async () => { await crearEjemplos(); toast('Ejemplos creados', 'ok'); location.hash = '#inicio'; };
  $('#ejdel').onclick = async () => {
    const ms = (await db.all('mant')).filter(m => m.ejemplo);
    for (const m of ms) { for (const f of await db.byIndex('fotos', 'mant', m.id)) await borrarFoto(f.id); await db.del('mant', m.id); }
    toast(`${ms.length} ejemplos borrados`, 'ok');
  };
  $('#reset').onclick = async () => {
    if (!await confirmar('Se borrarán TODOS los mantenimientos, fotos, ajustes y el acceso de este móvil. ¿Has hecho copia de seguridad?', 'Borrar todo')) return;
    const c = await pedirTexto('Escribe BORRAR para confirmar');
    if (c !== 'BORRAR') return;
    await Promise.all(['mant', 'fotos', 'kv'].map(s => db.clear(s)));
    location.hash = ''; location.reload();
  };
}

async function crearCopia() {
  const ms = await db.all('mant');
  const fotos = await db.all('fotos');
  const { pinHash, pinSalt, credId, ...usuario } = S.usuario;
  const files = [
    { name: 'version.json', data: JSON.stringify({ app: 'OSMOS Mantenimiento', version: VERSION, fecha: new Date().toISOString(), mantenimientos: ms.length, fotos: fotos.length }, null, 1) },
    { name: 'datos.json', data: JSON.stringify({ usuario, ajustes: S.ajustes, mantenimientos: ms, fotos: fotos.map(({ blob, ...f }) => f) }) },
    ...fotos.map(f => ({ name: `fotos/${f.id}.jpg`, data: f.blob })),
  ];
  const blob = await crearZip(files);
  const n = (S.usuario.nombre || 'tecnico').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-');
  const d = new Date();
  const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return new File([blob], `OSMOS_Backup_${n}_${ts}.zip`, { type: 'application/zip' });
}

async function restaurarCopia() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.zip,application/zip';
  i.onchange = async () => {
    const file = i.files[0];
    if (!file) return;
    let z, d, v;
    try {
      z = await leerZip(file);
      const dec = new TextDecoder();
      d = JSON.parse(dec.decode(z['datos.json']));
      v = JSON.parse(dec.decode(z['version.json']));
    } catch (e) { return toast('Archivo no válido: ' + e.message, 'err'); }
    modal(`<h3>${t('Restaurar copia')}</h3>
      <p>Copia del ${new Date(v.fecha).toLocaleString()} (app v${esc(v.version)}).<br>${d.mantenimientos.length} mantenimientos · ${d.fotos.length} fotos.</p>
      <p class="small">«Combinar» añade lo que falta y actualiza lo más reciente. «Sustituir» borra lo que hay en este móvil y deja solo la copia.</p>
      <div class="row end"><button class="btn sec" data-cerrar>${t('Cancelar')}</button><button class="btn sec" id="rcomb">Combinar</button><button class="btn" id="rsust">Sustituir</button></div>`, {
      onMount: (w, close) => {
        const go = async modo => {
          close();
          if (modo === 'sust') { await db.clear('mant'); await db.clear('fotos'); }
          let nm = 0, nf = 0;
          for (const m of d.mantenimientos) {
            const ex = await db.get('mant', m.id);
            if (!ex || (m.actualizado || '') > (ex.actualizado || '')) { await db.put('mant', m); nm++; }
          }
          for (const f of d.fotos) {
            if (await db.get('fotos', f.id)) continue;
            const bytes = z[`fotos/${f.id}.jpg`];
            if (!bytes) continue;
            await db.put('fotos', { ...f, blob: new Blob([bytes], { type: 'image/jpeg' }) }); nf++;
          }
          // equipos y personal: añadir los que falten
          const A = S.ajustes;
          (d.ajustes?.equipos || []).forEach(e => { if (!A.equipos.some(x => x.serie === e.serie)) A.equipos.push(e); });
          (d.ajustes?.personal || []).forEach(p => { if (!A.personal.some(x => x.nombre === p.nombre)) A.personal.push(p); });
          await guardarAjustes();
          toast(`Restaurado: ${nm} mantenimientos, ${nf} fotos`, 'ok');
          location.hash = '#inicio';
        };
        $('#rcomb', w).onclick = () => go('comb');
        $('#rsust', w).onclick = async () => { if (await confirmar('Se borrará lo que hay ahora en este móvil. ¿Seguro?', 'Sustituir')) go('sust'); };
      },
    });
  };
  i.click();
}

async function crearEjemplos() {
  const insts = await datos.instalaciones();
  const pares = [['sabon', 'sabon-laracha-mt', 'CT A'], ['laracha', 'sabon-laracha-bt', 'Nave principal'], ['lelystad', 'lelystad-mt', 'TS 03'], ['lelystad', 'lelystad-bt', 'A1']];
  for (const [iid, gid, ubic] of pares) {
    const inst = insts.find(i => i.id === iid);
    const g = await datos.guion(gid);
    const m = {
      id: uid('m'), creado: new Date().toISOString(), actualizado: new Date().toISOString(), estado: 'curso', ejemplo: true,
      instalacion: inst.id, instNombre: inst.nombre, guion: g.id, guionTitulo: g.titulo, tipo: g.tipo,
      ubicacion: ubic, ot: 'OT-EJEMPLO-' + Math.floor(Math.random() * 900 + 100), fecha: hoy(),
      tecnicos: [S.usuario.nombre], resp: {}, inst: {}, defectos: [], equiposUsados: [], enviado: [], pct: 0, version: VERSION,
    };
    // Fase 0 contestada como ejemplo
    g.fases[0].pasos.forEach(p => {
      const r = m.resp[p.id] = {};
      p.campos.forEach((c, ci) => {
        if (c.t === 'SINO') (r.sino ||= {})[ci] = true;
        if (c.t === 'TXT') (r.txt ||= {})[ci] = 'Ejemplo: acordado con el responsable de mantenimiento, 8:00–12:00.';
        if (c.t === 'SEL' && c.fuente === 'equipos') (r.sel ||= {})[ci] = [];
        if (c.t === 'ROLES') r.roles = { IV: 'Responsable GXO (ejemplo)', WV: S.usuario.nombre };
      });
      if (p.campos.some(c => c.t === 'SEL' && c.fuente === 'equipos')) r.na = true, r.naMotivo = 'Ejemplo sin equipos dados de alta';
    });
    m.pct = progresoTotal(g, m, S.crit, perfilDe(inst)).pct;
    await db.put('mant', m);
  }
}

init();
