/* Radar MP — prototipo Fase 0/1.
   Datos: JSON publicados por los buscadores en la nube (4 actualizaciones diarias).
   Perfiles de empresa: creados por el usuario, guardados en este dispositivo,
   con matching sobre el universo completo de licitaciones y compras ágiles. */
const FUENTES = ['../datos/ingenieria-dek.json', '../datos/friometal.json'];
const G_LIC = '../datos/global_licitaciones.json';
const G_CA = '../datos/global_compra_agil.json';
const KEY_MARCAS = 'radarMarcas';
const KEY_VISITA = 'radarUltimaVisita';
const KEY_PERFILES = 'radarPerfiles';

let perfiles = [];          // curados: [{nombre, licitaciones[], compra_agil[]}]
let globalLic = [];         // universo: [{c,n,f}]
let globalCA = [];          // universo: [{c,n,f,o,r,m,of}]
let rubroActivo = 'todos';
let generado = '';

const $ = id => document.getElementById(id);
const norm = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function marcas() { try { return JSON.parse(localStorage.getItem(KEY_MARCAS)) || {}; } catch (e) { return {}; } }
function misPerfiles() { try { return JSON.parse(localStorage.getItem(KEY_PERFILES)) || []; } catch (e) { return []; } }
function setMarca(cod, val) {
  const m = marcas();
  if (val) m[cod] = val; else delete m[cod];
  localStorage.setItem(KEY_MARCAS, JSON.stringify(m));
  render();
  toast(val ? (val === 'DESCARTADA' ? 'Descartada' : 'Marcada ★') : 'Marca quitada');
}
function toast(txt) {
  const t = $('toast'); t.textContent = txt; t.classList.add('ver');
  setTimeout(() => t.classList.remove('ver'), 1800);
}
function copiar(cod) {
  navigator.clipboard.writeText(cod).then(() => toast('Código copiado: ' + cod));
}

/* ---------- asistente IA ---------- */
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
function btnIA(d) {
  return `<button onclick="analizarIA('${encodeURIComponent(JSON.stringify(d)).replace(/'/g, '%27')}')">🤖 Analizar con IA</button>`;
}

/* ---------- tarjetas ---------- */
function dias(cierre) {
  if (!cierre) return null;
  const d = new Date(cierre.replace(' ', 'T'));
  if (isNaN(d)) return null;
  return Math.floor((d - new Date()) / 86400000);
}
function claseDias(n) { return n === null ? 'holgado' : n <= 1 ? 'urgente' : n <= 5 ? 'pronto' : 'holgado'; }
function badgeDias(n, cierre) {
  if (n === null) return '<span class="badge">sin fecha</span>';
  const c = n <= 1 ? 'rojo' : n <= 5 ? 'naranjo' : 'verde';
  const txt = n < 0 ? 'cerrada' : n === 0 ? 'cierra HOY' : n === 1 ? 'cierra mañana' : `cierra en ${n} días`;
  return `<span class="badge ${c}" title="${cierre}">${txt}</span>`;
}
function monto(m) {
  return m ? '<span class="badge azul">$' + Math.round(m).toLocaleString('es-CL') + '</span>' : '';
}

function cardLic(it, rubro) {
  const n = dias(it.cierre);
  if (n !== null && n < 0) return '';
  const m = marcas()[it.codigo] || '';
  const ia = { tipo: 'lic', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: it.link };
  return `<div class="card ${claseDias(n)} ${m === 'INTERESA' ? 'm-interesa' : ''} ${m === 'DESCARTADA' ? 'm-descartada' : ''}"
    data-region="${it.region || ''}" data-tipo="lic" data-nueva="${it.nueva ? 1 : 0}" data-marca="${m}">
    <h3><a href="${it.link}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges">${it.nueva ? '<span class="badge oro">★ NUEVA</span>' : ''}${badgeDias(n, it.cierre)}
      ${it.tipo ? `<span class="badge">${it.tipo}</span>` : ''}${monto(it.monto)}</div>
    <div class="meta">${it.organismo || ''} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${rubro}</div>
    ${it.desc ? `<details><summary>Descripción</summary>${it.desc}</details>` : ''}
    <div class="acciones">
      <button onclick="setMarca('${it.codigo}','INTERESA')">★ Interesa</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      ${btnIA(ia)}
    </div></div>`;
}

