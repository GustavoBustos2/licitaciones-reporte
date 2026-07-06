/* Radar MP — beta.
   Datos: JSON publicados por la nube (4 actualizaciones/día).
   Perfiles de empresa: del usuario, en su dispositivo, matching sobre el universo completo. */
const FUENTES = ['../datos/ingenieria-dek.json', '../datos/friometal.json'];
const G_LIC = '../datos/global_licitaciones.json';
const G_CA = '../datos/global_compra_agil.json';
const KEY_MARCAS = 'radarMarcas';
const KEY_VISITA = 'radarUltimaVisita';
const KEY_PERFILES = 'radarPerfiles';
const KEY_ONBOARD = 'radarOnboarded';
const PAGINA = 40;

let perfiles = [], globalLic = [], globalCA = [];
let rubroActivo = 'todos', generado = '', limite = PAGINA;

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
function copiar(cod) { navigator.clipboard.writeText(cod).then(() => toast('Código copiado: ' + cod)); }

/* ---------- onboarding ---------- */
function empezar(crearPerfil) {
  localStorage.setItem(KEY_ONBOARD, '1');
  $('bienvenida').style.display = 'none';
  if (crearPerfil) abrirForm();
}

/* ---------- compartir ---------- */
function compartir(datos) {
  const d = JSON.parse(decodeURIComponent(datos));
  const texto = `📡 Oportunidad en Mercado Público:\n${d.nombre}\n${d.monto ? 'Monto: $' + Math.round(d.monto).toLocaleString('es-CL') + '\n' : ''}Cierra: ${d.cierre || 's/i'}\n${d.link}`;
  if (navigator.share) navigator.share({ title: 'Radar MP', text: texto }).catch(() => {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
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
const pack = d => encodeURIComponent(JSON.stringify(d)).replace(/'/g, '%27');

/* ---------- helpers de tarjetas ---------- */
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
const monto = m => m ? '<span class="badge azul">$' + Math.round(m).toLocaleString('es-CL') + '</span>' : '';

function htmlLic(x) {
  const it = x.it, n = x.dias, m = x.marca;
  const ia = { tipo: 'lic', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: it.link };
  return `<div class="card ${claseDias(n)} ${m === 'INTERESA' ? 'm-interesa' : ''}">
    <h3><a href="${it.link}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges">${it.nueva ? '<span class="badge oro">★ NUEVA</span>' : ''}${badgeDias(n, it.cierre)}
      ${it.tipo ? `<span class="badge">${it.tipo}</span>` : ''}${monto(it.monto)}</div>
    <div class="meta">${it.organismo || ''} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${x.rubro}</div>
    ${it.desc ? `<details><summary>Descripción</summary>${it.desc}</details>` : ''}
    <div class="acciones">
      <button onclick="setMarca('${it.codigo}','INTERESA')">★</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      <button onclick="compartir('${pack(ia)}')">↗ Compartir</button>
      <button onclick="analizarIA('${pack(ia)}')">🤖 IA</button>
    </div></div>`;
}

function htmlCA(x) {
  const it = x.it, n = x.dias, m = x.marca;
  const ficha = it.ficha || ('https://compra-agil.mercadopublico.cl/resumen-cotizacion/' + it.codigo);
  const ia = { tipo: 'agil', nombre: it.nombre, codigo: it.codigo, organismo: it.organismo,
               region: it.region, monto: it.monto, cierre: it.cierre, link: ficha,
               productos: it.productos, condiciones: it.condiciones };
  return `<div class="card ${claseDias(n)} agil ${m === 'COTIZADA' ? 'm-interesa' : ''}">
    <h3><a href="${ficha}" target="_blank" rel="noopener">${it.nombre}</a></h3>
    <div class="badges"><span class="badge agil">⚡ COMPRA ÁGIL</span>${badgeDias(n, it.cierre)}${monto(it.monto)}
      <span class="badge">${it.ofertas || 0} ofertas</span></div>
    <div class="meta">${it.organismo || ''} ${it.region ? '· ' + it.region.replace('Región', 'Reg.') : ''} · ${x.rubro}</div>
    ${it.productos ? `<details><summary>Ver ficha</summary><b>Piden:</b> ${it.productos}<br>
      <b>Condiciones:</b> ${it.condiciones || '-'}<br><b>Entrega:</b> ${it.entrega || '-'}</details>` : ''}
    <div class="acciones">
      <button onclick="copiar('${it.codigo}')">📋</button>
      <button onclick="setMarca('${it.codigo}','COTIZADA')">✔</button>
      <button onclick="setMarca('${it.codigo}','DESCARTADA')">✖</button>
      <button onclick="compartir('${pack(ia)}')">↗</button>
      <button onclick="analizarIA('${pack(ia)}')">🤖 IA</button>
    </div></div>`;
}

/* ---------- plantillas de rubros para partir ---------- */
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
function guardarPerfil() {
  const nombre = $('pNombre').value.trim();
  const claves = $('pClaves').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  const excluir = $('pExcluir').value.split(',').map(s => norm(s.trim())).filter(Boolean);
  if (!nombre || !claves.length) { toast('Falta el nombre o las palabras clave'); return; }
  const lista = misPerfiles().filter(p => p.nombre !== nombre);
  lista.push({ nombre, claves, excluir });
  localStorage.setItem(KEY_PERFILES, JSON.stringify(lista));
  $('formPerfil').style.display = 'none';
  rubroActivo = nombre;
  armarUI(); renderDesdeCero();
  toast('Perfil "' + nombre + '" activo — buscando en todo Chile');
}
function borrarPerfil(nombre) {
  localStorage.setItem(KEY_PERFILES, JSON.stringify(misPerfiles().filter(p => p.nombre !== nombre)));
  rubroActivo = 'todos';
  armarUI(); renderDesdeCero();
}
function abrirForm(nombre) {
  const p = misPerfiles().find(x => x.nombre === nombre);
  $('pNombre').value = p ? p.nombre : '';
  $('pClaves').value = p ? p.claves.join(', ') : '';
  $('pExcluir').value = p ? (p.excluir || []).join(', ') : '';
  $('plantillas').innerHTML = Object.keys(PLANTILLAS).map(n =>
    `<button type="button" class="chip" style="font-size:11px;padding:4px 10px" onclick="usarPlantilla('${n}')">${n}</button>`).join('');
  contarVivo();
  $('formPerfil').style.display = 'block';
  $('formPerfil').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- recolección + filtros + render ---------- */
function recolectar() {
  const out = [];
  const propio = misPerfiles().find(p => p.nombre === rubroActivo);
  const push = (it, esCA, rubro) => {
    const n = dias(it.cierre);
    if (n !== null && n < 0) return;
    out.push({ it, esCA, rubro, dias: n, marca: marcas()[it.codigo] || '',
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
  const q = norm($('fTexto').value.trim());
  let items = recolectar().filter(x => {
    if (tipo === 'agil' && !x.esCA) return false;
    if (tipo === 'lic' && x.esCA) return false;
    if (region !== 'todas' && x.region !== region) return false;
    if (q && !x.nombreN.includes(q)) return false;
    if (ver === 'activas' && x.marca === 'DESCARTADA') return false;
    if (ver === 'nuevas' && (!x.it.nueva || x.marca === 'DESCARTADA')) return false;
    if (ver === 'marcadas' && !(x.marca === 'INTERESA' || x.marca === 'COTIZADA')) return false;
    return true;
  });
  items.sort((a, b) => (a.it.cierre || '9999').localeCompare(b.it.cierre || '9999'));

  const visibles = items.slice(0, limite);
  let html = visibles.map(x => x.esCA ? htmlCA(x) : htmlLic(x)).join('');
  if (!html) html = '<div class="vacio">Sin resultados con estos filtros.</div>';
  if (items.length > limite)
    html += `<button class="mas" onclick="limite+=${PAGINA};render()">Mostrar ${Math.min(PAGINA, items.length - limite)} más (${items.length - limite} restantes)</button>`;
  $('lista').innerHTML = html;
  $('conteo').textContent = items.length + ' oport. · ' + generado;
}
function renderDesdeCero() { limite = PAGINA; render(); }

function armarUI() {
  const propios = misPerfiles();
  let html = `<button class="chip crear" onclick="abrirForm()">➕ Mi empresa</button>`;
  html += propios.map(p =>
    `<button class="chip propio ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">🏢 ${p.nombre}</button>`).join('');
  html += `<button class="chip ${rubroActivo === 'todos' ? 'activo' : ''}" onclick="setRubro('todos')">Ejemplos</button>`;
  html += perfiles.map(p =>
    `<button class="chip ${p.nombre === rubroActivo ? 'activo' : ''}" onclick="setRubro('${p.nombre}')">${p.nombre}</button>`).join('');
  $('chips').innerHTML = html;
  $('gestionPerfil').style.display = propios.some(p => p.nombre === rubroActivo) ? 'flex' : 'none';

  const regiones = new Set();
  perfiles.forEach(p => [...p.licitaciones, ...p.compra_agil].forEach(it => it.region && regiones.add(it.region)));
  globalCA.forEach(it => it.r && regiones.add(it.r));
  const sel = $('fRegion').value;
  $('fRegion').innerHTML = '<option value="todas">Todas las regiones</option>' +
    [...regiones].sort().map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${r}</option>`).join('');
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
    ? `Datos: ${generado} · ${globalLic.length.toLocaleString('es-CL')} licitaciones + ${globalCA.length.toLocaleString('es-CL')} compras ágiles activas en Chile`
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
