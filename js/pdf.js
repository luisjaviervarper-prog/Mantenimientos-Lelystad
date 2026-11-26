// Informe PDF con formato OSMOS, generado en el propio móvil con pdf-lib (vendor/pdf-lib.min.js).
import { tIdioma } from './i18n.js';
import { clave, pasoOmitido, instanciasDe, resumen, resultadoDe, horasCorte, evaluarFila } from './guion.js';

const AZUL = [0, 58 / 255, 105 / 255];
const AMBAR = [235 / 255, 171 / 255, 0];
const GRIS = [0.35, 0.4, 0.44];
const GRIS_CLARO = [0.957, 0.965, 0.973];
const VERDE = [0.18, 0.49, 0.2], ROJO = [0.78, 0.16, 0.16], AZUL_A = [0.1, 0.46, 0.82];

// WinAnsi: sustituye lo que Helvetica estándar no puede escribir
const MAPA = { 'Ω': 'Ohm', 'Δ': 'D', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '✓': 'OK', '✗': 'X', '·': '·', ' ': ' ', ' ': ' ', ' ': ' ', 'μ': 'µ', '−': '-', '⋅': '·' };
const WIN = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function limpio(s) {
  s = String(s ?? '');
  let o = '';
  for (const ch of s) {
    const m = MAPA[ch];
    if (m !== undefined) { o += m; continue; }
    const c = ch.charCodeAt(0);
    if (ch === '\n' || (c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN.has(ch)) o += ch;
    else o += '?';
  }
  return o;
}

const corta = (t, n) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n) > 20 ? t.lastIndexOf(' ', n) : n) + '…';