function cardCA(it, rubro) {
  const n = dias(it.cierre);
  if (n !== null && n < 0) return '';
  const m = marcas()[it.codigo] || '';
  const ficha = it.ficha || ('https://compra-agil.mercadopublico.cl/resumen-cotizacion/' + it.codigo);
  const ia = { tipo: 'agil', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: ficha,
               productos: it.productos, condiciones: it.condiciones };
  return `<div class="card ${claseDias(n)} agil ${m === 'COTIZADA' ? 'm-interesa' : ''} ${m === 'DESCARTADA' ? 'm-descartada' : ''}"
    data-region="${it.region || ''}" data-tipo="agil" data-nueva="0" data-marca="${m}">
    <h3><a href="${ficha}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges"><span class="badge agil">⚡ COMPRA ÁGIL</span>${badgeDias(n, it.cierre)}${monto(it.monto)}
      <span class="badge">${it.ofertas || 0} ofertas</span></div>
    <div class="meta">${it.organismo || ''} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${rubro}</div>
    ${it.productos ? `<details><summary>Ver ficha</summary><b>Piden:</b> ${it.productos}<br>
      <b>Condiciones:</b> ${it.condiciones || '-'}<br><b>Entrega:</b> ${it.entrega || '-'}</details>` : ''}
    <div class="acciones">
      <button onclick="copiar('${it.codigo}')">📋 ${it.codigo}</button>
      <button onclick="setMarca('${it.codigo}','COTIZADA')">✔ Cotizada</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      ${btnIA(ia)}
    </div></div>`;
}

/* ---------- perfiles de empresa del usuario ---------- */
function matchPerfil(p, texto) {
  const t = norm(texto);
  if ((p.excluir || []).some(e => e && t.includes(e))) return false;
  return (p.claves || []).some(c => c && t.includes(c));
}
function itemsDePerfilPropio(p) {
  const lic = globalLic.filter(it => matchPerfil(p, it.n)).map(it => ({
    codigo: it.c, nombre: it.n, cierre: it.f,
    link: 'https://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + it.c,
  }));
  const ca = globalCA.filter(it => matchPerfil(p, it.n)).map(it => ({
    codigo: it.c, nombre: it.n, cierre: it.f, organismo: it.o,
    region: it.r, monto: it.m, ofertas: it.of,
  }));
  return { lic, ca };
}
function guardarPerfil() {
  const nombre = $('pNombre').value.trim();
  const claves = $('pClaves').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const excluir = $('pExcluir').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  if (!nombre || !claves.length) { toast('Falta el nombre o las palabras clave'); return; }
  const lista = misPerfiles().filter(p => p.nombre !== nombre);
  lista.push({ nombre, claves, excluir, propio: true });
  localStorage.setItem(KEY_PERFILES, JSON.stringify(lista));
  $('formPerfil').style.display = 'none';
  rubroActivo = nombre;
  armarUI(); render();
  toast('Perfil "' + nombre + '" creado — buscando en todo Chile');
}
function borrarPerfil(nombre) {
  localStorage.setItem(KEY_PERFILES, JSON.stringify(misPerfiles().filter(p => p.nombre !== nombre)));
  rubroActivo = 'todos';
  armarUI(); render();
}
function abrirForm(nombre) {
  const p = misPerfiles().find(x => x.nombre === nombre);
  $('pNombre').value = p ? p.nombre : '';
  $('pClaves').value = p ? p.claves.join(', ') : '';
  $('pExcluir').value = p ? p.excluir.join(', ') : '';
  $('formPerfil').style.display = 'block';
  $('pNombre').focus();
}

