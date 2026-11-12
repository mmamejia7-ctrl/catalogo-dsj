// Funciones compartidas: precios, servidor e impresión
const API = (window.API_URL || '').trim();
const $ = s => document.querySelector(s);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
// Firma válida: solo imagen incrustada (data:image/...), nunca otra dirección
const firmaOK = s => /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s || ''));
// Sesiones guardadas vencen a los 7 días: después se pide la clave otra vez
(() => { const DIAS7 = 7 * 864e5, ahora = Date.now(); let vencio = false;
  for (const k of ['panel', 'ses', 'sesP', 'modo']) { const s = LS.get(k, null); if (!s || !s.k) continue;
    if (!s.ts) { s.ts = ahora; LS.set(k, s); } else if (ahora - s.ts > DIAS7) { vencio = true; LS.set(k, null); } }
  if (vencio) ['panel', 'ses', 'sesP'].forEach(k => LS.set(k, null)); })();
const fmt = n => 'L ' + Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v > 0 ? v : null; v = String(v).replace(/[Ll]\.?|\s/g, '').replace(/,/g, ''); const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }
function telWA(t) { t = String(t || '').replace(/\D/g, ''); return t.length == 8 ? '504' + t : t; }
function hoyISO(d) { d = d || new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function toast(t) { const e = $('#toast'); if (!e) return alert(t); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 2600); }
function parseCSV(t) { const r = []; let row = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch == '"') { if (t[i + 1] == '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch == '"') q = true; else if (ch == ',') { row.push(c); c = ''; } else if (ch == '\n') { row.push(c); r.push(row); row = []; c = ''; } else if (ch != '\r') c += ch; } if (c || row.length) { row.push(c); r.push(row); } return r; }
function csvAObjs(t) { const r = parseCSV(t); const h = r[0].map(x => x.trim().toLowerCase()); return r.slice(1).filter(x => x.join('')).map(x => Object.fromEntries(h.map((k, i) => [k, x[i]]))); }

// Convierte filas de la hoja en { CODIGO: {det, p:[p1,p2,p3,p4], d:[1,d2,d3,d4]} }
function mapaPrecios(rows) {
  const m = {};
  for (const x of rows) {
    const c = String(x.codigo || '').trim().toUpperCase(); if (!c) continue;
    m[c] = { det: num(x.precio_detalle), p: [num(x.precio_1), num(x.precio_2), num(x.precio_3), num(x.precio_4)], d: [1, num(x.desde_2), num(x.desde_3), num(x.desde_4)], g: String(x.grupo || '').trim().toUpperCase(), e: num(x.equiv) || 1, u: String(x.unidad || '').trim().toLowerCase() || 'fardos', ud: String(x.unidad_detalle || '').trim().toLowerCase(), um: String(x.unidad_mayoreo || '').trim().toLowerCase(), s: !!x.especial, a: /^(si|sí|x|1|true|agotado)$/i.test(String(x.agotado || '').trim()), au: num(x.aut_desde) > 1 ? [num(x.aut_desde), num(x.aut_precio)] : null };
  }
  return m;
}
// Precio por unidad según tipo y cantidad → {precio, nivel}
function precioUnit(px, tipo, q) {
  if (!px) return { precio: null, nivel: '' };
  // Si no tiene precio de detalle (pañales, papel…), se vende al precio de mayoreo por fardo/caja
  if (tipo == 'detalle' && (px.det || px.ud)) return { precio: px.det, nivel: 'Detalle' };
  q = q || 1;
  for (let i = 3; i >= 1; i--) if (px.p[i] && px.d[i] && q >= px.d[i]) return { precio: px.p[i], nivel: 'P' + (i + 1) };
  return { precio: px.p[0], nivel: px.p[0] ? 'P1' : '' };
}
// Escalones de mayoreo para mostrar: [{desde, hasta, precio, nivel}]
function escalones(px) {
  if (!px) return [];
  const e = [];
  for (let i = 0; i < 4; i++) if (px.p[i] && (i == 0 || px.d[i])) e.push({ desde: i == 0 ? 1 : px.d[i], precio: px.p[i], nivel: 'P' + (i + 1) });
  e.sort((a, b) => a.desde - b.desde);
  e.forEach((x, i) => x.hasta = e[i + 1] ? e[i + 1].desde - 1 : null);
  return e;
}
async function apiGet(params) {
  const r = await fetch(API + '?' + new URLSearchParams(params), { cache: 'no-store' });
  const j = await r.json(); if (!j.ok) { const e = Error(j.error || 'Error del servidor'); e.data = j; throw e; } return j;
}
async function apiPost(obj) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(obj) });
  const j = await r.json(); if (!j.ok) throw Error(j.error || 'Error del servidor'); return j;
}