export async function generarInforme({ m, g, inst, usuario, getFoto, lang = 'es', logoBytes }) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const T = s => tIdioma(s, lang);
  // Textos de guiones, catálogos y listas: diccionario data/i18n/en.json (solo informe en inglés)
  const DIC = lang === 'en' ? await fetch('data/i18n/en.json').then(r => r.json()).catch(() => ({})) : {};
  const NOMBRES = { Celda: 'Cell', Trafo: 'Transformer', Cuadro: 'Panel', Luminaria: 'Luminaire' };
  const X = s => {
    if (lang !== 'en' || s == null) return s;
    if (DIC[s] != null) return DIC[s];
    const mm = String(s).match(/^(Celda|Trafo|Cuadro|Luminaria)\s+(\S+)$/);
    if (mm) return NOMBRES[mm[1]] + ' ' + mm[2];
    return s;
  };
  const XU = s => String(s ?? '').split(' · ').map(X).join(' · ');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${lang === 'en' ? 'Maintenance report' : 'Informe de mantenimiento'} ${inst.nombre} ${X(m.ubicacion)}`);
  pdf.setAuthor('OSMOS Sistemas Eléctricos');
  pdf.setCreator('OSMOS Mantenimiento');
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  const C = a => rgb(a[0], a[1], a[2]);
  const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
  const perfil = inst.perfil === 'lelystad' ? 'lelystad' : 'sabon';
  const crit = await fetch('data/criterios.json').then(r => r.json());
  let page, y;

  const titulo = `${T('INFORME DE MANTENIMIENTO')} ${lang === 'en' ? { MT: 'MV', BT: 'LV' }[g.tipo] : g.tipo}`;
  function cabecera() {
    page = pdf.addPage([W, H]);
    if (logo) {
      const h = 34, w = logo.width * h / logo.height;
      page.drawImage(logo, { x: M, y: H - M - h + 6, width: w, height: h });
    }
    page.drawText(limpio(titulo), { x: W - M - FB.widthOfTextAtSize(limpio(titulo), 11), y: H - M - 6, size: 11, font: FB, color: C(AZUL) });
    const sub = limpio(`${inst.nombre} · ${X(m.ubicacion)} · ${lang === 'en' ? 'WO' : 'OT'} ${m.ot || '-'}`);
    page.drawText(sub, { x: W - M - F.widthOfTextAtSize(sub, 8.5), y: H - M - 20, size: 8.5, font: F, color: C(GRIS) });
    page.drawRectangle({ x: M, y: H - M - 36, width: CW, height: 2, color: C(AMBAR) });
    y = H - M - 52;
  }
  const bottom = M + 30;
  function espacio(h) { if (y - h < bottom) cabecera(); }

  function wrap(text, font, size, width) {
    const out = [];
    limpio(text).split('\n').forEach(par => {
      const words = par.split(/\s+/);
      let line = '';
      words.forEach(w => {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else {
          if (line) out.push(line);
          // palabra más larga que la línea
          while (font.widthOfTextAtSize(w, size) > width) {
            let i = w.length;
            while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
            out.push(w.slice(0, i)); w = w.slice(i);
          }
          line = w;
        }
      });
      out.push(line);
    });
    return out;
  }

  function parrafo(text, { size = 9, font = F, color = [0.1, 0.1, 0.1], gap = 3, x = M, width = CW } = {}) {
    const lines = wrap(text, font, size, width);
    lines.forEach(l => {
      espacio(size + gap);
      page.drawText(l, { x, y: y - size, size, font, color: C(color) });
      y -= size + gap;
    });
  }

  function seccion(text) {
    espacio(40);
    y -= 8;
    page.drawRectangle({ x: M, y: y - 18, width: CW, height: 18, color: C(AZUL) });
    page.drawText(limpio(text.toUpperCase()), { x: M + 8, y: y - 13, size: 10, font: FB, color: rgb(1, 1, 1) });
    y -= 26;
  }

  function subseccion(text) {
    espacio(30);
    y -= 4;
    page.drawRectangle({ x: M, y: y - 15, width: 3, height: 15, color: C(AMBAR) });
    page.drawText(limpio(text), { x: M + 9, y: y - 11, size: 9.5, font: FB, color: C(AZUL) });
    y -= 21;
  }

  // Tabla: cols [{w, head}], rows: [[{text, color, bold}|string]]
  function tabla(cols, rows, { size = 8, head = true } = {}) {
    const pad = 4;
    const drawHead = () => {
      const hh = size + 2 * pad + 2;
      espacio(hh + 20);
      let x = M;
      page.drawRectangle({ x: M, y: y - hh, width: CW, height: hh, color: C(GRIS_CLARO) });
      cols.forEach(c => {
        page.drawText(limpio(c.head), { x: x + pad, y: y - hh + pad + 2, size, font: FB, color: C(AZUL) });
        x += c.w * CW;
      });
      y -= hh;
    };
    if (head) drawHead();
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) => {
        const o = typeof cell === 'object' && cell !== null ? cell : { text: cell };
        o.lines = wrap(o.text ?? '', o.bold ? FB : F, size, cols[i].w * CW - 2 * pad);
        return o;
      });
      const h = Math.max(...cells.map(c => c.lines.length)) * (size + 2) + 2 * pad;
      if (y - h < bottom) { cabecera(); if (head) drawHead(); }
      if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.985, 0.988, 0.99) });
      let x = M;
      cells.forEach((c, i) => {
        c.lines.forEach((l, li) => page.drawText(l, {
          x: x + pad, y: y - pad - size - li * (size + 2) + 1, size, font: c.bold ? FB : F, color: C(c.color || [0.1, 0.1, 0.1]),
        }));
        x += cols[i].w * CW;
      });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + CW, y: y - h }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
      y -= h;
    });
    y -= 6;
  }

  async function imagenes(list) {
    // list: [{id, pie}]  2 por fila
    const gap = 10, w = (CW - gap) / 2;
    for (let i = 0; i < list.length; i += 2) {
      const pair = [];
      for (const it of list.slice(i, i + 2)) {
        const f = await getFoto(it.id);
        if (!f) continue;
        const bytes = new Uint8Array(await f.blob.arrayBuffer());
        let img;
        try { img = f.blob.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes); } catch { continue; }
        const h = Math.min(w * img.height / img.width, 230);
        const ww = h * img.width / img.height;
        pair.push({ img, h, ww, pie: it.pie + (f.fecha ? ' · ' + new Date(f.fecha).toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES') : '') });
      }
      if (!pair.length) continue;
      const rowH = Math.max(...pair.map(p => p.h)) + 26;
      espacio(rowH);
      pair.forEach((p, j) => {
        const x = M + j * (w + gap);
        page.drawImage(p.img, { x: x + (w - p.ww) / 2, y: y - p.h, width: p.ww, height: p.h });
        const lines = wrap(p.pie, F, 7, w).slice(0, 2);
        lines.forEach((l, li) => page.drawText(l, { x, y: y - p.h - 10 - li * 9, size: 7, font: F, color: C(GRIS) }));
      });
      y -= rowH;
    }
  }

  const fmtFecha = d => d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES') : '-';
  const R = resumen(g, m);
  const resultado = resultadoDe(g, m);
  const escala = perfil === 'lelystad' ? ['A', 'B', 'C', 'D'] : ['Muy grave', 'Grave', 'Leve'];

  // ---------- Portada / datos generales ----------
  cabecera();
  seccion(T('Datos generales'));
  const roles = Object.values(m.resp).find(r => r.roles)?.roles;
  tabla([{ w: 0.3, head: '' }, { w: 0.7, head: '' }], [
    [{ text: T('Instalación'), bold: true }, inst.nombre + (inst.cliente ? ` (${inst.cliente})` : '')],
    [{ text: T('Guion'), bold: true }, `${lang === 'en' ? { MT: 'MV', BT: 'LV' }[g.tipo] : g.tipo} · ${X(g.titulo)}`],
    [{ text: g.tipo === 'MT' ? T('Centro / estación') : T('Edificio / zona'), bold: true }, X(m.ubicacion)],
    [{ text: T('Nº de OT'), bold: true }, m.ot || '-'],
    [{ text: T('Fecha'), bold: true }, fmtFecha(m.fecha) + (m.terminado ? ' → ' + fmtFecha(m.terminado) : '')],
    [{ text: T('Técnicos'), bold: true }, (m.tecnicos || []).join(', ') || usuario?.nombre || '-'],
    ...(roles ? [[{ text: 'IV / WV', bold: true }, `${roles.IV || '-'} / ${roles.WV || '-'}`]] : []),
    [{ text: T('Equipos de medida'), bold: true }, (m.equiposUsados || []).map(e => `${e.nombre} (${e.serie})`).join('; ') || '-'],
  ], { head: false, size: 8.5 });

  seccion(T('Resumen'));
  const rc = { FAVORABLE: VERDE, CONDICIONADO: AMBAR, DESFAVORABLE: ROJO }[resultado] || GRIS;
  const EN = lang === 'en';
  espacio(40);
  page.drawRectangle({ x: M, y: y - 30, width: CW, height: 30, borderColor: C(rc), borderWidth: 1.5, color: rgb(1, 1, 1) });
  page.drawText(limpio(`${T('Resultado global')}: ${X(resultado) || '-'}`), { x: M + 10, y: y - 19, size: 12, font: FB, color: C(rc) });
  y -= 40;
  const lineasRes = [
    `${T('Defectos')}: ${R.nDefectos}  (` + escala.map(e => `${e}: ${R.porGravedad[e] || 0}`).join(' · ') + ')',
    `C: ${R.cont.C} · I: ${R.cont.I} · N: ${R.cont.N} · A: ${R.cont.A}`,
  ];
  Object.entries(R.inst).forEach(([k, v]) => { const n = X(k); lineasRes.push(`${n[0].toUpperCase() + n.slice(1)}s: ${v}`); });
  if (R.lumKO) lineasRes.push(`${EN ? 'Failed emergency luminaires' : 'Luminarias de emergencia KO'}: ${R.lumKO}`);
  if (perfil === 'lelystad') lineasRes.push(`${EN ? 'GnO findings closed' : 'Constataciones GnO cerradas'}: ${R.gnoCerradas}`);
  const hc = horasCorte(g, m);
  if (hc.length) lineasRes.push(`${T('Horario del corte')}: ` + hc.map(h => h.hora).join(' → '));
  lineasRes.forEach(l => parrafo(l, { size: 9 }));

  // ---------- Desarrollo ----------
  seccion(T('Desarrollo del mantenimiento'));
  const estadoTxt = { C: ['C · ' + T('Correcto'), VERDE], I: ['I · ' + T('Incorrecto'), ROJO], N: ['N · ' + T('No procede'), GRIS], A: ['A · ' + T('Corregido'), AZUL_A] };
  const fotosFase = [];
  for (const f of g.fases) {
    const insts = f.repetir ? instanciasDe(m, f) : [null];
    if (f.repetir && !insts.length) { subseccion(`${T('Fase')} ${f.n} · ${X(f.titulo)}`); parrafo(lang === 'en' ? `No ${X(f.repetir)}s recorded.` : `Sin ${f.repetir}s registrados.`, { color: GRIS }); continue; }
    for (const ins of insts) {
      subseccion(`${T('Fase')} ${f.n} · ${X(f.titulo)}${ins ? ' — ' + X(ins.nombre) : ''}`);
      const rows = [];
      for (const p of f.pasos) {
        const iid = ins?.id || null;
        const r = m.resp[clave(p, iid)] || {};
        const ptxt = X(p.texto);
        let res = [], det = [];
        if (pasoOmitido(f, p, m, iid)) { rows.push([ptxt, { text: X('Sin corte'), color: GRIS }, '']); continue; }
        if (r.na) { rows.push([ptxt, { text: T('No procede'), color: GRIS }, r.naMotivo || '']); continue; }
        let color = null;
        p.campos.forEach((c, ci) => {
          switch (c.t) {
            case 'CINA': if (r.cina?.[ci]) { res.push(estadoTxt[r.cina[ci]][0]); color = estadoTxt[r.cina[ci]][1]; } break;
            case 'OKKO': if (r.okko?.[ci]) { res.push(r.okko[ci]); color = r.okko[ci] === 'OK' ? VERDE : ROJO; } break;
            case 'SINO': if (r.sino?.[ci]) res.push(lang === 'en' ? 'Yes' : 'Sí'); break;
            case 'SEL': {
              const v = r.sel?.[ci];
              if (c.fuente === 'equipos') det.push((v || []).join(', '));
              else if (v) det.push((c.label ? X(c.label) + ': ' : '') + X(v));
              break;
            }
            case 'ID': if (r.id) det.push(X(r.id)); break;
            case 'TXT': if (r.txt?.[ci]) det.push(r.txt[ci]); break;
            case 'MED': (r.med?.[ci] || []).forEach((fila, fi) => {
              const ev = evaluarFila(p, c, fila, crit, perfil, lang);
              const partes = c.campos.map((cc, k) => `${X(cc.label)}: ${EN ? String(fila[k] ?? '-').replace(/^(-?\d+),(\d+)$/, '$1.$2') : (fila[k] ?? '-')}${cc.unidad ? ' ' + cc.unidad : ''}${ev.campos[k] && !ev.campos[k].ok ? ' (!)' : ''}`);
              det.push((r.med[ci].length > 1 ? `#${fi + 1} ` : '') + partes.join(' · ') + (r.medEq?.[ci] ? ` [${r.medEq[ci]}]` : ''));
              ev.extra.forEach(x => det.push(x.msg + (x.ok ? '' : ' (!)')));
              if (ev.campos.some(x => !x.ok) || ev.extra.some(x => !x.ok)) color = ROJO;
            }); break;
            case 'FIRMA': det.push((lang === 'en' ? 'Signed: ' : 'Firmado: ') + Object.keys(r.firmas || {}).map(X).join(', ')); break;
            case 'LMRA': if (r.lmra) det.push(`LMRA: ${Object.values(r.lmra).filter(Boolean).length}/${Object.keys(r.lmra).length} OK`); break;
            case 'ROLES': if (r.roles) det.push(`IV: ${r.roles.IV} · WV: ${r.roles.WV}`); break;
            case 'RESUMEN': det.push(`${R.nDefectos} ${EN ? (R.nDefectos === 1 ? 'defect' : 'defects') : 'defectos'}`); break;
            case 'DEFECTOS': {
              const n = m.defectos.filter(d => (d.inst || null) === iid).length;
              det.push(`${n} ${EN ? (n === 1 ? 'defect' : 'defects') : 'defectos'}`); break;
            }
            case 'FOTO': (r.fotos?.[ci] || []).forEach(id => fotosFase.push({ id, pie: `F${f.n}${ins ? ' ' + X(ins.nombre) : ''} · ${corta(ptxt, 80)}` })); break;
          }
        });
        (r.fotosA || []).forEach((id, k) => fotosFase.push({ id, pie: `${k === 0 ? (EN ? 'Before' : 'Antes') : (EN ? 'After' : 'Después')} (A) · ${corta(ptxt, 70)}` }));
        const nfotos = Object.values(r.fotos || {}).flat().length + (r.fotosA || []).length;
        if (nfotos) det.push(`${nfotos} ${EN ? 'photo(s)' : 'foto(s)'}`);
        if (r.nota) det.push(r.nota);
        const def = m.defectos.filter(d => d.paso === p.id && (d.inst || null) === iid);
        if (def.length) det.push(def.map(d => `→ ${d.codigo} (${d.gravedad})`).join(' '));
        rows.push([ptxt, { text: res.join(' / ') || (color === ROJO ? (lang === 'en' ? 'Out of range' : 'Fuera de criterio') : det.length ? '✓' : '-'), color: color || [0.1, 0.1, 0.1], bold: !!color }, det.filter(Boolean).join('\n')]);
      }
      tabla([{ w: 0.44, head: T('Paso') }, { w: 0.16, head: T('Resultado') }, { w: 0.40, head: T('Medidas y observaciones') }], rows);
    }
  }

  // ---------- Defectos ----------
  seccion(T('Defectos'));
  if (!m.defectos.length) parrafo(T('Sin defectos registrados.'));
  else {
    const gcol = d => ({ 'Muy grave': ROJO, A: ROJO, Grave: [0.85, 0.4, 0], B: [0.85, 0.4, 0], Leve: AMBAR, C: AMBAR, D: GRIS })[d] || GRIS;
    tabla([
      { w: 0.1, head: T('Código') }, { w: 0.11, head: perfil === 'lelystad' ? T('Clase') : T('Gravedad') },
      { w: 0.2, head: T('Ubicación') }, { w: 0.27, head: T('Descripción') }, { w: 0.2, head: T('Propuesta') }, { w: 0.12, head: T('Estado') },
    ], m.defectos.map(d => [
      { text: d.codigo, bold: true }, { text: d.gravedad, color: gcol(d.gravedad), bold: true }, XU(d.ubic),
      X(d.texto) + (d.desc ? '\n' + d.desc : '') + (d.gno ? `\nGnO: ${d.gno}` : '') + (d.justif ? `\n(${d.justif})` : ''),
      d.propuesta || '-', T(d.estado) + (d.resp ? '\n' + X(d.resp) : ''),
    ]), { size: 7.5 });
    const fd = [];
    m.defectos.forEach(d => (d.fotos || []).forEach(id => fd.push({ id, pie: `${d.codigo} · ${XU(d.ubic)}` })));
    if (fd.length) { subseccion(T('Fotos') + ' · ' + T('Defectos')); await imagenes(fd); }
  }

  // ---------- Fotos ----------
  if (fotosFase.length) { seccion(T('Fotos')); await imagenes(fotosFase); }

  // ---------- Firmas ----------
  const firmas = [];
  Object.values(m.resp).forEach(r => Object.entries(r.firmas || {}).forEach(([q, d]) => firmas.push([q, d])));
  if (firmas.length) {
    seccion(T('Firmas'));
    const w = (CW - 20) / 2;
    for (let i = 0; i < firmas.length; i += 2) {
      espacio(110);
      for (let j = 0; j < 2 && i + j < firmas.length; j++) {
        const [q, d] = firmas[i + j];
        const x = M + j * (w + 20);
        try {
          const img = await pdf.embedPng(Uint8Array.from(atob(d.split(',')[1]), c => c.charCodeAt(0)));
          const h = 70, ww = Math.min(w, h * img.width / img.height);
          page.drawImage(img, { x, y: y - h, width: ww, height: h });
        } catch { /* firma vacía */ }
        page.drawLine({ start: { x, y: y - 74 }, end: { x: x + w, y: y - 74 }, thickness: 0.6, color: C(GRIS) });
        page.drawText(limpio(X(q)), { x, y: y - 86, size: 8, font: F, color: C(GRIS) });
      }
      y -= 100;
    }
  }

  // ---------- Pie y numeración ----------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const pie = limpio(`OSMOS Sistemas Eléctricos · www.osmos.es · ${EN ? 'Technical Department' : 'Departamento Técnico'}`);
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: W - M, y: M + 14 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
    p.drawText(pie, { x: M, y: M, size: 7.5, font: F, color: C(GRIS) });
    const num = `${T('Página')} ${i + 1} ${T('de')} ${pages.length}`;
    p.drawText(num, { x: W - M - F.widthOfTextAtSize(num, 7.5), y: M, size: 7.5, font: F, color: C(GRIS) });
  });

  const bytes = await pdf.save();
  return new File([bytes], nombreInforme(m, g, inst), { type: 'application/pdf' });
}

