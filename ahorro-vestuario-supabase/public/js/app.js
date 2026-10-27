// =============================================================
//  AHORRO DEL VESTUARIO · lógica de la aplicación
// =============================================================
(function () {
  "use strict";
  const S = window.Servicio;
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // ---------- Utilidades ----------
  const FECHA_DEFECTO = "2027-01-03";
  const MEDIOS = ["Efectivo", "Nequi", "Daviplata", "Transferencia"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const COLORES_AVATAR = ["#D6006F", "#00939C", "#F2541B", "#23893C", "#5B2A86", "#B07A00"];
  const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const money = n => fmt.format(Math.round(n || 0));
  const parseMoney = s => { const d = String(s || "").replace(/[^\d]/g, ""); return d ? parseInt(d, 10) : 0; };
  const miles = n => n ? Number(n).toLocaleString("es-CO") : "";
  const hoyISO = () => { const t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iniciales = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  const colorDe = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]; };
  const fechaPartes = iso => { if (!iso) return { d: "–", m: "" }; const [, m, d] = iso.split("-"); return { d: parseInt(d, 10), m: MESES[parseInt(m, 10) - 1] }; };
  const fechaTxt = iso => { const p = fechaPartes(iso); return p.d + " " + p.m; };
  const ordenNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  const ordenReciente = (a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || 0) - (a.creado || 0);

  function toast(txt) {
    const t = $("toast"); t.textContent = txt; t.classList.add("ver");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("ver"), 3200);
  }
  function msg(id, txt, err) {
    const el = $(id); el.textContent = txt; el.classList.toggle("err", !!err);
    if (!err && txt) setTimeout(() => { if (el.textContent === txt) el.textContent = ""; }, 4000);
  }
  function textoError(e) {
    const c = (e && e.code) || "";
    const mapa = {
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/wrong-password": "Correo o contraseña incorrectos.",
      "auth/user-not-found": "No hay una cuenta con ese correo. Crea una en la pestaña “Crear cuenta”.",
      "auth/invalid-email": "Ese correo no es válido.",
      "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Usa “Ingresar”.",
      "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
      "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
      "auth/email-not-confirmed": "Primero confirma tu correo: abre el enlace que te enviamos (revisa también spam).",
      "auth/confirmar-correo": "Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego ingresa aquí.",
      "duplicado": "Ese registro ya existe (por ejemplo, ese nombre ya tiene una cuenta).",
      "falta-sql": "Falta preparar la base de datos: corre el archivo supabase/03-foto-vestuario.sql en el SQL Editor de Supabase.",
      "auth/network-request-failed": "Sin conexión a internet. Revisa tu red.",
      "permission-denied": "No tienes permiso para hacer esto. Si crees que es un error, habla con la tesorería.",
      "local/recuperar": "En modo de prueba no se puede recuperar la contraseña. Crea otra cuenta."
    };
    const base = mapa[c] || "Algo salió mal. Revisa tu conexión e intenta de nuevo.";
    // Muestra el detalle técnico cuando no sabemos exactamente qué pasó
    const detalle = e && e.message && (c === "auth/network-request-failed" || !mapa[c]) ? " (Detalle: " + e.message + ")" : "";
    return base + detalle;
  }

  // Confirmación con dos toques (sin ventanas emergentes)
  const armados = new Map();
  function confirmar(btn, clave, texto) {
    if (armados.get(clave)) { armados.delete(clave); return true; }
    armados.set(clave, true);
    const antes = btn.textContent; btn.textContent = texto || "¿Seguro? Toca otra vez";
    setTimeout(() => { armados.delete(clave); if (btn.isConnected) btn.textContent = antes; }, 3000);
    return false;
  }

  // ---------- Estado ----------
  let usuario = null;
  let cfg = null;               // null = todavía no existe la configuración
  let integrantes = [];
  let aportes = [];
  let cargado = { config: false, integrantes: false, aportes: false };
  let desuscribir = [];
  let vista = "mi";
  let editandoMeta = null;
  const metasCelebradas = new Set();

  const esAdmin = () => !!(usuario && cfg && Array.isArray(cfg.admins) && cfg.admins.includes(usuario.email));
  const yo = () => usuario && integrantes.find(i => i.uid === usuario.uid);
  const metaDe = p => (p && p.meta > 0 ? p.meta : (cfg && cfg.meta)) || 0;
  const fechaDesfile = () => (cfg && cfg.fecha) || FECHA_DEFECTO;
  const claveSoloAdmin = () => "ahorro-solo-admin-" + (usuario ? usuario.uid : "");
  const soloAdmin = () => { try { return localStorage.getItem(claveSoloAdmin()) === "1"; } catch (_) { return false; } };

  function diasRestantes() {
    const [y, m, d] = fechaDesfile().split("-").map(Number);
    const meta = new Date(y, m - 1, d), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((meta - hoy) / 86400000);
  }
  function sumas() {
    const total = {}, conf = {}, pend = {};
    aportes.forEach(a => {
      total[a.integranteId] = (total[a.integranteId] || 0) + (a.monto || 0);
      const dest = a.estado === "recibido" ? conf : pend;
      dest[a.integranteId] = (dest[a.integranteId] || 0) + (a.monto || 0);
    });
    return { total, conf, pend };
  }

  // ---------- Medios de pago (chips) ----------
  function pintarMedios(contenedor, nombre) {
    $(contenedor).innerHTML = MEDIOS.map((m, i) =>
      `<label><input type="radio" name="${nombre}" value="${m}" ${i === 0 ? "checked" : ""}><span>${m}</span></label>`).join("");
  }
  pintarMedios("aMedios", "aMedio");
  pintarMedios("tMedios", "tMedio");
  ["aMonto", "tMonto", "iMeta", "cfMeta", "inMeta"].forEach(id => {
    $(id).addEventListener("input", e => { const v = parseMoney(e.target.value); e.target.value = miles(v); });
  });
  $("aFecha").value = hoyISO();
  $("tFecha").value = hoyISO();

  // ---------- Pantallas ----------
  function mostrar(pantalla) {
    $("vCargando").hidden = pantalla !== "cargando";
    $("vLogin").hidden = pantalla !== "login";
    $("vApp").hidden = pantalla !== "app";
    document.body.classList.toggle("app", pantalla === "app");
  }

  // Cuenta regresiva y nombre (también en el ingreso)
  function pintarComunes() {
    const dl = diasRestantes();
    const [, fm, fd] = fechaDesfile().split("-");
    const dia = parseInt(fd, 10) + " de " + MESES_L[parseInt(fm, 10) - 1];
    $$(".js-dias").forEach(el => el.textContent = dl > 0 ? dl : (dl === 0 ? "¡Hoy!" : "0"));
    $$(".js-dias-txt").forEach(el => el.textContent = dl > 0 ? "días para el desfile del " + dia : (dl === 0 ? "¡Hoy es el desfile!" : "El desfile ya pasó"));
    $$(".js-dias-corto").forEach(el => el.textContent = dl >= 0 ? "para el " + dia : "el desfile ya pasó");
    const nombre = (cfg && cfg.nombre) || "Danzantes del Cerrillo";
    $$(".js-colectivo").forEach(el => el.textContent = nombre);
    document.title = cfg && cfg.nombre ? cfg.nombre + " · Ahorro del Vestuario" : "Danzantes del Cerrillo · Ahorro del Vestuario";
  }

  // ---------- INGRESO ----------
  let modoRegistro = false;
  let pararLluvia = () => {};
  function cambiarPestana(registro) {
    modoRegistro = registro;
    $("tabIngresar").setAttribute("aria-selected", String(!registro));
    $("tabRegistro").setAttribute("aria-selected", String(registro));
    $("campoNombre").hidden = !registro;
    $("btnLogin").textContent = registro ? "Crear mi cuenta" : "Ingresar";
    $("loginTitulo").textContent = registro ? "Crea tu cuenta" : "Ingresa a tu cuenta";
    $("loginSub").textContent = registro ? "Solo necesitas tu nombre, correo y una contraseña." : "Usa el correo con el que te registraste.";
    $("lClave").autocomplete = registro ? "new-password" : "current-password";
    $("btnOlvide").hidden = registro;
    msg("lMsg", "");
  }
  $("tabIngresar").onclick = () => cambiarPestana(false);
  $("tabRegistro").onclick = () => cambiarPestana(true);
  $("avisoLocal").hidden = S.modo !== "local";

  $("formLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = $("lNombre").value.trim(), correo = $("lCorreo").value.trim(), clave = $("lClave").value;
    if (modoRegistro && nombre.length < 3) return msg("lMsg", "Escribe tu nombre completo.", true);
    if (!/^\S+@\S+\.\S+$/.test(correo)) return msg("lMsg", "Escribe un correo válido.", true);
    if (clave.length < 6) return msg("lMsg", "La contraseña debe tener al menos 6 caracteres.", true);
    const b = $("btnLogin"); b.disabled = true;
    try {
      if (modoRegistro) await S.auth.registrar(nombre, correo, clave);
      else await S.auth.ingresar(correo, clave);
      $("lClave").value = "";
    } catch (err) {
      if (err && err.code === "auth/confirmar-correo") { cambiarPestana(false); $("lClave").value = ""; msg("lMsg", textoError(err)); }
      else msg("lMsg", textoError(err), true);
    }
    b.disabled = false;
  });
  // Cambio de contraseña al volver del enlace de recuperación
  let recuperando = false;
  S.auth.alRecuperar(() => {
    recuperando = true; mostrar("login");
    $("formLogin").hidden = true; $("formNuevaClave").hidden = false; $$(".solo-login").forEach(el => el.hidden = true);
    $("loginTitulo").textContent = "Crea una contraseña nueva"; $("loginSub").textContent = "Escríbela dos veces para confirmarla.";
  });
  $("formNuevaClave").addEventListener("submit", async e => {
    e.preventDefault();
    const a = $("ncClave").value, b = $("ncClave2").value;
    if (a.length < 6) return msg("ncMsg", "La contraseña debe tener al menos 6 caracteres.", true);
    if (a !== b) return msg("ncMsg", "Las dos contraseñas no coinciden.", true);
    try {
      await S.auth.nuevaClave(a);
      recuperando = false; $("formLogin").hidden = false; $("formNuevaClave").hidden = true; $$(".solo-login").forEach(el => el.hidden = false);
      toast("Contraseña actualizada");
      history.replaceState(null, "", location.pathname);
      alSesion(await S.auth.usuarioActual(), true);
    } catch (err) { msg("ncMsg", textoError(err), true); }
  });
  $("btnOlvide").addEventListener("click", async () => {
    const correo = $("lCorreo").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(correo)) return msg("lMsg", "Escribe tu correo arriba y vuelve a tocar “Olvidé mi contraseña”.", true);
    try { await S.auth.recuperar(correo); msg("lMsg", "Te enviamos un correo para cambiar la contraseña. Revisa también la carpeta de spam."); }
    catch (err) { msg("lMsg", textoError(err), true); }
  });
  $("btnSalir").addEventListener("click", () => S.auth.salir());

  // ---------- Sesión y datos ----------
  S.auth.alCambiar(u => alSesion(u));
  function alSesion(u, forzar) {
    if (recuperando) return;
    if (!forzar && u && usuario && u.uid === usuario.uid) return; // misma sesión, nada cambia
    desuscribir.forEach(f => { try { f(); } catch (_) {} }); desuscribir = [];
    usuario = u; cfg = null; integrantes = []; aportes = [];
    cargado = { config: false, integrantes: false, aportes: false };
    if (!u) {
      cambiarPestana(false); vista = "mi";
      pintarComunes(); mostrar("login");
      pararLluvia(); pararLluvia = window.lluviaConfeti($("confetiLogin"));
      return;
    }
    pararLluvia(); pararLluvia = () => {};
    mostrar("cargando");
    const alError = err => {
      if (cargado.config && cargado.integrantes && cargado.aportes) { toast(textoError(err)); return; }
      $("vCargando").innerHTML = `<div style="max-width:420px;text-align:center;display:grid;gap:14px;justify-items:center;padding:24px">
        <div class="marca-logo" style="animation:none"><b>!</b></div>
        <b style="font-size:18px">No se pudieron cargar los datos</b>
        <p style="opacity:.8">Revisa tu conexión. Si acabas de crear la base de datos, confirma que corriste el archivo <code>supabase/esquema.sql</code> en Supabase.</p>
        <button type="button" class="btn" onclick="location.reload()">Intentar de nuevo</button></div>`;
    };
    desuscribir.push(S.db.escuchar("config", docs => {
      const d = docs.find(x => x.id === "general");
      cfg = d ? { nombre: d.nombre || "", meta: Number(d.meta) || 0, fecha: d.fecha || FECHA_DEFECTO, admins: (d.admins || []).map(x => String(x).toLowerCase()),
        fotoTexto: d.fotoTexto || "",
        fotos: (Array.isArray(d.fotos) && d.fotos.length ? d.fotos : (d.fotoUrl ? [{ url: d.fotoUrl, ruta: d.fotoRuta || "", texto: "" }] : []))
          .filter(f => f && f.url) } : null;
      cargado.config = true; render();
    }, alError));
    desuscribir.push(S.db.escuchar("integrantes", docs => {
      integrantes = docs.map(d => ({ ...d, nombre: String(d.nombre || ""), meta: Number(d.meta) || 0 }));
      cargado.integrantes = true; render();
    }, alError));
    desuscribir.push(S.db.escuchar("aportes", docs => {
      aportes = docs.map(d => ({ ...d, monto: Number(d.monto) || 0 }));
      cargado.aportes = true; render();
    }, alError));
  }

  // ---------- Navegación ----------
  $$(".nav button").forEach(b => b.addEventListener("click", () => { vista = b.dataset.vista; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }));

  // ---------- Render principal ----------
  function render() {
    pintarComunes();
    if (!usuario) return;
    if (!cargado.config || !cargado.integrantes || !cargado.aportes) return;
    mostrar("app");

    const admin = esAdmin(), mio = yo();
    // Encabezado de usuario
    const nombreVisible = (mio && mio.nombre) || usuario.nombre || usuario.email;
    $("uNombre").textContent = nombreVisible;
    $("uRol").textContent = admin ? "Tesorería" : "Integrante";
    $("uAvatar").textContent = iniciales(nombreVisible);
    $("uAvatar").style.background = colorDe(nombreVisible);
    $("pie").textContent = S.modo === "supabase" ? "Datos guardados en línea de forma segura." : "Modo de prueba: los datos están solo en este navegador. Conecta Supabase para compartirlos (ver LEEME.md).";

    // ¿Qué pantalla toca?
    const secciones = ["pInicio", "pUnirse", "pMi", "pColectivo", "pTesoreria"];
    let activa;
    if (!cfg) activa = "pInicio";
    else if (!mio && !(admin && soloAdmin())) activa = "pUnirse";
    else {
      // Los integrantes solo ven "Mi ahorro"; la tesorería ve todo
      if (!admin) vista = "mi";
      if (vista === "mi" && !mio) vista = "tesoreria";
      activa = { mi: "pMi", colectivo: "pColectivo", tesoreria: "pTesoreria" }[vista];
    }
    secciones.forEach(s => $(s).hidden = s !== activa);
    // Un integrante solo tiene "Mi ahorro": no hace falta mostrar pestañas
    const navVisible = admin && (activa === "pMi" || activa === "pColectivo" || activa === "pTesoreria");
    document.querySelector(".nav").hidden = !navVisible;
    $("navMi").hidden = !mio;
    $("navTes").hidden = !admin;
    document.querySelector('.nav button[data-vista="colectivo"]').hidden = !admin;
    $$(".nav button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.vista === vista)));
    const pendientes = aportes.filter(a => a.estado !== "recibido" && integrantes.some(i => i.id === a.integranteId));
    $("badgePend").hidden = !pendientes.length;
    $("badgePend").textContent = pendientes.length;

    if (activa === "pUnirse") renderUnirse(admin);
    if (activa === "pMi") renderMi(mio);
    if (activa === "pColectivo") renderColectivo(mio);
    if (activa === "pTesoreria") renderTesoreria(pendientes);
  }

  // ---------- Unirse ----------
  function renderUnirse(admin) {
    const libres = integrantes.filter(i => !i.uid).sort(ordenNombre);
    $("listaLibres").innerHTML = libres.length
      ? libres.map(i => `<div class="opcion-nombre"><b>${esc(i.nombre)}</b><button type="button" class="btn peq" data-reclamar="${esc(i.id)}">Soy yo</button></div>`).join("")
      : `<p class="muted">Todavía no hay nombres sin cuenta. Escribe el tuyo abajo.</p>`;
    if (!$("uNuevoNombre").value && usuario.nombre) $("uNuevoNombre").value = usuario.nombre;
    $("btnSoloAdmin").hidden = !admin;
  }
  $("listaLibres").addEventListener("click", async e => {
    const b = e.target.closest("[data-reclamar]"); if (!b) return;
    const i = integrantes.find(x => x.id === b.dataset.reclamar); if (!i) return;
    if (!confirmar(b, "rec" + i.id, "Confirmar: soy " + i.nombre.split(" ")[0])) return;
    try { await S.db.actualizar("integrantes", i.id, { uid: usuario.uid, email: usuario.email }); vista = "mi"; toast("¡Bienvenida, " + i.nombre.split(" ")[0] + "!"); window.celebrar(); }
    catch (err) { msg("uMsg", textoError(err), true); }
  });
  $("formUnirse").addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = $("uNuevoNombre").value.trim();
    if (nombre.length < 3) return msg("uMsg", "Escribe tu nombre completo.", true);
    const igual = integrantes.find(i => i.nombre.toLowerCase() === nombre.toLowerCase());
    if (igual) return msg("uMsg", igual.uid ? "Ese nombre ya tiene una cuenta. Si eres tú, habla con la tesorería." : "Ese nombre ya está en la lista: toca “Soy yo” junto a él.", true);
    try {
      await S.db.agregar("integrantes", { nombre, meta: 0, uid: usuario.uid, email: usuario.email, creado: Date.now() });
      vista = "mi"; toast("¡Ya eres parte del ahorro!"); window.celebrar();
    } catch (err) { msg("uMsg", textoError(err), true); }
  });
  $("btnSoloAdmin").addEventListener("click", () => {
    try { localStorage.setItem(claveSoloAdmin(), "1"); } catch (_) {}
    vista = "tesoreria"; render();
  });

  // ---------- Mi ahorro ----------
  function htmlMov(a, opciones) {
    const p = fechaPartes(a.fecha);
    const chip = a.estado === "recibido" ? '<span class="chip ok">Recibido</span>' : '<span class="chip pend">Por confirmar</span>';
    const sub = [a.medio, a.nota].filter(Boolean).map(esc).join(" · ");
    return `<div class="mov num">
      <div class="mov-fecha"><b>${p.d}</b><small>${p.m}</small></div>
      <div class="mov-info"><span class="mov-titulo">${esc(opciones.titulo)}</span>${sub ? `<span class="mov-sub">${sub}</span>` : ""}${opciones.extra || ""}</div>
      <div class="mov-der"><span class="mov-monto">${money(a.monto)}</span>${opciones.acciones ? `<div class="mov-acciones">${chip}${opciones.acciones}</div>` : chip}</div>
    </div>`;
  }

  function renderMi(mio) {
    const s = sumas();
    const total = s.total[mio.id] || 0, meta = metaDe(mio), falta = Math.max(0, meta - total);
    const pct = meta ? Math.min(100, total / meta * 100) : 0;
    const dl = diasRestantes(), semanas = Math.max(1, Math.ceil(Math.max(dl, 0) / 7));
    $("miSaludo").textContent = "Hola, " + mio.nombre.split(" ")[0];
    $("aAyuda").innerHTML = esAdmin() ? "Como eres de la tesorería, queda <b>confirmado</b> de una vez." : "Queda <b>por confirmar</b> hasta que la tesorería lo reciba.";
    $("miTotal").textContent = money(total);
    $("miMeta").textContent = meta ? money(meta) : "Sin definir";
    $("miFalta").textContent = meta ? money(falta) : "–";
    $("miPend").textContent = money(s.pend[mio.id] || 0);
    $("miPct").textContent = Math.floor(pct) + "%";
    $("anilloProg").style.strokeDashoffset = String(314.16 * (1 - pct / 100));
    const sug = $("miSugerido");
    if (meta && falta > 0 && dl > 0) { sug.hidden = false; sug.innerHTML = `Para llegar a tiempo: <b>${money(Math.ceil(falta / semanas / 1000) * 1000)}</b> por semana`; }
    else if (meta && falta === 0) { sug.hidden = false; sug.innerHTML = "<b>¡Cumpliste tu meta!</b> Tu vestuario está listo"; }
    else sug.hidden = true;

    if (meta && total >= meta && !metasCelebradas.has(mio.id)) {
      if (metasCelebradas.size || renderMi._ya) { window.celebrar(true); toast("¡Cumpliste tu meta del vestuario!"); }
      metasCelebradas.add(mio.id);
    }
    renderMi._ya = true;
    pintarVestuario(pct, meta, total);

    const mios = aportes.filter(a => a.integranteId === mio.id).sort(ordenReciente);
    $("miConteo").textContent = mios.length ? mios.length + (mios.length === 1 ? " registro" : " registros") : "";
    $("miMovs").innerHTML = mios.length
      ? mios.map(a => htmlMov(a, {
          titulo: a.nota ? a.nota : "Ahorro",
          acciones: a.estado !== "recibido" && a.registradoPor === usuario.uid ? `<button type="button" class="link danger" data-borrar-ap="${esc(a.id)}">Borrar</button>` : ""
        })).join("")
      : `<div class="vacio"><b>Aún no has anotado ahorros</b>Usa el formulario “Anotar un ahorro” para registrar el primero.</div>`;
  }
  $("miMovs").addEventListener("click", async e => {
    const b = e.target.closest("[data-borrar-ap]"); if (!b) return;
    if (!confirmar(b, "bm" + b.dataset.borrarAp)) return;
    try { await S.db.borrar("aportes", b.dataset.borrarAp); toast("Registro borrado"); } catch (err) { toast(textoError(err)); }
  });

  $("formAporte").addEventListener("submit", async e => {
    e.preventDefault();
    const mio = yo(); if (!mio) return;
    const monto = parseMoney($("aMonto").value);
    if (!monto) return msg("aMsg", "Escribe el valor que ahorraste.", true);
    if (monto > 10000000) return msg("aMsg", "El valor parece muy alto. Revísalo.", true);
    const admin = esAdmin();
    const datos = {
      integranteId: mio.id, monto, fecha: $("aFecha").value || hoyISO(),
      medio: (document.querySelector('input[name="aMedio"]:checked') || {}).value || "Efectivo",
      nota: $("aNota").value.trim(), estado: admin ? "recibido" : "pendiente",
      registradoPor: usuario.uid, registradoNombre: mio.nombre, creado: Date.now()
    };
    if (admin) { datos.recibidoPor = mio.nombre; datos.recibidoEn = Date.now(); }
    try {
      await S.db.agregar("aportes", datos);
      $("aMonto").value = ""; $("aNota").value = "";
      msg("aMsg", "Guardado: " + money(monto) + (admin ? "." : ". La tesorería lo confirmará."));
      window.celebrar();
    } catch (err) { msg("aMsg", textoError(err), true); }
  });

  // ---------- Fotos del vestuario (carrusel) ----------
  const MAX_FOTOS = 8, SEGUNDOS_FOTO = 3;
  const fotosDe = () => (cfg && cfg.fotos) || [];
  let carrusel = { i: 0, firma: "", timer: null, pausa: false };

  function pintarVestuario(pct, meta, total) {
    const fotos = fotosDe(), hay = fotos.length > 0;
    $("miVestuario").hidden = !hay;
    $("miTop").classList.toggle("sin-foto", !hay);
    if (!hay) { pararCarrusel(); carrusel.firma = ""; return; }
    // Solo se reconstruyen las imágenes si cambió la lista de fotos
    const firma = fotos.map(f => f.url).join("|");
    if (firma !== carrusel.firma) {
      carrusel.firma = firma; carrusel.i = Math.min(carrusel.i, fotos.length - 1);
      $("miVestuarioFotos").innerHTML = fotos.map((f, i) =>
        `<img src="${esc(f.url)}" alt="${esc(f.texto || "Foto del vestuario " + (i + 1))}" class="${i === carrusel.i ? "activa" : ""}" ${i ? 'loading="lazy"' : ""}>`).join("");
      $("miVestuarioPuntos").innerHTML = fotos.length > 1 ? fotos.map((_, i) =>
        `<button type="button" role="tab" aria-label="Foto ${i + 1} de ${fotos.length}" data-foto="${i}"></button>`).join("") : "";
      iniciarCarrusel();
    }
    mostrarFoto(carrusel.i);
    $("miVestuarioAvance").textContent = !meta ? "Tu meta aún no está definida"
      : total >= meta ? "¡Tu traje está completo!" : "Llevas el " + Math.floor(pct) + " % de tu traje";
    $("miVestuarioBarra").style.width = pct + "%";
  }
  function mostrarFoto(i) {
    const fotos = fotosDe(); if (!fotos.length) return;
    carrusel.i = (i + fotos.length) % fotos.length;
    $$("#miVestuarioFotos img").forEach((im, k) => im.classList.toggle("activa", k === carrusel.i));
    $$("#miVestuarioPuntos button").forEach((bt, k) => {
      bt.setAttribute("aria-selected", "false");
      if (k === carrusel.i) { void bt.offsetWidth; bt.setAttribute("aria-selected", "true"); }
    });
    const f = fotos[carrusel.i];
    $("miVestuarioTexto").textContent = (f && f.texto) || cfg.fotoTexto || "Nuestro vestuario";
  }
  function pararCarrusel() { clearInterval(carrusel.timer); carrusel.timer = null; }
  function iniciarCarrusel() {
    pararCarrusel();
    if (fotosDe().length < 2) return;
    carrusel.timer = setInterval(() => {
      if (document.hidden || $("miVestuario").hidden) return;
      mostrarFoto(carrusel.i + 1);
    }, SEGUNDOS_FOTO * 1000);
  }
  $("miVestuarioPuntos").addEventListener("click", e => {
    const b = e.target.closest("[data-foto]"); if (!b) return;
    mostrarFoto(Number(b.dataset.foto)); iniciarCarrusel();
  });
  // Deslizar con el dedo en el celular
  let toqueX = null;
  $("miVestuario").addEventListener("touchstart", e => { toqueX = e.touches[0].clientX; }, { passive: true });
  $("miVestuario").addEventListener("touchend", e => {
    if (toqueX === null) return;
    const dx = e.changedTouches[0].clientX - toqueX; toqueX = null;
    if (Math.abs(dx) > 40) { mostrarFoto(carrusel.i + (dx < 0 ? 1 : -1)); iniciarCarrusel(); }
  });

  // Reduce la foto antes de subirla (más rápida en datos móviles)
  function reducirImagen(archivo, lado = 1400) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => {
        const k = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d"); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? ok(b) : mal(new Error("No se pudo procesar la imagen")), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("formato")); };
      img.src = url;
    });
  }

  // ---------- Editor de fotos (tesorería) ----------
  let subiendo = 0;
  function pintarEditorFoto() {
    const fotos = fotosDe();
    $("fotosConteo").textContent = fotos.length ? fotos.length + " de " + MAX_FOTOS : "";
    const lleno = fotos.length >= MAX_FOTOS;
    $("btnAgregarFotos").classList.toggle("deshabilitado", lleno || subiendo > 0);
    $("btnAgregarFotos").textContent = subiendo ? "Subiendo " + subiendo + "…" : lleno ? "Máximo 8 fotos" : "Agregar fotos";
    $("fotoArchivo").disabled = lleno || subiendo > 0;
    const activo = document.activeElement;
    const editando = activo && activo.dataset && activo.dataset.textoFoto !== undefined;
    if (!editando) {
      $("fotosGrid").innerHTML = fotos.length ? fotos.map((f, i) => `
        <div class="foto-item">
          <div class="foto-item-img"><img src="${esc(f.url)}" alt="Foto ${i + 1}"><span class="foto-num">${i + 1}</span></div>
          <input data-texto-foto="${i}" maxlength="60" value="${esc(f.texto || "")}" placeholder="Texto de esta foto (opcional)" aria-label="Texto de la foto ${i + 1}">
          <div class="foto-acciones">
            <button type="button" class="icono-btn" data-mover="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">←</button>
            <button type="button" class="icono-btn" data-mover="${i}" data-dir="1" ${i === fotos.length - 1 ? "disabled" : ""} aria-label="Mover después">→</button>
            <button type="button" class="link danger" data-quitar-foto="${i}">Quitar</button>
          </div>
        </div>`).join("")
        : `<div class="vacio" style="grid-column:1/-1"><b>Todavía no hay fotos</b>Toca “Agregar fotos” y elige una o varias imágenes del vestuario.</div>`;
    }
    if (activo !== $("fotoTexto")) $("fotoTexto").value = (cfg && cfg.fotoTexto) || "";
  }
  async function guardarFotos(lista) {
    await S.db.actualizar("config", "general", { fotos: lista });
    cfg.fotos = lista; // se ve de inmediato, sin esperar a la recarga
  }
  function errorFotos(err) {
    msg("fotoMsg", err && (err.code === "permission-denied" || err.code === "falta-sql")
      ? "Falta preparar la base de datos: corre supabase/04-varias-fotos.sql en el SQL Editor de Supabase."
      : textoError(err), true);
  }
  $("fotoArchivo").addEventListener("change", async e => {
    const archivos = Array.from(e.target.files || []); e.target.value = "";
    if (!archivos.length) return;
    const espacio = MAX_FOTOS - fotosDe().length;
    const elegidos = archivos.slice(0, espacio);
    if (archivos.length > espacio) msg("fotoMsg", "Solo caben " + espacio + " foto(s) más. Se subirán las primeras.", true);
    subiendo = elegidos.length; pintarEditorFoto();
    let nuevas = [], fallidas = 0;
    for (const f of elegidos) {
      try {
        const blob = await reducirImagen(f);
        const r = await S.archivos.subir(blob, "vestuario.jpg");
        nuevas.push({ url: r.url, ruta: r.ruta, texto: "" });
      } catch (err) {
        if (err && (err.code === "falta-sql" || err.code === "permission-denied")) { errorFotos(err); fallidas = elegidos.length; break; }
        fallidas++;
      }
      subiendo--; pintarEditorFoto();
    }
    subiendo = 0;
    if (nuevas.length) {
      try {
        await guardarFotos(fotosDe().concat(nuevas));
        msg("fotoMsg", nuevas.length === 1 ? "¡Foto publicada!" : "¡" + nuevas.length + " fotos publicadas!");
        window.celebrar();
      } catch (err) { errorFotos(err); nuevas.forEach(n => S.archivos.borrar(n.ruta)); }
    }
    if (fallidas && nuevas.length) msg("fotoMsg", fallidas + " foto(s) no se pudieron subir. Usa JPG o PNG (las HEIC del iPhone no sirven: sube un pantallazo).", true);
    else if (fallidas && !nuevas.length && !$("fotoMsg").classList.contains("err")) msg("fotoMsg", "No se pudo subir. Usa fotos JPG o PNG (las HEIC del iPhone no sirven: sube un pantallazo).", true);
    pintarEditorFoto(); render();
  });
  $("fotosGrid").addEventListener("click", async e => {
    const bt = e.target.closest("button"); if (!bt) return;
    const lista = fotosDe().slice();
    try {
      if (bt.dataset.mover !== undefined) {
        const i = Number(bt.dataset.mover), j = i + Number(bt.dataset.dir);
        if (j < 0 || j >= lista.length) return;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        await guardarFotos(lista);
      } else if (bt.dataset.quitarFoto !== undefined) {
        const i = Number(bt.dataset.quitarFoto);
        if (!confirmar(bt, "qf" + i, "¿Quitar?")) return;
        const [quitada] = lista.splice(i, 1);
        await guardarFotos(lista);
        S.archivos.borrar(quitada.ruta);
        msg("fotoMsg", "Foto quitada.");
      }
      pintarEditorFoto(); render();
    } catch (err) { errorFotos(err); }
  });
  // Texto de cada foto: se guarda al salir del campo
  $("fotosGrid").addEventListener("change", async e => {
    const inp = e.target; if (inp.dataset.textoFoto === undefined) return;
    const lista = fotosDe().map(f => ({ ...f }));
    const i = Number(inp.dataset.textoFoto); if (!lista[i]) return;
    lista[i].texto = inp.value.trim();
    try { await guardarFotos(lista); msg("fotoMsg", "Texto guardado."); } catch (err) { errorFotos(err); }
  });
  $("fotoTexto").addEventListener("change", async () => {
    try { await S.db.actualizar("config", "general", { fotoTexto: $("fotoTexto").value.trim() }); msg("fotoMsg", "Título guardado."); }
    catch (err) { errorFotos(err); }
  });

  // ---------- App en el celular ----------
  // Se instala desde el menú del navegador ("Agregar a pantalla de inicio")
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker:", err)));
  }

  // ---------- Colectivo ----------
  function renderColectivo(mio) {
    const s = sumas();
    const ids = new Set(integrantes.map(i => i.id));
    const validos = aportes.filter(a => ids.has(a.integranteId));
    const total = validos.reduce((t, a) => t + a.monto, 0);
    const conf = validos.filter(a => a.estado === "recibido").reduce((t, a) => t + a.monto, 0);
    const metaTotal = integrantes.reduce((t, p) => t + metaDe(p), 0);
    const pct = metaTotal ? Math.min(100, total / metaTotal * 100) : 0;
    $("cTotal").textContent = money(total);
    $("cMetaTxt").innerHTML = metaTotal ? `Meta del colectivo<br><b style="color:var(--ink)">${money(metaTotal)}</b>` : "Sin meta definida";
    $("cBarra").style.width = pct + "%";
    $("cPct").textContent = metaTotal ? Math.floor(pct) + "% de la meta" : "";
    $("cFalta").textContent = metaTotal ? "Faltan " + money(Math.max(0, metaTotal - total)) : "";
    const cumplieron = integrantes.filter(p => metaDe(p) && (s.total[p.id] || 0) >= metaDe(p)).length;
    $("rIntegrantes").textContent = integrantes.length;
    $("rCumplieron").textContent = cumplieron;
    $("rConfirmado").textContent = money(conf);
    $("rPendiente").textContent = money(total - conf);

    const orden = $("cOrden").value;
    const lista = integrantes.map(p => { const ah = s.total[p.id] || 0, m = metaDe(p); return { p, ah, m, pc: m ? ah / m : 0, falta: Math.max(0, m - ah) }; });
    lista.sort((a, b) => orden === "avance" ? b.pc - a.pc : orden === "falta" ? b.falta - a.falta : ordenNombre(a.p, b.p));
    $("cPersonas").innerHTML = lista.length ? lista.map(({ p, ah, m, pc }) => {
      const listo = m && ah >= m;
      return `<div class="persona num">
        <div class="avatar" style="background:${colorDe(p.nombre)}">${esc(iniciales(p.nombre))}</div>
        <div class="persona-info">
          <div class="persona-top"><span class="persona-nombre">${esc(p.nombre)}${mio && p.id === mio.id ? '<span class="yo">Tú</span>' : ""}</span>
            <span class="persona-monto"><b>${money(ah)}</b> de ${m ? money(m) : "–"}</span></div>
          <div class="barra"><i style="width:${Math.min(100, pc * 100)}%"></i></div>
        </div>
        <div class="pct${listo ? " meta" : ""}">${listo ? "¡Listo!" : Math.floor(Math.min(100, pc * 100)) + "%"}</div>
      </div>`;
    }).join("") : `<div class="vacio"><b>Todavía no hay integrantes</b>La tesorería puede agregarlos, o cada persona se une al crear su cuenta.</div>`;

    const nombreDe = {}; integrantes.forEach(i => nombreDe[i.id] = i.nombre);
    const feed = validos.slice().sort((a, b) => (b.creado || 0) - (a.creado || 0)).slice(0, 10);
    $("cFeed").innerHTML = feed.length ? feed.map(a => htmlMov(a, { titulo: nombreDe[a.integranteId] })).join("")
      : `<div class="vacio"><b>Sin movimientos todavía</b>Aquí aparece cada ahorro que se anote.</div>`;
  }
  $("cOrden").addEventListener("change", render);

  // ---------- Tesorería ----------
  function renderTesoreria(pendientes) {
    const s = sumas();
    const nombreDe = {}; integrantes.forEach(i => nombreDe[i.id] = i.nombre);
    const totPend = pendientes.reduce((t, a) => t + a.monto, 0);
    $("tPendTxt").textContent = pendientes.length ? pendientes.length + " · " + money(totPend) : "";
    $("tPendientes").innerHTML = pendientes.length ? pendientes.slice().sort(ordenReciente).map(a => htmlMov(a, {
      titulo: nombreDe[a.integranteId],
      acciones: `<button type="button" class="btn verde peq" data-confirmar="${esc(a.id)}">Confirmar recibido</button><button type="button" class="link danger" data-rechazar="${esc(a.id)}">Rechazar</button>`
    })).join("") : `<div class="vacio"><b>Todo al día</b>No hay ahorros esperando confirmación.</div>`;

    // Selector de integrante
    const sel = $("tInt"), antes = sel.value;
    sel.innerHTML = '<option value="">Elige a la persona…</option>' + integrantes.slice().sort(ordenNombre).map(i => `<option value="${esc(i.id)}">${esc(i.nombre)}</option>`).join("");
    if (integrantes.some(i => i.id === antes)) sel.value = antes;

    // Integrantes y cuentas
    const q = $("tBuscar").value.trim().toLowerCase();
    const lista = integrantes.filter(i => !q || i.nombre.toLowerCase().includes(q)).sort(ordenNombre);
    $("tIntegrantes").innerHTML = lista.length ? lista.map(i => {
      const tot = s.total[i.id] || 0, m = metaDe(i);
      const cuenta = i.uid ? `<span class="chip ok">${esc(i.email || "Con cuenta")}</span>` : '<span class="chip libre">Sin cuenta</span>';
      const esAdm = i.email && cfg.admins.includes(i.email) ? ' <span class="chip adm">Tesorería</span>' : "";
      const editor = editandoMeta === i.id
        ? `<div class="toolbar" style="margin-top:6px"><input id="metaEdit" inputmode="numeric" value="${miles(i.meta)}" placeholder="Vacío = meta general" style="max-width:170px"><button type="button" class="btn peq" data-guardar-meta="${esc(i.id)}">Guardar</button><button type="button" class="link" data-cancelar-meta>Cancelar</button></div>`
        : "";
      return `<div class="mov num">
        <div class="avatar" style="background:${colorDe(i.nombre)}">${esc(iniciales(i.nombre))}</div>
        <div class="mov-info"><span class="mov-titulo">${esc(i.nombre)}${esAdm}</span><span class="mov-sub">${money(tot)} de ${m ? money(m) : "–"}${i.meta ? " (meta personal)" : ""}</span><div style="margin-top:4px">${cuenta}</div>${editor}</div>
        <div class="mov-der"><div class="mov-acciones">
          <button type="button" class="link" data-editar-meta="${esc(i.id)}">Meta</button>
          ${i.uid ? `<button type="button" class="link" data-desvincular="${esc(i.id)}">Desvincular</button>` : ""}
          <button type="button" class="link danger" data-quitar="${esc(i.id)}">Quitar</button>
        </div></div>
      </div>`;
    }).join("") : `<div class="vacio"><b>${q ? "Nadie coincide con la búsqueda" : "Todavía no hay integrantes"}</b>${q ? "" : "Agrégalos con el formulario “Agregar integrante”."}</div>`;
    if (editandoMeta) { const inp = $("metaEdit"); if (inp && document.activeElement !== inp) { inp.focus(); inp.addEventListener("input", e => e.target.value = miles(parseMoney(e.target.value))); } }

    // Ajustes
    const activo = document.activeElement;
    if (activo !== $("cfNombre")) $("cfNombre").value = cfg.nombre || "";
    if (activo !== $("cfFecha")) $("cfFecha").value = cfg.fecha || FECHA_DEFECTO;
    if (activo !== $("cfMeta")) $("cfMeta").value = miles(cfg.meta);
    if (activo !== $("cfAdmins")) $("cfAdmins").value = cfg.admins.join(", ");
    pintarEditorFoto();
  }
  $("tBuscar").addEventListener("input", render);

  $("tPendientes").addEventListener("click", async e => {
    const c = e.target.closest("[data-confirmar]"), r = e.target.closest("[data-rechazar]");
    try {
      if (c) {
        c.disabled = true;
        await S.db.actualizar("aportes", c.dataset.confirmar, { estado: "recibido", recibidoPor: (yo() && yo().nombre) || usuario.email, recibidoEn: Date.now() });
        toast("Ahorro confirmado");
      } else if (r) {
        if (!confirmar(r, "rz" + r.dataset.rechazar, "¿Rechazar? Toca otra vez")) return;
        await S.db.borrar("aportes", r.dataset.rechazar); toast("Registro rechazado y borrado");
      }
    } catch (err) { toast(textoError(err)); }
  });

  $("tIntegrantes").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    try {
      if (d.editarMeta) { editandoMeta = d.editarMeta; render(); }
      else if (d.cancelarMeta !== undefined) { editandoMeta = null; render(); }
      else if (d.guardarMeta) {
        await S.db.actualizar("integrantes", d.guardarMeta, { meta: parseMoney($("metaEdit").value) });
        editandoMeta = null; toast("Meta actualizada"); render();
      } else if (d.desvincular) {
        if (!confirmar(b, "dv" + d.desvincular, "¿Desvincular?")) return;
        await S.db.actualizar("integrantes", d.desvincular, { uid: null, email: "" }); toast("Cuenta desvinculada");
      } else if (d.quitar) {
        if (!confirmar(b, "qt" + d.quitar, "¿Quitar y borrar sus ahorros?")) return;
        const id = d.quitar;
        for (const a of aportes.filter(a => a.integranteId === id)) await S.db.borrar("aportes", a.id);
        await S.db.borrar("integrantes", id); toast("Integrante quitado");
      }
    } catch (err) { toast(textoError(err)); }
  });

  $("formAporteAdm").addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("tInt").value, monto = parseMoney($("tMonto").value);
    if (!id) return msg("tMsg", "Elige a la persona.", true);
    if (!monto) return msg("tMsg", "Escribe el valor.", true);
    const p = integrantes.find(i => i.id === id), quien = (yo() && yo().nombre) || usuario.email;
    try {
      await S.db.agregar("aportes", {
        integranteId: id, monto, fecha: $("tFecha").value || hoyISO(),
        medio: (document.querySelector('input[name="tMedio"]:checked') || {}).value || "Efectivo",
        nota: $("tNota").value.trim(), estado: "recibido",
        registradoPor: usuario.uid, registradoNombre: quien, recibidoPor: quien, recibidoEn: Date.now(), creado: Date.now()
      });
      $("tMonto").value = ""; $("tNota").value = "";
      msg("tMsg", "Guardado: " + money(monto) + " de " + p.nombre + ".");
    } catch (err) { msg("tMsg", textoError(err), true); }
  });

  $("formInt").addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = $("iNombre").value.trim();
    if (nombre.length < 3) return msg("iMsg", "Escribe el nombre completo.", true);
    if (integrantes.some(i => i.nombre.toLowerCase() === nombre.toLowerCase())) return msg("iMsg", nombre + " ya está en la lista.", true);
    try {
      await S.db.agregar("integrantes", { nombre, meta: parseMoney($("iMeta").value), uid: null, email: "", creado: Date.now() });
      $("iNombre").value = ""; $("iMeta").value = ""; msg("iMsg", nombre + " quedó agregado.");
    } catch (err) { msg("iMsg", textoError(err), true); }
  });

  $("formCfg").addEventListener("submit", async e => {
    e.preventDefault();
    let admins = $("cfAdmins").value.split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^\S+@\S+\.\S+$/.test(x));
    if (!admins.includes(usuario.email)) admins.unshift(usuario.email);
    admins = Array.from(new Set(admins));
    try {
      await S.db.guardar("config", "general", { nombre: $("cfNombre").value.trim(), meta: parseMoney($("cfMeta").value), fecha: $("cfFecha").value || FECHA_DEFECTO, admins });
      msg("cfMsg", "Ajustes guardados.");
    } catch (err) { msg("cfMsg", textoError(err), true); }
  });

  $("formInicio").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await S.db.guardar("config", "general", {
        nombre: $("inNombre").value.trim() || "Mi colectivo", meta: parseMoney($("inMeta").value),
        fecha: $("inFecha").value || FECHA_DEFECTO, admins: [usuario.email]
      });
      toast("¡Listo! Ya puedes agregar integrantes"); window.celebrar(true);
    } catch (err) { msg("inMsg", textoError(err), true); }
  });

  // ---------- Descargar Excel con diseño ----------
  function datosParaExcel() {
    const nombreDe = {}; integrantes.forEach(i => nombreDe[i.id] = i.nombre);
    const s = sumas();
    return {
      colectivo: (cfg && cfg.nombre) || "Danzantes del Cerrillo",
      fechaDesfile: fechaDesfile(),
      integrantes: integrantes.map(i => ({ nombre: i.nombre, meta: metaDe(i), ahorrado: s.total[i.id] || 0, confirmado: s.conf[i.id] || 0 })),
      movimientos: aportes.filter(a => nombreDe[a.integranteId]).map(a => ({
        fecha: a.fecha, integrante: nombreDe[a.integranteId], valor: a.monto, medio: a.medio || "",
        estado: a.estado, nota: a.nota || "", anotadoPor: a.registradoNombre || "", recibidoPor: a.recibidoPor || ""
      }))
    };
  }
  // Respaldo: CSV sencillo por si el Excel con diseño no se puede crear
  function descargarCSV(d) {
    const celda = v => { const t = String(v ?? ""); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const filas = [["Integrante", "Fecha", "Valor", "Medio", "Estado", "Nota", "Anotado por", "Recibido por"]];
    d.movimientos.forEach(m => filas.push([m.integrante, m.fecha, m.valor, m.medio, m.estado === "recibido" ? "Recibido" : "Por confirmar", m.nota, m.anotadoPor, m.recibidoPor]));
    const csv = "\uFEFF" + filas.map(f => f.map(celda).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "ahorro-vestuario-" + hoyISO() + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("btnExportar").addEventListener("click", async () => {
    const b = $("btnExportar"), texto = b.textContent;
    b.disabled = true; b.textContent = "Preparando Excel…";
    const d = datosParaExcel();
    try {
      await window.exportarExcel(d);
      toast("Excel descargado");
    } catch (err) {
      console.error("Excel:", err);
      descargarCSV(d);
      toast("No se pudo crear el Excel con diseño; se descargó la versión sencilla (CSV)");
    }
    b.disabled = false; b.textContent = texto;
  });

  // Actualiza la cuenta regresiva a medianoche
  setInterval(pintarComunes, 60 * 60 * 1000);
  pintarComunes();
})();