// Unidad en que se vende según el tipo de precio (paquete, fardo, caja…)
const plural = (u, n) => !u ? '' : n == 1 ? u : /s$/.test(u) ? u : /[aeiou]$/.test(u) ? u + 's' : u + 'es';
function uVenta(c, tipo, mapa) { const x = (mapa || window._PRECIOS || {})[String(c).toUpperCase()]; if (!x) return ''; return tipo == 'detalle' && (x.det || x.ud) ? (x.ud || '') : (x.um || ''); }

// ---------------- FARDOS POR GRUPO ----------------
// Devuelve [{g:'CARIÑOSO', n:20}] sumando cantidad × equivalencia de cada producto con grupo
function fardosDe(items, mapa) {
  mapa = mapa || window._PRECIOS || {}; const m = {};
  const U = {}; for (const i of items || []) { const x = mapa[String(i.c).toUpperCase()]; if (!x || !x.g) continue; m[x.g] = (m[x.g] || 0) + i.q * (x.e || 1); U[x.g] = x.u || 'fardos'; }
  return Object.entries(m).map(([g, n]) => ({ g, n: Math.round(n * 100) / 100, u: U[g] }));
}
const unidadSing = u => (u || 'fardos').replace(/es$/, '').replace(/s$/, '');
const fardoTxt = (n, u) => (Math.round(n * 10) / 10).toLocaleString('es-HN') + ' ' + (n == 1 ? unidadSing(u) : (u || 'fardos'));
const grupoNom = g => g.charAt(0) + g.slice(1).toLowerCase();

