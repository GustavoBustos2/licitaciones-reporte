/* Radar MP — beta 2.
   Datos: JSON publicados por la nube. Perfiles multi-empresa + pipeline + precios. */
const FUENTES = ['../datos/ingenieria-dek.json', '../datos/friometal.json'];
const G_LIC = '../datos/global_licitaciones.json';
const G_CA = '../datos/global_compra_agil.json';
const G_PRECIOS = '../datos/precios.json';
const KEY_MARCAS = 'radarMarcas';
const KEY_VISITA = 'radarUltimaVisita';
const KEY_PERFILES = 'radarPerfiles';
const KEY_ONBOARD = 'radarOnboarded';
const PAGINA = 40;
const ETAPAS = { EVALUANDO: '🟡 Evaluando', PREPARANDO: '🟠 Preparando', ENVIADA: '🔵 Enviada',
                 GANADA: '🟢 Ganada', PERDIDA: '⚪ Perdida', DESCARTADA: '✖ Descartada' };

let perfiles = [], globalLic = [], globalCA = [], precios = [];
let rubroActivo = 'todos', generado = '', limite = PAGINA;

const $ = id => document.getElementById(id);
const norm = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function marcas() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY_MARCAS)) || {};
    // migración de marcas antiguas al pipeline
    for (const k in m) {
      if (m[k] === 'INTERESA') m[k] = 'EVALUANDO';
      if (m[k] === 'COTIZADA') m[k] = 'ENVIADA';
    }
    return m;
  } catch (e) { return {}; }
}
function misPerfiles() { try { return JSON.parse(localStorage.getItem(KEY_PERFILES)) || []; } catch (e) { return []; } }
function setMarca(cod, val) {
  const m = marcas();
  if (val) m[cod] = val; else delete m[cod];
  localStorage.setItem(KEY_MARCAS, JSON.stringify(m));
  render();
  toast(val ? ETAPAS[val] || val : 'Sin etapa');
}
function toast(txt) {
  const t = $('toast'); t.textContent = txt; t.classList.add('ver');
  setTimeout(() => t.classList.remove('ver'), 1800);
}
function copiar(cod) { navigator.clipboard.writeText(cod).then(() => toast('Código copiado: ' + cod)); }
function cerrarPaneles() {
  ['formPerfil', 'panelEmpresas', 'panelPipeline', 'panelPrecios', 'panelComprador']
    .forEach(id => $(id).style.display = 'none');
}
function abrirPanel(id) { cerrarPaneles(); $(id).style.display = 'block'; $(id).scrollIntoView({ behavior: 'smooth' }); }

/* ---------- onboarding ---------- */
function empezar(crearPerfil) {
  localStorage.setItem(KEY_ONBOARD, '1');
  $('bienvenida').style.display = 'none';
  if (crearPerfil) abrirForm();
}