export function nombreInforme(m, g, inst) {
  const s = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `OSMOS_Mant_${s(inst.nombre)}_${s(m.ubicacion)}_${g.tipo}_${(m.fecha || '').slice(0, 10)}.pdf`;
}

// Datos del informe en CSV (para Excel). Con lang 'en' y el diccionario, sale en inglés.
export function csvInforme(m, g, lang = 'es', DIC = {}) {
  const EN = lang === 'en';
  const X = v => (EN && DIC[v] != null) ? DIC[v] : v;
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const out = [(EN ? ['Phase', 'Item', 'Step', 'Type', 'Field', 'Value', 'Unit'] : ['Fase', 'Instancia', 'Paso', 'Tipo', 'Campo', 'Valor', 'Unidad']).map(q).join(';')];
  g.fases.forEach(f => {
    const insts = f.repetir ? instanciasDe(m, f) : [null];
    insts.forEach(ins => f.pasos.forEach(p => {
      const r = m.resp[clave(p, ins?.id || null)];
      if (!r) return;
      const base = [f.n + ' ' + X(f.titulo), ins?.nombre || '', X(p.texto)];
      if (r.na) { out.push([...base, 'NA', '', EN ? 'N/A' : 'No procede', ''].map(q).join(';')); return; }
      p.campos.forEach((c, ci) => {
        if (c.t === 'CINA' && r.cina?.[ci]) out.push([...base, 'CINA', '', r.cina[ci], ''].map(q).join(';'));
        if (c.t === 'OKKO' && r.okko?.[ci]) out.push([...base, 'OK/KO', '', r.okko[ci], ''].map(q).join(';'));
        if (c.t === 'SEL' && r.sel?.[ci]) out.push([...base, 'SEL', X(c.label || ''), [].concat(r.sel[ci]).map(X).join(', '), ''].map(q).join(';'));
        if (c.t === 'TXT' && r.txt?.[ci]) out.push([...base, 'TXT', '', r.txt[ci], ''].map(q).join(';'));
        if (c.t === 'MED') (r.med?.[ci] || []).forEach((fila, fi) => c.campos.forEach((cc, k) =>
          out.push([...base, 'MED', X(cc.label) + (r.med[ci].length > 1 ? ' #' + (fi + 1) : ''), fila[k], cc.unidad].map(q).join(';'))));
      });
    }));
  });
  out.push('');
  out.push((EN ? ['Code', 'Class', 'Location', 'Defect', 'Description', 'Proposal', 'Status', 'GnO ID'] : ['Código', 'Gravedad', 'Ubicación', 'Defecto', 'Descripción', 'Propuesta', 'Estado', 'ID GnO']).map(q).join(';'));
  m.defectos.forEach(d => out.push([d.codigo, d.gravedad, String(d.ubic || '').split(' · ').map(X).join(' · '), X(d.texto), d.desc, d.propuesta, X(d.estado), d.gno].map(q).join(';')));
  return '\ufeff' + out.join('\r\n');
}