// ---------------- IMPRESIÓN ----------------
// formato: 'ticket' (papel 3" / 80 mm) o 'carta' (impresora de escritorio)
function imprimir(html, formato) {
  let a = $('#printArea'); if (!a) { a = document.createElement('div'); a.id = 'printArea'; document.body.appendChild(a); }
  let st = $('#pageSize'); if (!st) { st = document.createElement('style'); st.id = 'pageSize'; document.head.appendChild(st); }
  a.className = formato; a.innerHTML = html;
  if (formato == 'ticket') {
    // Medir el largo del ticket para que salga en un solo trozo de papel de 80 mm
    const m = a.cloneNode(true); m.id = ''; m.style.cssText = 'position:absolute;left:-9999px;top:0;display:block';
    document.body.appendChild(m); const mm = Math.ceil(m.getBoundingClientRect().height / 3.78) + 18; m.remove();
    st.textContent = '@page{size:80mm ' + Math.max(60, mm) + 'mm;margin:3mm 4mm}';
  } else st.textContent = '@page{size:letter;margin:12mm}';
  setTimeout(() => window.print(), 150);
}
function fechaTxt(p) { return (p.dia || hoyISO()).split('-').reverse().join('/') + (p.hora ? ' ' + p.hora : ''); }
function pedidoHTML(p, formato) {
  const t = formato == 'ticket';
  const filas = p.items.map(it => t
    ? `<div class="tl"><b>${esc(it.q)} ${esc(plural(it.u || uVenta(it.c, p.tipo), it.q))} · ${esc(it.n)}</b><div class="tr"><span>${esc(it.c)}${it.nivel ? ' · ' + esc(it.nivel) : ''} · ${it.precio ? fmt(it.precio) + ((it.u || uVenta(it.c, p.tipo)) ? '/' + esc(it.u || uVenta(it.c, p.tipo)) : '') : '—'}</span><span>${it.sub ? fmt(it.sub) : '—'}</span></div></div>`
    : `<tr><td class="r">${esc(it.q)}<br><small>${esc(plural(it.u || uVenta(it.c, p.tipo), it.q))}</small></td><td><div class="pr">${(window.PRODUCTOS || []).find(p => p.c == it.c) ? `<img src="img/${window.PRODUCTOS.find(p => p.c == it.c).i}_s.jpg" alt="">` : ''}<span>${esc(it.n)}<br><small>${esc(it.c)}</small></span></div></td><td class="c">${esc(it.nivel)}</td><td class="r">${it.precio ? fmt(it.precio) : '—'}</td><td class="r">${it.sub ? fmt(it.sub) : '—'}</td></tr>`).join('');
  const unid = p.items.reduce((s, i) => s + i.q, 0);
  const fz = p.fardos || fardosDe(p.items);
  const fzH = fz.length ? `<div class="fz">${fz.map(x => `<div><span>Total ${esc(x.u || 'fardos')} ${esc(grupoNom(x.g))}</span><b>${(Math.round(x.n * 10) / 10)}</b></div>`).join('')}</div>` : '';
  const cab = `<div class="ph"><div class="pt">DISTRIBUIDORA SAN JORGE</div><div class="ps">PEDIDO${p.numero ? ' # ' + esc(p.numero) : ' (sin guardar)'}</div></div>
   <div class="pm"><div><b>Fecha:</b> ${fechaTxt(p)}</div><div><b>Vendedor:</b> ${esc(p.vendedor || '—')}</div><div><b>Cliente:</b> ${esc(p.cliente || '—')}</div>${p.negocio ? `<div><b>Negocio:</b> ${esc(p.negocio)}</div>` : ''}${p.telefono ? `<div><b>Tel:</b> ${esc(p.telefono)}</div>` : ''}<div><b>Precio:</b> ${esc(p.tipo || '')}</div></div>`;
  const pie = `<div class="pf">${fzH}<div class="tt"><span>TOTAL</span><span>${fmt(p.total)}</span></div><div>${p.items.length} productos · ${unid} unidades</div>${p.nota ? `<div class="nt"><b>Nota:</b> ${esc(p.nota)}</div>` : ''}${firmaOK(p.firma) ? `<div class="fs"><img src="${p.firma}" alt="Firma"><div>Firma del cliente${p.cliente ? ': ' + esc(p.cliente) : ''}</div></div>` : '<div class="fi">Recibido: ______________________</div>'}</div>`;
  return t ? `<div class="doc">${cab}<div class="hr"></div>${filas}<div class="hr"></div>${pie}<div class="cut">- - - - - - - - - - - - - - - -</div></div>`
           : `<div class="doc">${cab}<table><thead><tr><th class="r">Cant.</th><th>Producto</th><th class="c">Nivel</th><th class="r">Precio</th><th class="r">Subtotal</th></tr></thead><tbody>${filas}</tbody></table>${pie}</div>`;
}