/* ---------- render ---------- */
function render() {
  const tipo = $('fTipo').value, region = $('fRegion').value, ver = $('fVer').value;
  const piezas = [];
  const propio = misPerfiles().find(p => p.nombre === rubroActivo);

  if (propio) {
    const { lic, ca } = itemsDePerfilPropio(propio);
    if (tipo !== 'agil') lic.forEach(it => piezas.push([it.cierre || '9999', cardLic(it, propio.nombre)]));
    if (tipo !== 'lic') ca.forEach(it => piezas.push([it.cierre || '9999', cardCA(it, propio.nombre)]));
  } else {
    for (const p of perfiles) {
      if (rubroActivo !== 'todos' && p.nombre !== rubroActivo) continue;
      if (tipo !== 'agil') p.licitaciones.forEach(it => piezas.push([it.cierre || '9999', cardLic(it, p.nombre)]));
      if (tipo !== 'lic') p.compra_agil.forEach(it => piezas.push([it.cierre || '9999', cardCA(it, p.nombre)]));
    }
  }
  piezas.sort((a, b) => a[0].localeCompare(b[0]));
  $('lista').innerHTML = piezas.map(x => x[1]).join('') ||
    '<div class="vacio">Sin resultados. ' + (propio ? 'Prueba con otras palabras clave (botón ✎ del perfil).' : '') + '</div>';

  let visibles = 0;
  document.querySelectorAll('.card').forEach(c => {
    let ok = (region === 'todas' || c.dataset.region === region);
    const marca = c.dataset.marca;
    if (ver === 'activas') ok = ok && marca !== 'DESCARTADA';
    if (ver === 'nuevas') ok = ok && c.dataset.nueva === '1' && marca !== 'DESCARTADA';
    if (ver === 'marcadas') ok = ok && (marca === 'INTERESA' || marca === 'COTIZADA');
    if (ver === 'todas' && marca === 'DESCARTADA') c.classList.remove('m-descartada');
    c.style.display = ok ? '' : 'none';
    if (ok) visibles++;
  });
  $('conteo').textContent = visibles + ' oportunidades · datos: ' + generado;
}

function armarUI() {
  const propios = misPerfiles();
  let html = `<button class="chip ${rubroActivo === 'todos' ? 'activo' : ''}" onclick="setRubro('todos')">Todos</button>`;
  html += propios.map(p =>
    `<button class="chip propio ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">🏢 ${p.nombre}</button>`).join('');
  html += perfiles.map(p =>
    `<button class="chip ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">${p.nombre}</button>`).join('');
  html += `<button class="chip crear" onclick="abrirForm()">➕ Mi empresa</button>`;
  $('chips').innerHTML = html;

  const esPropio = propios.some(p => p.nombre === rubroActivo);
  $('gestionPerfil').style.display = esPropio ? 'flex' : 'none';

  const regiones = new Set();
  perfiles.forEach(p => [...p.licitaciones, ...p.compra_agil].forEach(it => it.region && regiones.add(it.region)));
  globalCA.forEach(it => it.r && regiones.add(it.r));
  $('fRegion').innerHTML = '<option value="todas">Todas las regiones</option>' +
    [...regiones].sort().map(r => `<option value="${r}">${r}</option>`).join('');
}
function setRubro(r) { rubroActivo = r; armarUI(); render(); }

function avisarNovedades() {
  const ultima = localStorage.getItem(KEY_VISITA) || '';
  let nuevas = 0;
  perfiles.forEach(p => p.licitaciones.forEach(it => { if (it.encontrada && it.encontrada > ultima) nuevas++; }));
  if (ultima && nuevas > 0) {
    $('avisoNuevas').textContent = `★ ${nuevas} oportunidades nuevas desde tu última visita`;
    $('avisoNuevas').style.display = 'inline-block';
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('Radar MP', { body: `${nuevas} oportunidades nuevas en tus rubros`, icon: 'icon.svg' });
  }
  localStorage.setItem(KEY_VISITA, new Date().toISOString().slice(0, 10));
  if ('Notification' in window && Notification.permission === 'default')
    setTimeout(() => Notification.requestPermission(), 4000);
}

async function cargar() {
  const [curados, gl, gc] = await Promise.allSettled([
    Promise.allSettled(FUENTES.map(u => fetch(u + '?t=' + Date.now()).then(r => r.json()))),
    fetch(G_LIC + '?t=' + Date.now()).then(r => r.json()),
    fetch(G_CA + '?t=' + Date.now()).then(r => r.json()),
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
  $('actualizado').textContent = perfiles.length
    ? `Datos: ${generado} · universo: ${globalLic.length.toLocaleString('es-CL')} licitaciones + ${globalCA.length.toLocaleString('es-CL')} compras ágiles · 4 actualizaciones/día`
    : 'No se pudieron cargar los datos — revisa tu conexión';
  armarUI(); render(); avisarNovedades();
}

/* instalación PWA */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); promptInstalar = e; $('instalar').style.display = 'block';
});
document.addEventListener('DOMContentLoaded', () => {
  $('instalar').addEventListener('click', async () => {
    if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; $('instalar').style.display = 'none'; }
  });
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

cargar();
