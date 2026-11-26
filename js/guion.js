// Carga de guiones / catálogos y reglas de negocio del mantenimiento.
const cache = {};
async function json(path) {
  if (!cache[path]) cache[path] = fetch(path).then(r => { if (!r.ok) throw new Error(path); return r.json(); });
  return cache[path];
}

export const datos = {
  instalaciones: () => json('data/instalaciones.json').then(d => d.instalaciones),
  guion: id => json(`data/guiones/${id}.json`),
  defectos: () => json('data/defectos.json'),
  criterios: () => json('data/criterios.json'),
};

export async function instalacion(id) { return (await datos.instalaciones()).find(i => i.id === id); }
export function perfilDe(inst) { return inst?.perfil === 'lelystad' ? 'lelystad' : 'sabon'; }

export const clave = (paso, inst) => inst ? `${paso.id}@${inst}` : paso.id;

// Criterio de un campo de medida según el perfil (Sabón/Laracha o Lelystad)
export function criterioCampo(crit, campo, perfil) {
  if (!campo.crit) return null;
  return crit[perfil]?.[campo.crit] || crit.comun?.[campo.crit] || null;
}

const num = v => (v === '' || v == null) ? NaN : parseFloat(String(v).replace(',', '.'));

// Devuelve [{ok, aviso, msg}] por campo de la fila, más evaluaciones calculadas.
export function evaluarFila(paso, med, fila, crit, perfil) {
  const res = med.campos.map((c, i) => {
    const cr = criterioCampo(crit, c, perfil);
    const v = num(fila[i]);
    if (!cr || isNaN(v)) return { ok: true };
    let ok = true;
    if (cr.min != null && v < cr.min) ok = false;
    if (cr.max != null && v > cr.max) ok = false;
    return { ok, aviso: cr.aviso && !ok, msg: cr.txt };
  });
  const extra = [];
  const labels = med.campos.map(c => c.label);
  // Termografía: ΔT = máx − referencia
  const iMax = labels.indexOf('Temperatura máxima'), iRef = labels.indexOf('Temperatura de referencia');
  if (iMax >= 0 && iRef >= 0 && !isNaN(num(fila[iMax])) && !isNaN(num(fila[iRef]))) {
    const dt = num(fila[iMax]) - num(fila[iRef]);
    const t = crit.termografia;
    const nivel = dt < t.ok ? 'ok' : dt <= t.medio ? 'medio' : 'alto';
    extra.push({
      ok: nivel === 'ok',
      msg: `ΔT = ${dt.toFixed(1)} °C → ${nivel === 'ok' ? 'correcto' : nivel === 'medio' ? (perfil === 'lelystad' ? 'clase C' : 'Leve') : (perfil === 'lelystad' ? 'clase B' : 'Grave')}`,
      gravedad: nivel === 'ok' ? null : nivel === 'medio' ? (perfil === 'lelystad' ? 'C' : 'Leve') : (perfil === 'lelystad' ? 'B' : 'Grave'),
    });
  }
  // Desequilibrio de fases
  const iL = ['L1', 'L2', 'L3'].map(l => labels.indexOf(l));
  if (iL.every(i => i >= 0)) {
    const v = iL.map(i => num(fila[i]));
    if (v.every(x => !isNaN(x))) {
      const m = (v[0] + v[1] + v[2]) / 3;
      const d = m > 0 ? Math.max(...v.map(x => Math.abs(x - m))) / m * 100 : 0;
      extra.push({ ok: d <= crit.desequilibrio.max, msg: `Desequilibrio de fases: ${d.toFixed(1)} % (${crit.desequilibrio.txt})` });
    }
  }
  return { campos: res, extra };
}

// ¿Hay alguna medida fuera de criterio (que obliga a abrir defecto)?
export function medidaNoCumple(paso, r, crit, perfil) {
  let falla = false, aviso = false;
  paso.campos.forEach((c, ci) => {
    if (c.t !== 'MED') return;
    const filas = r?.med?.[ci] || [];
    filas.forEach(f => {
      const ev = evaluarFila(paso, c, f, crit, perfil);
      ev.campos.forEach(x => { if (!x.ok) { if (x.aviso) aviso = true; else falla = true; } });
      ev.extra.forEach(x => { if (!x.ok) falla = true; });
    });
  });
  return { falla, aviso };
}

// Paso condicionado "con corte": se omite si en la misma fase/instancia se eligió "Sin corte"
export function pasoOmitido(fase, paso, m, inst) {
  if (paso.cond !== 'corte') return false;
  const pc = fase.pasos.find(p => p.campos.some(c => c.rol === 'corte'));
  if (!pc) return false;
  const r = m.resp[clave(pc, inst)];
  const ci = pc.campos.findIndex(c => c.rol === 'corte');
  return r?.sel?.[ci] === 'Sin corte';
}

export function defectosDePaso(m, paso, inst) {
  return m.defectos.filter(d => d.paso === paso.id && (d.inst || null) === (inst || null));
}