// ---------------- VENTANAS PROPIAS (sin alert/confirm/prompt) ----------------
(function () {
  const css = `
  .ov{position:fixed;inset:0;z-index:90;background:rgba(15,15,15,.82);display:flex;align-items:flex-end;justify-content:center;padding:12px max(12px,env(safe-area-inset-left)) calc(80px + env(safe-area-inset-bottom))}
  .ov .box{background:#fff;color:#0f3d5e;border-radius:18px;width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,Arial,sans-serif}
  .ov .bh{background:linear-gradient(115deg,#0b3150 0%,#0f3d5e 35%,#17577f 70%,#2a7aa8 100%);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:8px;border-bottom:4px solid #1a6fa8}.ov .bh b{flex:1}
  .ov .bb{padding:14px;overflow:auto;flex:1}
  .ov .bf{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;border-top:1px solid #eee}
  .ov .bf>:only-child,.ov .bf .full{grid-column:1/-1}
  .ov button,.ov a.btn{border:0;border-radius:12px;padding:13px;font:inherit;font-weight:800;cursor:pointer;text-align:center;text-decoration:none;display:block}
  .ov .no{background:#eee;color:#0f3d5e}.ov .si{background:#1592e6;color:#fff}.ov .wa{background:#25d366;color:#fff}.ov .ng{background:#0f3d5e;color:#fff}
  .ov .x{flex:none;background:#333;color:#fff;width:40px;height:40px;padding:0;border-radius:999px}
  .ov .nota{font-size:.82em;color:#555;margin:10px 2px 0;line-height:1.4}
  .ov input{width:100%;font:900 2em system-ui,Arial;text-align:center;border:2px solid #1592e6;border-radius:12px;padding:10px;box-sizing:border-box}
  .ov .msg{white-space:pre-line;font-size:1.05em;line-height:1.4}
  .ov .qt{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}.ov .qt span{color:#777;font-size:.9em}
  .ov .qg{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;max-height:46vh;overflow:auto;padding:2px}
  .ov .qn{padding:14px 0;border-radius:12px;background:#f3eee8;color:#0f3d5e;font:800 1.15em system-ui,Arial;border:2px solid transparent}
  .ov .qn:active{background:#1592e6;color:#fff}.ov .qn.on{background:#1592e6;color:#fff}
  .ov .qn.esc{background:#fff1e6;border-color:#e8590c;color:#c2410c;padding:4px 0;line-height:1.1}.ov .qn.esc.on{background:#1592e6;color:#fff;border-color:#1592e6}
  .ov .qn small{display:block;font-size:.5em;font-weight:900;letter-spacing:.3px}.ov .qn em{display:block;font-style:normal;font-size:.52em;font-weight:800}
  .ov .qa{background:#fff7ed;border-left:4px solid #e8590c;color:#7c2d12;border-radius:8px;padding:8px 10px;font-size:.86em;line-height:1.4;margin:0 0 8px}.ov .qa b{color:#c2410c}
  .ov .qe{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.ov .qe span{background:#fff1e6;color:#c2410c;border:1px solid #f3b48a;border-radius:8px;padding:4px 8px;font-size:.8em}
  .ov .qo{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:12px}.ov .qo input{font-size:1.1em;padding:12px;border:2px solid #ccc}
  .ov .qo .si{padding:12px 18px}
  .firma{position:relative;background:#fff;border:2px dashed #bbb;border-radius:12px}.firma.ok{border-color:#1f9d55;border-style:solid}
  .fpad{display:block;width:100%;height:170px;touch-action:none;cursor:crosshair}
  .fline{position:absolute;left:14px;right:14px;bottom:34px;border-top:1px solid #ccc;color:#aaa;font-size:.75em;padding-top:2px;pointer-events:none}
  .firma.ok .fline{color:transparent}
  .fclr{position:absolute;right:8px;top:8px;border:0;border-radius:999px;background:#eee;color:#1a6fa8;font:700 .8em system-ui,Arial;padding:6px 10px;cursor:pointer}
  .ov .ok{font-size:1.25em;font-weight:900;margin:0 0 4px}
  .ov .papel{background:#e9e6e1;border-radius:12px;padding:14px;overflow:auto;display:flex;justify-content:center}
  .ov .papel>div{background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4mm}
  .ov .papel .ticket{width:72mm}.ov .papel .carta{width:190mm;min-width:190mm;padding:10mm}
  .ov .papel .doc{margin-bottom:8mm;padding-bottom:6mm;border-bottom:2px dashed #bbb}.ov .papel .doc:last-child{border:0;margin:0;padding:0}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
})();
function abrirOv(titulo, cuerpo, pie) {
  const o = document.createElement('div'); o.className = 'ov';
  o.innerHTML = `<div class="box" role="dialog" aria-label="${esc(titulo)}"><div class="bh"><b>${esc(titulo)}</b><button class="x" aria-label="Cerrar">✕</button></div><div class="bb">${cuerpo}</div>${pie ? `<div class="bf">${pie}</div>` : ''}</div>`;
  const cerrar = () => o.remove(); o.querySelector('.x').onclick = cerrar; o.addEventListener('click', e => { if (e.target === o) cerrar(); });
  document.body.appendChild(o); return { o, cerrar };
}
function confirmar(msg, si) {
  const { o, cerrar } = abrirOv('Confirmar', `<div class="msg">${esc(msg)}</div>`, '<button class="no">No</button><button class="si">Sí</button>');
  o.querySelector('.no').onclick = cerrar; o.querySelector('.si').onclick = () => { cerrar(); si(); };
}
function pedirCantidad(nombre, actual, ok, unidad, marcas) {
  const cur = +actual || 0; marcas = marcas || [];
  const M = {}; marcas.forEach(m => { if (m.q >= 1 && m.q <= 100) M[m.q] = m; });
  let b = ''; for (let i = 1; i <= 100; i++) { const m = M[i]; b += `<button class="qn${i == cur ? ' on' : ''}${m ? ' esc' : ''}" data-q="${i}">${m ? `<small>ESCALA ${esc(m.nivel)}</small>` : ''}${i}${m ? `<em>${fmt(m.precio)}</em>` : ''}</button>`; }
  const avi = marcas.aviso ? `<div class="qa">${marcas.aviso}</div>` : '';
  const ley = marcas.length ? `<div class="qe">${marcas.map(m => `<span><b>${esc(m.nivel)}</b> desde ${m.q} ${esc(unidad || '')} · ${fmt(m.precio)}</span>`).join('')}</div>` : '';
  const { o, cerrar } = abrirOv('Cantidad', `<div class="qt"><b>${esc(nombre)}</b>${unidad ? `<span>en ${esc(unidad)}</span>` : ''}</div>${avi}${ley}<div class="qg">${b}</div>
    <div class="qo"><input id="ovq" type="number" inputmode="numeric" min="0" placeholder="Otra cantidad"><button class="si" id="ovok">Usar</button></div>`,
    cur ? '<button class="no full" id="ovdel">Quitar del pedido</button>' : '');
  const fin = v => { ok(v); cerrar(); };
  o.querySelector('.qg').addEventListener('click', e => { const q = e.target.dataset.q; if (q) fin(+q); });
  const i = o.querySelector('#ovq'), go = () => { const v = +i.value; if (i.value !== '' && !isNaN(v)) fin(v); };
  o.querySelector('#ovok').onclick = go; i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const del = o.querySelector('#ovdel'); if (del) del.onclick = () => fin(0);
  const on = o.querySelector('.qn.on'); if (on) setTimeout(() => on.scrollIntoView({ block: 'center' }), 30);
}
function mostrarFoto(src, nota) {
  abrirOv('Foto', `<img src="${src}" alt="Imagen para compartir" style="width:100%;border-radius:10px;display:block"><p class="nota">${nota || 'Este aparato no permite compartir directo. Mantenga presionada la imagen para guardarla y luego envíela por WhatsApp.'}</p>`, '');
}
// Comparte una imagen por WhatsApp (u otra app). Debe llamarse desde un toque del usuario.
async function compartirImagen(blob, nombre, texto) {
  const f = new File([blob], nombre, { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: texto || '' }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  mostrarFoto(URL.createObjectURL(blob)); return false;
}


// ---------------- FIRMA DIGITAL ----------------
function firmaPad(box) {
  box.innerHTML = '<canvas class="fpad" aria-label="Espacio para firmar con el dedo"></canvas><div class="fline">Firme aquí con el dedo</div><button type="button" class="fclr">Borrar firma</button>';
  const cv = box.querySelector('canvas'), x = cv.getContext('2d'); let vacia = true, dib = false, lx = 0, ly = 0;
  function medir() { const r = cv.getBoundingClientRect(); if (!r.width) return; const d = window.devicePixelRatio || 1; cv.width = r.width * d; cv.height = r.height * d; x.setTransform(d, 0, 0, d, 0, 0); x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111'; vacia = true; box.classList.remove('ok'); }
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); dib = true; [lx, ly] = pt(e); x.beginPath(); x.arc(lx, ly, 1.2, 0, 7); x.fillStyle = '#111'; x.fill(); });
  cv.addEventListener('pointermove', e => { if (!dib) return; e.preventDefault(); const [nx, ny] = pt(e); x.beginPath(); x.moveTo(lx, ly); x.lineTo(nx, ny); x.stroke(); lx = nx; ly = ny; if (vacia) { vacia = false; box.classList.add('ok'); } });
  const fin = () => { dib = false; }; cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
  box.querySelector('.fclr').onclick = () => { x.clearRect(0, 0, cv.width, cv.height); vacia = true; box.classList.remove('ok'); };
  return {
    medir, vacia: () => vacia, limpiar: () => { x.clearRect(0, 0, cv.width, cv.height); vacia = true; box.classList.remove('ok'); },
    // Imagen pequeña en blanco y negro para guardar con el pedido
    imagen() { if (vacia) return ''; const o = document.createElement('canvas'), W = 480, H = Math.round(480 * cv.height / cv.width); o.width = W; o.height = H; const c = o.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(cv, 0, 0, W, H); return o.toDataURL('image/jpeg', .7); }
  };
}

// ---------------- IMAGEN DEL PEDIDO (con fotos de los productos) ----------------
const _IMG = {};
function cargarImg(src) { if (!_IMG[src]) _IMG[src] = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); return _IMG[src]; }
function _rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function _corta(x, t, w) { if (x.measureText(t).width <= w) return [t]; const p = t.split(' '); let a = '', out = []; for (const s of p) { const n = a ? a + ' ' + s : s; if (x.measureText(n).width > w && a) { out.push(a); a = s; } else a = n; } out.push(a); if (out.length > 2) { out = out.slice(0, 2); out[1] += '…'; } return out; }
async function imagenPedido(d) {
  const MAP = Object.fromEntries((window.PRODUCTOS || []).map(p => [p.c, p]));
  const FZ = d.fardos || fardosDe(d.items); const W = 1080, HEAD = 300, ROW = 190, FOOT = 230 + FZ.length * 64 + (d.firma ? 230 : 0), H = HEAD + ROW * d.items.length + FOOT;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  const F = (w, s) => `${w} ${s}px system-ui,-apple-system,Roboto,Arial,sans-serif`;
  x.fillStyle = '#f6f0e8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#0f3d5e'; x.fillRect(0, 0, W, HEAD - 20); x.fillStyle = '#1a6fa8'; x.fillRect(0, HEAD - 28, W, 10);
  const logo = await cargarImg('img/logo.jpg');
  if (logo) { x.fillStyle = '#f6f5f1'; _rr(x, 40, 36, 150, 150, 22); x.fill(); const s = Math.min(130 / logo.width, 130 / logo.height); x.drawImage(logo, 115 - logo.width * s / 2, 111 - logo.height * s / 2, logo.width * s, logo.height * s); }
  x.fillStyle = '#fff'; x.font = F(900, 54); x.fillText('PEDIDO' + (d.numero ? ' #' + d.numero : ''), 220, 92);
  x.font = F(600, 34); x.fillStyle = '#ddd'; x.fillText(_corta(x, (d.cliente || 'Cliente') + (d.negocio ? ' · ' + d.negocio : ''), 820)[0], 220, 145);
  x.font = F(500, 28); x.fillStyle = '#aaa'; x.fillText(fechaTxt(d) + (d.vendedor ? '  ·  ' + d.vendedor : ''), 220, 192);
  x.fillStyle = '#f2c94c'; x.font = F(800, 26); x.fillText('Distribuidora San Jorge · precio ' + (d.tipo || ''), 220, 234);
  let y = HEAD;
  for (let k = 0; k < d.items.length; k++) {
    const it = d.items[k], p = MAP[it.c];
    x.fillStyle = '#fff'; _rr(x, 30, y + 10, W - 60, ROW - 20, 22); x.fill();
    const im = p ? await cargarImg('img/' + p.i + '_s.jpg') : null;
    x.fillStyle = '#f4f4f4'; _rr(x, 46, y + 24, 142, 142, 14); x.fill();
    if (im) { const s = Math.min(130 / im.width, 130 / im.height); x.drawImage(im, 117 - im.width * s / 2, y + 95 - im.height * s / 2, im.width * s, im.height * s); }
    x.fillStyle = '#1592e6'; _rr(x, 210, y + 30, 120, 64, 14); x.fill();
    x.fillStyle = '#fff'; x.font = F(900, 40); x.textAlign = 'center'; x.fillText(String(it.q), 270, y + 76); x.textAlign = 'left';
    x.fillStyle = '#0f3d5e'; x.font = F(800, 32); const ln = _corta(x, it.n, 470); ln.forEach((l, i) => x.fillText(l, 350, y + 62 + i * 38));
    const uu = it.u || uVenta(it.c, d.tipo); x.fillStyle = '#666'; x.font = F(500, 25); x.fillText(it.c + (uu ? '  ·  ' + plural(uu, it.q) : '') + (it.precio ? '  ·  ' + fmt(it.precio) + (uu ? '/' + uu : ' c/u') : '') + (it.nivel && it.nivel != 'Detalle' ? '  ·  ' + it.nivel : ''), 350, y + 150);
    x.textAlign = 'right'; x.fillStyle = '#1a6fa8'; x.font = F(900, 34); x.fillText(it.sub ? fmt(it.sub) : (d.sinp ? '' : 'Consultar'), W - 56, y + 76); x.textAlign = 'left';
    y += ROW;
  }
  for (const z of FZ) { x.fillStyle = '#e8f1fb'; _rr(x, 30, y + 14, W - 60, 52, 14); x.fill(); x.fillStyle = '#1d5fa8'; x.font = F(800, 30); x.fillText('Total ' + (z.u || 'fardos') + ' ' + grupoNom(z.g), 56, y + 51); x.textAlign = 'right'; x.font = F(900, 34); x.fillText(String(Math.round(z.n * 10) / 10), W - 56, y + 52); x.textAlign = 'left'; y += 64; }
  x.fillStyle = '#0f3d5e'; _rr(x, 30, y + 14, W - 60, 130, 22); x.fill();
  const un = d.items.reduce((s, i) => s + i.q, 0);
  x.fillStyle = '#ccc'; x.font = F(600, 28); x.fillText(d.items.length + ' productos · ' + un + ' unidades', 64, y + 92);
  x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = F(600, 26); x.fillText(d.sinp ? 'PRECIOS' : 'TOTAL APROX.', W - 64, y + 62); x.fillStyle = '#f2c94c'; x.font = F(900, 52); x.fillText(d.sinp ? 'Con su vendedor' : fmt(d.total), W - 64, y + 120); x.textAlign = 'left';
  if (d.nota) { x.fillStyle = '#333'; x.font = F(600, 26); x.fillText(_corta(x, 'Nota: ' + d.nota, W - 100)[0], 50, y + 190); }
  if (d.firma) { const fy = y + (d.nota ? 215 : 165); const fi = await cargarImg(d.firma); x.fillStyle = '#fff'; _rr(x, 30, fy, W - 60, 210, 22); x.fill(); if (fi) { const s = Math.min(560 / fi.width, 150 / fi.height); x.drawImage(fi, W / 2 - fi.width * s / 2, fy + 12, fi.width * s, fi.height * s); } x.strokeStyle = '#999'; x.lineWidth = 2; x.beginPath(); x.moveTo(240, fy + 168); x.lineTo(W - 240, fy + 168); x.stroke(); x.fillStyle = '#555'; x.font = F(600, 24); x.textAlign = 'center'; x.fillText('Firma del cliente' + (d.cliente ? ': ' + d.cliente : ''), W / 2, fy + 198); x.textAlign = 'left'; }
  return new Promise(r => cv.toBlob(r, 'image/jpeg', .88));
}

// ---------- Íconos en computadoras viejas (Windows 7/8 no tienen emojis a color) ----------
// Si el aparato no puede dibujar emojis, se cambian por dibujitos de img/emo (Twemoji, CC-BY 4.0)
(function () {
  const HAY = new Set(["1f3e0", "1f3e2", "1f3ea", "1f44b", "1f464", "1f465", "1f4ac", "1f4b2", "1f4cb", "1f4de", "1f4f1", "1f4f2", "1f4f7", "1f504", "1f50d", "1f511", "1f512", "1f513", "1f514", "1f5a8", "1f5d1", "1f648", "1f64b", "1f69a", "1f6ab", "1f6d2", "1f9d1-200d-1f4bc", "1f9f9", "1f9fe", "23f3", "2699", "26a0", "26a1", "2705", "270d", "270f", "274c"]);
  function faltan() {
    try { if (/[?&]emo=1/.test(location.search)) return true;
      const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d');
      x.textBaseline = 'top'; x.font = '20px sans-serif'; x.fillText('\u{1F3E0}', 0, 0);
      const d = x.getImageData(0, 0, 24, 24).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && (Math.abs(d[i] - d[i + 1]) > 25 || Math.abs(d[i + 1] - d[i + 2]) > 25)) return false;
      return true; } catch (e) { return false; }
  }
  if (!faltan()) return;
  const RE = /(?:[\u{1F000}-\u{1FAFF}☀-➿⬀-⯿⌀-⏿]️?(?:‍[\u{1F000}-\u{1FAFF}☀-➿]️?)*)/gu;
  const nom = e => { let c = [...e].map(ch => ch.codePointAt(0)); if (!c.includes(0x200d)) c = c.filter(n => n != 0xfe0f); return c.map(n => n.toString(16)).join('-'); };
  const NO = /^(SCRIPT|STYLE|TEXTAREA|OPTION|SELECT|INPUT|TITLE|CANVAS)$/;
  function cambiar(t) {
    const p = t.parentNode; if (!p || NO.test(p.nodeName)) return;
    const s = t.nodeValue; RE.lastIndex = 0; if (!RE.test(s)) return; RE.lastIndex = 0;
    const fr = document.createDocumentFragment(); let i = 0, m, hubo = false;
    while ((m = RE.exec(s))) { const n = nom(m[0]); if (!HAY.has(n)) continue; hubo = true;
      if (m.index > i) fr.appendChild(document.createTextNode(s.slice(i, m.index)));
      const im = document.createElement('img'); im.className = 'emo'; im.alt = m[0]; im.draggable = false; im.src = 'img/emo/' + n + '.svg';
      fr.appendChild(im); i = m.index + m[0].length; }
    if (!hubo) return;
    if (i < s.length) fr.appendChild(document.createTextNode(s.slice(i)));
    p.replaceChild(fr, t);
  }
  function recorrer(r) {
    if (r.nodeType == 3) return cambiar(r);
    if (r.nodeType != 1 || NO.test(r.nodeName)) return;
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT), l = []; let n; while ((n = w.nextNode())) l.push(n); l.forEach(cambiar);
  }
  function arrancar() {
    const st = document.createElement('style'); st.textContent = 'img.emo{height:1.15em;width:1.15em;vertical-align:-.2em;margin:0 .06em;display:inline-block}'; document.head.appendChild(st);
    recorrer(document.body);
    new MutationObserver(ms => ms.forEach(m => { if (m.type == 'characterData') cambiar(m.target); else m.addedNodes.forEach(recorrer); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