/* ---------- compartir / calendario / IA ---------- */
function compartir(datos) {
  const d = JSON.parse(decodeURIComponent(datos));
  const texto = `📡 Oportunidad en Mercado Público:\n${d.nombre}\n${d.monto ? 'Monto: $' + Math.round(d.monto).toLocaleString('es-CL') + '\n' : ''}Cierra: ${d.cierre || 's/i'}\n${d.link}`;
  if (navigator.share) navigator.share({ title: 'Radar MP', text: texto }).catch(() => {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}
function recordar(datos) {
  const d = JSON.parse(decodeURIComponent(datos));
  if (!d.cierre) { toast('Sin fecha de cierre'); return; }
  const dt = new Date(d.cierre.replace(' ', 'T'));
  const fmt = x => x.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ini = fmt(new Date(dt.getTime() - 3600000)), fin = fmt(dt);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RadarMP//ES', 'BEGIN:VEVENT',
    'UID:' + d.codigo + '@radarmp', 'DTSTART:' + ini, 'DTEND:' + fin,
    'SUMMARY:CIERRA: ' + d.nombre.replace(/[,;]/g, ' '),
    'DESCRIPTION:' + (d.link || ''), 'BEGIN:VALARM', 'TRIGGER:-P1D',
    'ACTION:DISPLAY', 'DESCRIPTION:Cierra mañana', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  a.download = 'cierre-' + d.codigo + '.ics';
  a.click();
  toast('Recordatorio creado — ábrelo para agregarlo a tu calendario');
}
function analizarIA(datos) {
  const d = JSON.parse(decodeURIComponent(datos));
  const prompt =
`Actúa como asesor experto en compras públicas de Chile (Mercado Público). Analiza esta oportunidad y entrégame:
1) Qué están pidiendo exactamente y requisitos probables para participar.
2) Checklist concreto para preparar una ${d.tipo === 'agil' ? 'cotización de Compra Ágil competitiva' : 'oferta (documentos, garantías y anexos típicos)'}.
3) Riesgos o letra chica a revisar.
4) Sugerencia de estrategia de precio.

DATOS DE LA OPORTUNIDAD:
- Nombre: ${d.nombre}
- Código: ${d.codigo}
- Organismo: ${d.organismo || 's/i'}
- Región: ${d.region || 's/i'}
- Monto referencial: ${d.monto ? '$' + Math.round(d.monto).toLocaleString('es-CL') + ' CLP' : 's/i'}
- Cierre: ${d.cierre || 's/i'}
${d.productos ? '- Qué piden: ' + d.productos : ''}
${d.condiciones ? '- Condiciones: ' + d.condiciones : ''}
- Ficha: ${d.link}

Si te subo las bases o términos de referencia en PDF, incorpóralos al análisis.`;
  navigator.clipboard.writeText(prompt).then(() => {
    toast('Análisis copiado — pégalo en tu IA favorita');
    window.open('https://chatgpt.com/?q=' + encodeURIComponent(prompt).slice(0, 7000), '_blank');
  });
}
const pack = d => encodeURIComponent(JSON.stringify(d)).replace(/'/g, '%27');

/* ---------- historial del comprador ---------- */
function verComprador(nombre) {
  const n = decodeURIComponent(nombre);
  const enCA = globalCA.filter(it => it.o === n);
  const abiertas = enCA.length;
  let enPerfiles = 0;
  perfiles.forEach(p => [...p.licitaciones, ...p.compra_agil].forEach(it => { if (it.organismo === n) enPerfiles++; }));
  const montos = enCA.map(it => it.m).filter(m => m > 0);
  const prom = montos.length ? '$' + Math.round(montos.reduce((a, b) => a + b, 0) / montos.length).toLocaleString('es-CL') : 's/i';
  $('contenidoComprador').innerHTML = `<b style="font-size:14px">🏛 ${n}</b>
    <div class="hint" style="margin-top:8px;font-size:12.5px;line-height:1.7">
    • Compras ágiles abiertas ahora: <b>${abiertas}</b> (monto promedio: <b>${prom}</b>)<br>
    • Apariciones en los rubros monitoreados: <b>${enPerfiles}</b><br><br>
    Un comprador con compras frecuentes de tu rubro es un cliente para cultivar: gana una chica,
    cumple impecable, y las siguientes se inclinan a tu favor.</div>`;
  abrirPanel('panelComprador');
}
const orgClick = o => o ? `<span class="org" onclick="verComprador('${encodeURIComponent(o)}')">${o}</span>` : '';

/* ---------- tarjetas ---------- */
function dias(cierre) {
  if (!cierre) return null;
  const d = new Date(cierre.replace(' ', 'T'));
  return isNaN(d) ? null : Math.floor((d - new Date()) / 86400000);
}
const claseDias = n => n === null ? 'holgado' : n <= 1 ? 'urgente' : n <= 5 ? 'pronto' : 'holgado';
function badgeDias(n, cierre) {
  if (n === null) return '<span class="badge">sin fecha</span>';
  const c = n <= 1 ? 'rojo' : n <= 5 ? 'naranjo' : 'verde';
  const txt = n === 0 ? 'cierra HOY' : n === 1 ? 'cierra mañana' : `cierra en ${n} días`;
  return `<span class="badge ${c}" title="${cierre}">${txt}</span>`;
}
const montoB = m => m ? '<span class="badge azul">$' + Math.round(m).toLocaleString('es-CL') + '</span>' : '';

function selEstado(codigo, actual) {
  const ops = Object.entries(ETAPAS).map(([k, v]) =>
    `<option value="${k}" ${k === actual ? 'selected' : ''}>${v}</option>`).join('');
  return `<select class="estado" onchange="setMarca('${codigo}', this.value || null)">
    <option value="">Etapa…</option>${ops}</select>`;
}

function htmlLic(x) {
  const it = x.it, n = x.dias, m = x.marca;
  const ia = { tipo: 'lic', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: it.link };
  return `<div class="card ${claseDias(n)} ${m ? 'e-' + m : ''}">
    <h3><a href="${it.link}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges">${it.nueva ? '<span class="badge oro">★ NUEVA</span>' : ''}${badgeDias(n, it.cierre)}
      ${it.tipo ? `<span class="badge">${it.tipo}</span>` : ''}${montoB(it.monto)}</div>
    <div class="meta">${orgClick(it.organismo)} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${x.rubro}</div>
    ${it.desc ? `<details><summary>Descripción</summary>${it.desc}</details>` : ''}
    <div class="acciones">
      ${selEstado(it.codigo, m)}
      <button onclick="recordar('${pack(ia)}')" title="agregar cierre al calendario">🗓</button>
      <button onclick="compartir('${pack(ia)}')">↗</button>
      <button onclick="analizarIA('${pack(ia)}')">🤖 IA</button>
    </div></div>`;
}

function htmlCA(x) {
  const it = x.it, n = x.dias, m = x.marca;
  const ficha = it.ficha || ('https://compra-agil.mercadopublico.cl/resumen-cotizacion/' + it.codigo);
  const ia = { tipo: 'agil', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: ficha,
               productos: it.productos, condiciones: it.condiciones };
  return `<div class="card ${claseDias(n)} agil ${m ? 'e-' + m : ''}">
    <h3><a href="${ficha}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges"><span class="badge agil">⚡ COMPRA ÁGIL</span>${badgeDias(n, it.cierre)}${montoB(it.monto)}
      <span class="badge">${it.ofertas || 0} ofertas</span></div>
    <div class="meta">${orgClick(it.organismo)} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${x.rubro}</div>
    ${it.productos ? `<details><summary>Ver ficha</summary><b>Piden:</b> ${it.productos}<br>
      <b>Condiciones:</b> ${it.condiciones || '-'}<br><b>Entrega:</b> ${it.entrega || '-'}</details>` : ''}
    <div class="acciones">
      ${selEstado(it.codigo, m)}
      <button onclick="copiar('${it.codigo}')">📋</button>
      <button onclick="recordar('${pack(ia)}')">🗓</button>
      <button onclick="compartir('${pack(ia)}')">↗</button>
      <button onclick="analizarIA('${pack(ia)}')">🤖 IA</button>
    </div></div>`;
}

/* ---------- plantillas ---------- */
const PLANTILLAS = {
  '💻 Informática': { claves: 'informatica, computador, notebook, impresora, software, licencia, soporte tecnico, desarrollo de sistema, servidor, redes, toner', excluir: '' },
  '🏗 Construcción': { claves: 'construccion, mejoramiento, reparacion, techumbre, cierre perimetral, hormigon, multicancha, sede social, ampliacion, pintura', excluir: 'arriendo, adquisicion de materiales' },
  '🦺 EPP y vestuario': { claves: 'elementos de proteccion, epp, calzado de seguridad, ropa de trabajo, vestuario, uniforme, guantes, casco', excluir: 'teatro, ballet, escolar, arriendo' },
  '❄ Climatización': { claves: 'climatizacion, aire acondicionado, refrigeracion, calefaccion, camara de frio, caldera, aislacion termica', excluir: 'refrigerador, congelador, arriendo, lena' },
  '🧹 Aseo y limpieza': { claves: 'aseo, limpieza, sanitizacion, desratizacion, desinsectacion, lavanderia', excluir: 'insumos, articulos de aseo' },
  '🍽 Alimentación': { claves: 'alimentacion, alimentos, colaciones, abarrotes, banqueteria, coffee break', excluir: '' },
  '🚌 Transporte': { claves: 'transporte, traslado, flete, buses, transporte escolar', excluir: '' },
  '📚 Capacitación': { claves: 'capacitacion, curso, taller, relatoria, charla, diplomado', excluir: '' },
  '🪑 Oficina y mobiliario': { claves: 'mobiliario, escritorios, sillas, articulos de oficina, papeleria, estantes', excluir: 'arriendo' },
  '🌳 Áreas verdes': { claves: 'areas verdes, poda, jardines, riego, paisajismo, mantencion de parques', excluir: '' },
  '📹 Seguridad': { claves: 'vigilancia, guardias, camaras de seguridad, alarmas, control de acceso', excluir: '' },
  '🎪 Eventos': { claves: 'produccion de evento, amplificacion, escenario, carpas, animacion, actividad masiva', excluir: '' },
};
function usarPlantilla(nombre) {
  const p = PLANTILLAS[nombre];
  $('pClaves').value = p.claves;
  $('pExcluir').value = p.excluir;
  if (!$('pNombre').value.trim()) $('pNombre').value = nombre.replace(/^\S+\s/, '');
  contarVivo();
  toast('Plantilla cargada — edítala a tu medida');
}
function contarVivo() {
  const claves = $('pClaves').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const excluir = $('pExcluir').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const el = $('contadorVivo');
  if (!claves.length) { el.textContent = ''; return; }
  const p = { claves, excluir };
  const nLic = globalLic.filter(it => matchPerfil(p, it.n)).length;
  const nCA = globalCA.filter(it => matchPerfil(p, it.n)).length;
  el.innerHTML = `📊 Con estas palabras verías hoy <b>${nLic} licitaciones</b> y <b>${nCA} compras ágiles ⚡</b> activas en Chile.` +
    (nLic + nCA > 600 ? ' <span style="color:#d62828">Quizás demasiado amplio — afina o agrega exclusiones.</span>' : '') +
    (nLic + nCA < 5 ? ' <span style="color:#f77f00">Muy pocas — prueba términos más generales o sinónimos.</span>' : '');
}

/* ---------- perfiles propios ---------- */
function matchPerfil(p, texto) {
  const t = norm(texto);
  if ((p.excluir || []).some(e => e && t.includes(e))) return false;
  return (p.claves || []).some(c => c && t.includes(c));
}
function statsPerfil(p) {
  return { nLic: globalLic.filter(it => matchPerfil(p, it.n)).length,
           nCA: globalCA.filter(it => matchPerfil(p, it.n)).length };
}
function guardarPerfil() {
  const nombre = $('pNombre').value.trim();
  const claves = $('pClaves').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const excluir = $('pExcluir').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  if (!nombre || !claves.length) { toast('Falta el nombre o las palabras clave'); return; }
  const lista = misPerfiles().filter(p => p.nombre !== nombre);
  lista.push({ nombre, claves, excluir });
  localStorage.setItem(KEY_PERFILES, JSON.stringify(lista));
  cerrarPaneles();
  rubroActivo = nombre;
  armarUI(); renderDesdeCero();
  toast('Perfil "' + nombre + '" activo — buscando en todo Chile');
}
function borrarPerfil(nombre) {
  localStorage.setItem(KEY_PERFILES, JSON.stringify(misPerfiles().filter(p => p.nombre !== nombre)));
  rubroActivo = 'todos';
  armarUI(); renderDesdeCero();
}
function duplicarPerfil(nombre) {
  const p = misPerfiles().find(x => x.nombre === nombre);
  if (!p) return;
  const lista = misPerfiles();
  let copia = p.nombre + ' (copia)', i = 2;
  while (lista.some(x => x.nombre === copia)) copia = p.nombre + ' (copia ' + (i++) + ')';
  lista.push({ nombre: copia, claves: [...p.claves], excluir: [...(p.excluir || [])] });
  localStorage.setItem(KEY_PERFILES, JSON.stringify(lista));
  armarUI(); abrirEmpresas();
  toast('Duplicada como "' + copia + '"');
}
function abrirForm(nombre) {
  const p = misPerfiles().find(x => x.nombre === nombre);
  $('pNombre').value = p ? p.nombre : '';
  $('pClaves').value = p ? p.claves.join(', ') : '';
  $('pExcluir').value = p ? (p.excluir || []).join(', ') : '';
  $('plantillas').innerHTML = Object.keys(PLANTILLAS).map(n =>
    `<button type="button" class="chip" style="font-size:11px;padding:4px 10px" onclick="usarPlantilla('${n}')">${n}</button>`).join('');
  contarVivo();
  abrirPanel('formPerfil');
}
function abrirEmpresas() {
  const lista = misPerfiles();
  $('listaEmpresas').innerHTML = lista.length ? lista.map(p => {
    const s = statsPerfil(p);
    return `<div class="emp">
      <b>🏢 ${p.nombre}</b>
      <div class="kw"><b>Busca:</b> ${p.claves.join(', ')}${(p.excluir || []).length ? '<br><b>Excluye:</b> ' + p.excluir.join(', ') : ''}</div>
      <div class="stats">📊 Hoy: ${s.nLic} licitaciones · ${s.nCA} compras ágiles ⚡</div>
      <div class="btns">
        <button style="background:#0d3b66;color:#fff;border:none" onclick="cerrarPaneles();setRubro('${p.nombre}')">👁 Ver</button>
        <button onclick="rubroActivo='${p.nombre}';abrirForm('${p.nombre}')">✎ Editar</button>
        <button onclick="duplicarPerfil('${p.nombre}')">⧉ Duplicar</button>
        <button onclick="if(confirm('¿Eliminar ${p.nombre}?')){borrarPerfil('${p.nombre}');abrirEmpresas()}">🗑</button>
      </div></div>`;
  }).join('') : '<div class="hint" style="margin-top:10px">Aún no has creado empresas. Crea la primera 👇</div>';
  abrirPanel('panelEmpresas');
}
function exportarEmpresas() {
  const datos = JSON.stringify({ perfiles: misPerfiles(), marcas: marcas() });
  const codigo = btoa(unescape(encodeURIComponent(datos)));
  navigator.clipboard.writeText(codigo).then(() => {
    toast('Código copiado — pégalo en "Importar" en tu otro dispositivo');
    if (navigator.share) navigator.share({ title: 'Radar MP — respaldo', text: codigo }).catch(() => {});
  });
}
function importarEmpresas() {
  const codigo = prompt('Pega aquí el código exportado desde tu otro dispositivo:');
  if (!codigo) return;
  try {
    const datos = JSON.parse(decodeURIComponent(escape(atob(codigo.trim()))));
    const actuales = misPerfiles();
    (datos.perfiles || []).forEach(p => {
      if (!actuales.some(x => x.nombre === p.nombre)) actuales.push(p);
    });
    localStorage.setItem(KEY_PERFILES, JSON.stringify(actuales));
    const m = marcas();
    Object.assign(m, datos.marcas || {});
    localStorage.setItem(KEY_MARCAS, JSON.stringify(m));
    armarUI(); abrirEmpresas();
    toast('Importado: ' + (datos.perfiles || []).length + ' empresas con sus marcas');
  } catch (e) { toast('Código inválido'); }
}

/* ---------- pipeline ---------- */
function abrirPipeline() {
  const m = marcas();
  const conteo = {};
  Object.values(m).forEach(v => conteo[v] = (conteo[v] || 0) + 1);
  $('embudo').innerHTML = Object.entries(ETAPAS).filter(([k]) => k !== 'DESCARTADA').map(([k, v]) =>
    `<div class="etapa" onclick="cerrarPaneles();document.getElementById('fVer').value='${k}';renderDesdeCero()">
      <b>${conteo[k] || 0}</b><span>${v}</span></div>`).join('');
  abrirPanel('panelPipeline');
}

/* ---------- precios de mercado ---------- */
function abrirPrecios() {
  const propio = misPerfiles().find(p => p.nombre === rubroActivo);
  let filas = precios;
  if (propio) filas = precios.filter(r => matchPerfil(propio, r.nombre));
  $('contenidoPrecios').innerHTML = filas.length
    ? `<table class="precios"><tr><th>Compra</th><th>Ofertas</th><th>Rango</th><th>Ganó</th></tr>` +
      filas.slice(0, 30).map(r =>
        `<tr><td>${r.nombre.slice(0, 55)}</td><td>${r.ofertas}</td>
         <td>${r.min ? '$' + Math.round(r.min).toLocaleString('es-CL') + '–$' + Math.round(r.max).toLocaleString('es-CL') : 's/i'}</td>
         <td>${r.ganador ? r.ganador.slice(0, 25) + '<br><b>$' + Math.round(r.monto || 0).toLocaleString('es-CL') + '</b>' : 'en evaluación'}</td></tr>`).join('') + '</table>'
    : '<div class="hint" style="margin-top:10px">Aún estamos recolectando precios de procesos adjudicados de tu rubro. Esta sección se llenará sola en los próximos días.</div>';
  abrirPanel('panelPrecios');
}

/* ---------- recolección + render ---------- */
function recolectar() {
  const out = [];
  const propio = misPerfiles().find(p => p.nombre === rubroActivo);
  const m = marcas();
  const push = (it, esCA, rubro) => {
    const n = dias(it.cierre);
    if (n !== null && n < 0) return;
    out.push({ it, esCA, rubro, dias: n, marca: m[it.codigo] || '',
               nombreN: norm(it.nombre), region: it.region || '' });
  };
  if (propio) {
    globalLic.forEach(g => { if (matchPerfil(propio, g.n)) push({
      codigo: g.c, nombre: g.n, cierre: g.f,
      link: 'https://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + g.c }, false, propio.nombre); });
    globalCA.forEach(g => { if (matchPerfil(propio, g.n)) push({
      codigo: g.c, nombre: g.n, cierre: g.f, organismo: g.o, region: g.r,
      monto: g.m, ofertas: g.of }, true, propio.nombre); });
  } else {
    for (const p of perfiles) {
      if (rubroActivo !== 'todos' && p.nombre !== rubroActivo) continue;
      p.licitaciones.forEach(it => push(it, false, p.nombre));
      p.compra_agil.forEach(it => push(it, true, p.nombre));
    }
  }
  return out;
}

function render() {
  const tipo = $('fTipo').value, region = $('fRegion').value, ver = $('fVer').value;
  const rMonto = $('fMonto').value;
  const q = norm($('fTexto').value.trim());
  let items = recolectar().filter(x => {
    if (tipo === 'agil' && !x.esCA) return false;
    if (tipo === 'lic' && x.esCA) return false;
    if (region !== 'todas' && x.region !== region) return false;
    if (q && !x.nombreN.includes(q)) return false;
    if (rMonto !== 'todos') {
      const mm = x.it.monto;
      if (rMonto === 'chico' && !(mm && mm <= 5e6)) return false;
      if (rMonto === 'medio' && !(mm && mm > 5e6 && mm <= 5e7)) return false;
      if (rMonto === 'grande' && !(mm && mm > 5e7)) return false;
    }
    if (ver === 'activas' && x.marca === 'DESCARTADA') return false;
    if (ver === 'nuevas' && (!x.it.nueva || x.marca === 'DESCARTADA')) return false;
    if (ETAPAS[ver] && x.marca !== ver) return false;
    return true;
  });
  items.sort((a, b) => (a.it.cierre || '9999').localeCompare(b.it.cierre || '9999'));

  const visibles = items.slice(0, limite);
  let html = visibles.map(x => x.esCA ? htmlCA(x) : htmlLic(x)).join('');
  if (!html) html = '<div class="vacio">Sin resultados con estos filtros.</div>';
  if (items.length > limite)
    html += `<button class="mas" onclick="limite+=${PAGINA};render()">Mostrar ${Math.min(PAGINA, items.length - limite)} más (${items.length - limite} restantes)</button>`;
  $('lista').innerHTML = html;
  $('conteo').textContent = items.length.toLocaleString('es-CL') + ' oportunidades';
}
function renderDesdeCero() { limite = PAGINA; render(); }

function armarUI() {
  const propios = misPerfiles();
  let html = propios.length
    ? `<button class="chip crear" onclick="abrirEmpresas()">🏢 Mis empresas (${propios.length})</button>`
    : `<button class="chip crear" onclick="abrirForm()">➕ Mi empresa</button>`;
  html += propios.map(p =>
    `<button class="chip propio ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">🏢 ${p.nombre}</button>`).join('');
  html += `<button class="chip ${rubroActivo === 'todos' ? 'activo' : ''}" onclick="setRubro('todos')">Ejemplos</button>`;
  html += perfiles.map(p =>
    `<button class="chip ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">${p.nombre}</button>`).join('');
  $('chips').innerHTML = html;

  const regiones = new Set();
  perfiles.forEach(p => [...p.licitaciones, ...p.compra_agil].forEach(it => it.region && regiones.add(it.region)));
  globalCA.forEach(it => it.r && regiones.add(it.r));
  const sel = $('fRegion').value;
  $('fRegion').innerHTML = '<option value="todas">Todas las regiones</option>' +
    [...regiones].sort().map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${r}</option>`).join('');
  $('btnPrecios').style.display = precios.length ? 'block' : 'block';
}
function setRubro(r) { rubroActivo = r; armarUI(); renderDesdeCero(); }

function avisarNovedades() {
  const ultima = localStorage.getItem(KEY_VISITA) || '';
  let nuevas = 0;
  perfiles.forEach(p => p.licitaciones.forEach(it => { if (it.encontrada && it.encontrada > ultima) nuevas++; }));
  if (ultima && nuevas > 0) {
    $('avisoNuevas').textContent = `★ ${nuevas} oportunidades nuevas desde tu última visita`;
    $('avisoNuevas').style.display = 'inline-block';
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('Radar MP', { body: `${nuevas} oportunidades nuevas`, icon: 'icon-192.png' });
  }
  localStorage.setItem(KEY_VISITA, new Date().toISOString().slice(0, 10));
  if ('Notification' in window && Notification.permission === 'default')
    setTimeout(() => Notification.requestPermission(), 4000);
}

async function cargar() {
  const [curados, gl, gc, pr] = await Promise.allSettled([
    Promise.allSettled(FUENTES.map(u => fetch(u + '?t=' + Date.now()).then(r => r.json()))),
    fetch(G_LIC + '?t=' + Date.now()).then(r => r.json()),
    fetch(G_CA + '?t=' + Date.now()).then(r => r.json()),
    fetch(G_PRECIOS + '?t=' + Date.now()).then(r => r.json()),
  ]);
  perfiles = [];
  if (curados.status === 'fulfilled')
    for (const r of curados.value) {
      if (r.status !== 'fulfilled') continue;
      generado = r.value.generado || generado;
      perfiles.push(...(r.value.perfiles || []));
    }
  globalLic = gl.status === 'fulfilled' ? (gl.value.items || []) : [];
  globalCA = gc.status === 'fulfilled' ? (gc.value.items || []) : [];
  precios = pr.status === 'fulfilled' ? (pr.value.items || []) : [];
  $('actualizado').textContent = perfiles.length
    ? `Actualizado: ${generado} · ${globalLic.length.toLocaleString('es-CL')} licitaciones y ${globalCA.length.toLocaleString('es-CL')} compras ágiles activas en Chile`
    : 'No se pudieron cargar los datos — revisa tu conexión';
  armarUI(); render(); avisarNovedades();
}

/* onboarding + instalación */
if (!localStorage.getItem(KEY_ONBOARD)) $('bienvenida').style.display = 'flex';
const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
if (esIos) $('hintIos').style.display = 'block';
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); promptInstalar = e; $('instalar').style.display = 'block';
});
$('instalar').addEventListener('click', () => {
  if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; $('instalar').style.display = 'none'; }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

cargar();