// Validación para poder avanzar. Devuelve lista de mensajes (vacía = OK)
export function validarPaso(fase, paso, m, inst, crit, perfil) {
  const k = clave(paso, inst);
  const r = m.resp[k] || {};
  if (r.na || pasoOmitido(fase, paso, m, inst)) return [];
  const err = [];
  const defs = defectosDePaso(m, paso, inst);
  let necesitaDefecto = false;
  paso.campos.forEach((c, ci) => {
    switch (c.t) {
      case 'CINA': {
        const v = r.cina?.[ci];
        if (!v) err.push('Marca C, I, N o A.');
        if (v === 'I') necesitaDefecto = true;
        if (v === 'A' && (r.fotosA || []).length < 2) err.push('Lo corregido (A) necesita foto del antes y del después.');
        break;
      }
      case 'FOTO': {
        const n = (r.fotos?.[ci] || []).length;
        if (n < (c.n || 1)) err.push(c.n > 1 ? `Faltan fotos (${n}/${c.n}).` : 'Falta la foto.');
        break;
      }
      case 'MED': {
        const filas = r.med?.[ci] || [];
        if (!filas.length || filas.some(f => c.campos.some((cc, i) => f[i] === '' || f[i] == null)))
          err.push('Completa todas las medidas.');
        break;
      }
      case 'SINO': if (!r.sino?.[ci]) err.push('Confirma la casilla.'); break;
      case 'TXT': if (paso.campos.length === 1 && !(r.txt?.[ci] || '').trim()) err.push('Escribe la observación.'); break;
      case 'SEL': {
        const v = r.sel?.[ci];
        if (c.fuente === 'equipos') { if (!(v || []).length) err.push('Selecciona los equipos usados.'); }
        else if (!v) err.push('Elige una opción.');
        break;
      }
      case 'ID': if (!(r.id || '').trim()) err.push('Indica el código.'); break;
      case 'OKKO': if (!r.okko?.[ci]) err.push('Marca OK o KO.'); else if (r.okko[ci] === 'KO') necesitaDefecto = true; break;
      case 'FIRMA': if (!r.firmas?.[c.quien[0]]) err.push(`Falta la firma: ${c.quien[0]}.`); break;
      case 'LMRA': if (!r.lmra || Object.values(r.lmra).length === 0 || Object.values(r.lmra).some(v => v !== true)) err.push('Responde SÍ a todas las preguntas del LMRA (si alguna es NO, no se empieza).'); break;
      case 'ROLES': if (!r.roles?.IV || !r.roles?.WV) err.push('Indica el IV y el WV.'); break;
      case 'RESUMEN': if (!r.resumenOk) err.push('Confirma el resumen.'); break;
    }
  });
  const mc = medidaNoCumple(paso, r, crit, perfil);
  if (mc.falla) necesitaDefecto = true;
  if (necesitaDefecto && !defs.length) err.push('Hay un punto incorrecto o una medida fuera de criterio: abre un defecto.');
  return err;
}

export function estadoPaso(fase, paso, m, inst, crit, perfil) {
  const r = m.resp[clave(paso, inst)];
  if (pasoOmitido(fase, paso, m, inst)) return 'omitido';
  if (!r) return 'pendiente';
  if (r.na) return 'na';
  return validarPaso(fase, paso, m, inst, crit, perfil).length ? 'incompleto' : 'hecho';
}

export function instanciasDe(m, fase) { return m.inst?.['F' + fase.n] || []; }

export function progresoFase(g, fase, m, crit, perfil) {
  const insts = fase.repetir ? instanciasDe(m, fase) : [null];
  let total = 0, hechos = 0;
  insts.forEach(i => fase.pasos.forEach(p => {
    total++;
    const e = estadoPaso(fase, p, m, i?.id || null, crit, perfil);
    if (e === 'hecho' || e === 'na' || e === 'omitido') hechos++;
  }));
  if (fase.repetir && !insts.length) return { total: 1, hechos: 0 };
  return { total, hechos };
}

export function progresoTotal(g, m, crit, perfil) {
  let t = 0, h = 0;
  g.fases.forEach(f => { const p = progresoFase(g, f, m, crit, perfil); t += p.total; h += p.hechos; });
  return { total: t, hechos: h, pct: t ? Math.round(h / t * 100) : 0 };
}

export function resumen(g, m) {
  const porGravedad = {};
  m.defectos.forEach(d => { porGravedad[d.gravedad] = (porGravedad[d.gravedad] || 0) + 1; });
  const inst = {};
  g.fases.filter(f => f.repetir).forEach(f => { inst[f.repetir] = instanciasDe(m, f).length; });
  const cont = { C: 0, I: 0, N: 0, A: 0 };
  Object.values(m.resp).forEach(r => Object.values(r.cina || {}).forEach(v => { if (v) cont[v]++; }));
  const lumKO = Object.values(m.resp).reduce((s, r) => s + Object.values(r.okko || {}).filter(v => v === 'KO').length, 0);
  const gnoCerradas = m.defectos.filter(d => d.gno && d.estado !== 'Abierto').length;
  return { porGravedad, inst, cont, lumKO, gnoCerradas, nDefectos: m.defectos.length };
}

export function resultadoDe(g, m) {
  for (const f of g.fases) for (const p of f.pasos) {
    const ci = p.campos.findIndex(c => c.rol === 'resultado');
    if (ci >= 0) { const v = m.resp[p.id]?.sel?.[ci]; if (v) return v; }
  }
  return m.resultado || '';
}

export function horasCorte(g, m) {
  const horas = [];
  g.fases.forEach(f => f.pasos.forEach(p => p.campos.forEach((c, ci) => {
    if (c.t === 'MED' && c.campos[0]?.tipo === 'hora') {
      const v = m.resp[p.id]?.med?.[ci]?.[0]?.[0];
      if (v) horas.push({ texto: p.texto, hora: v });
    }
  })));
  return horas;
}
