/* Radar MP — prototipo Fase 0. Datos: JSON publicados por los buscadores en la nube. */
const FUENTES = ['../datos/ingenieria-dek.json', '../datos/friometal.json'];
const KEY_MARCAS = 'radarMarcas';
const KEY_VISITA = 'radarUltimaVisita';

let perfiles = [];          // [{nombre, licitaciones[], compra_agil[]}]
let rubroActivo = 'todos';
let generado = '';

const $ = id => document.getElementById(id);

function marcas() { try { return JSON.parse(localStorage.getItem(KEY_MARCAS)) || {}; } catch (e) { return {}; } }
function setMarca(cod, val) {
  const m = marcas();
  if (val) m[cod] = val; else delete m[cod];
  localStorage.setItem(KEY_MARCAS, JSON.stringify(m));
  render();
  toast(val ? (val === 'DESCARTADA' ? 'Descartada' : 'Marcada ★') : 'Marca quitada');
}
function toast(txt) {
  const t = $('toast'); t.textContent = txt; t.classList.add('ver');
  setTimeout(() => t.classList.remove('ver'), 1600);
}
function copiar(cod) {
  navigator.clipboard.writeText(cod).then(() => toast('Código copiado: ' + cod));
}

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
  return `<div class="card ${claseDias(n)} ${m === 'INTERESA' ? 'm-interesa' : ''} ${m === 'DESCARTADA' ? 'm-descartada' : ''}"
    data-region="${it.region}" data-tipo="lic" data-nueva="${it.nueva ? 1 : 0}" data-marca="${m}">
    <h3><a href="${it.link}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges">${it.nueva ? '<span class="badge oro">★ NUEVA</span>' : ''}${badgeDias(n, it.cierre)}
      ${it.tipo ? `<span class="badge">${it.tipo}</span>` : ''}${monto(it.monto)}</div>
    <div class="meta">${it.organismo} · ${(it.region || '').replace('Región', 'Reg.')} · ${rubro}</div>
    ${it.desc ? `<details><summary>Descripción</summary>${it.desc}</details>` : ''}
    <div class="acciones">
      <button onclick="setMarca('${it.codigo}','INTERESA')">★ Interesa</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      <button onclick="setMarca('${it.codigo}',null)">↺</button>
    </div></div>`;
}

function cardCA(it, rubro) {
  const n = dias(it.cierre);
  if (n !== null && n < 0) return '';
  const m = marcas()[it.codigo] || '';
  return `<div class="card ${claseDias(n)} agil ${m === 'COTIZADA' ? 'm-interesa' : ''} ${m === 'DESCARTADA' ? 'm-descartada' : ''}"
    data-region="${it.region}" data-tipo="agil" data-nueva="0" data-marca="${m}">
    <h3><a href="${it.ficha}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges"><span class="badge agil">⚡ COMPRA ÁGIL</span>${badgeDias(n, it.cierre)}${monto(it.monto)}
      <span class="badge">${it.ofertas || 0} ofertas</span></div>
    <div class="meta">${it.organismo} · ${(it.region || '').replace('Región', 'Reg.')} · ${rubro}</div>
    ${it.productos ? `<details><summary>Ver ficha</summary><b>Piden:</b> ${it.productos}<br>
      <b>Condiciones:</b> ${it.condiciones || '-'}<br><b>Entrega:</b> ${it.entrega || '-'}</details>` : ''}
    <div class="acciones">
      <button onclick="copiar('${it.codigo}')">📋 ${it.codigo}</button>
      <button onclick="setMarca('${it.codigo}','COTIZADA')">✔ Cotizada</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      <button onclick="setMarca('${it.codigo}',null)">↺</button>
    </div></div>`;
}

function render() {
  const tipo = $('fTipo').value, region = $('fRegion').value, ver = $('fVer').value;
  const piezas = [];
  for (const p of perfiles) {
    if (rubroActivo !== 'todos' && p.nombre !== rubroActivo) continue;
    const items = [];
    if (tipo !== 'agil') for (const it of p.licitaciones) items.push([it.cierre || '9999', cardLic(it, p.nombre)]);
    if (tipo !== 'lic') for (const it of p.compra_agil) items.push([it.cierre || '9999', cardCA(it, p.nombre)]);
    piezas.push(...items);
  }
  piezas.sort((a, b) => a[0].localeCompare(b[0]));
  $('lista').innerHTML = piezas.map(x => x[1]).join('') || '<div class="vacio">Sin resultados con estos filtros</div>';

  // filtros post-render (region / ver)
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
  const chips = ['todos', ...perfiles.map(p => p.nombre)];
  $('chips').innerHTML = chips.map(c =>
    `<button class="chip ${c === rubroActivo ? 'activo' : ''}" onclick="setRubro('${c}')">${c === 'todos' ? 'Todos los rubros' : c}</button>`).join('');
  const regiones = new Set();
  perfiles.forEach(p => [...p.licitaciones, ...p.compra_agil].forEach(it => it.region && regiones.add(it.region)));
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
  const resultados = await Promise.allSettled(FUENTES.map(u => fetch(u + '?t=' + Date.now()).then(r => r.json())));
  perfiles = [];
  for (const r of resultados) {
    if (r.status !== 'fulfilled') continue;
    generado = r.value.generado || generado;
    perfiles.push(...(r.value.perfiles || []));
  }
  $('actualizado').textContent = perfiles.length
    ? 'Datos actualizados: ' + generado + ' · se refrescan solos 3× al día'
    : 'No se pudieron cargar los datos — revisa tu conexión';
  armarUI(); render(); avisarNovedades();
}

/* instalación PWA */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); promptInstalar = e; $('instalar').style.display = 'block';
});
$('instalar').addEventListener('click', async () => {
  if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; $('instalar').style.display = 'none'; }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

cargar();
