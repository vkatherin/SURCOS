// =============================================================
//  SERVICIO: inicio de sesión + base de datos
//  - Con Supabase configurado (js/supabase-config.js): Supabase Auth
//    (correo y contraseña) + base de datos Postgres en tiempo real.
//  - Sin configurar: MODO DE PRUEBA en el navegador (localStorage).
//
//  La app usa nombres en camelCase (integranteId); la base de datos
//  usa snake_case (integrante_id). Aquí se traduce en ambos sentidos.
// =============================================================
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const conSupabase = !!(cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient);

  const aSnake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, m => "_" + m.toLowerCase()), v]));
  const aCamel = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
  const error = (code, message) => Object.assign(new Error(message || code), { code });

  // ---------------- SUPABASE ----------------
  function servicioSupabase() {
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const usuario = u => u ? { uid: u.id, email: (u.email || "").toLowerCase(), nombre: (u.user_metadata && u.user_metadata.nombre) || "" } : null;

    // Traduce errores de Supabase a los códigos que entiende la app
    function traducir(e) {
      if (!e) return e;
      const m = String(e.message || "").toLowerCase(), s = e.status || 0, c = String(e.code || "");
      let code = "desconocido";
      if (m.includes("invalid login credentials")) code = "auth/invalid-credential";
      else if (m.includes("email not confirmed")) code = "auth/email-not-confirmed";
      else if (m.includes("already registered") || c === "user_already_exists") code = "auth/email-already-in-use";
      else if (m.includes("password should be") || c === "weak_password") code = "auth/weak-password";
      else if (m.includes("invalid email") || m.includes("unable to validate email") || c === "email_address_invalid") code = "auth/invalid-email";
      else if (s === 429 || m.includes("rate limit")) code = "auth/too-many-requests";
      else if (m.includes("failed to fetch") || m.includes("network")) code = "auth/network-request-failed";
      else if (c === "42501" || m.includes("row-level security") || m.includes("permission denied") || m.includes("solo la tesorería")) code = "permission-denied";
      else if (c === "23505") code = "duplicado";
      console.error("Supabase:", e);
      return error(code, e.message);
    }
    const ok = r => { if (r.error) throw traducir(r.error); return r.data; };

    let recuperarCb = null;

    return {
      modo: "supabase",
      auth: {
        alCambiar(cb) {
          const { data } = sb.auth.onAuthStateChange((evento, sesion) => {
            if (evento === "PASSWORD_RECOVERY") { recuperarCb && recuperarCb(); return; }
            if (evento === "TOKEN_REFRESHED" || evento === "USER_UPDATED") return;
            // Se difiere para no llamar a Supabase dentro de su propio aviso
            setTimeout(() => cb(usuario(sesion && sesion.user)), 0);
          });
          return () => data.subscription.unsubscribe();
        },
        alRecuperar(cb) { recuperarCb = cb; },
        async ingresar(email, clave) { ok(await sb.auth.signInWithPassword({ email, password: clave })); },
        async registrar(nombre, email, clave) {
          const d = ok(await sb.auth.signUp({ email, password: clave, options: { data: { nombre }, emailRedirectTo: location.origin + location.pathname } }));
          if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) throw error("auth/email-already-in-use");
          if (!d.session) throw error("auth/confirmar-correo");
          return usuario(d.user);
        },
        async recuperar(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
        async nuevaClave(clave) { ok(await sb.auth.updateUser({ password: clave })); },
        async usuarioActual() { const { data } = await sb.auth.getUser(); return usuario(data && data.user); },
        async salir() { await sb.auth.signOut(); }
      },
      db: {
        // Lee la tabla completa y la vuelve a leer cuando alguien cambia algo
        escuchar(tabla, cb, alError) {
          let vivo = true, espera = null;
          const cargar = async () => {
            const r = await sb.from(tabla).select("*");
            if (!vivo) return;
            if (r.error) { alError && alError(traducir(r.error)); return; }
            cb(r.data.map(aCamel));
          };
          const canal = sb.channel("cambios-" + tabla + "-" + Math.random().toString(36).slice(2))
            .on("postgres_changes", { event: "*", schema: "public", table: tabla }, () => {
              clearTimeout(espera); espera = setTimeout(cargar, 150);
            })
            .subscribe();
          cargar();
          // Respaldo: si el tiempo real falla, actualiza al volver a la pestaña
          const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
          document.addEventListener("visibilitychange", alVolver);
          return () => { vivo = false; sb.removeChannel(canal); document.removeEventListener("visibilitychange", alVolver); };
        },
        async agregar(tabla, datos) {
          const d = ok(await sb.from(tabla).insert(aSnake(datos)).select("id").single());
          return { id: d.id };
        },
        async guardar(tabla, id, datos) {
          // Primero intenta actualizar; si no existe, lo crea
          const filas = ok(await sb.from(tabla).update(aSnake(datos)).eq("id", id).select("id"));
          if (!filas.length) ok(await sb.from(tabla).insert({ id, ...aSnake(datos) }));
        },
        async actualizar(tabla, id, datos) {
          const filas = ok(await sb.from(tabla).update(aSnake(datos)).eq("id", id).select("id"));
          if (!filas.length) throw error("permission-denied");
        },
        async borrar(tabla, id) {
          if (tabla === "integrantes") ok(await sb.from("aportes").delete().eq("integrante_id", id));
          ok(await sb.from(tabla).delete().eq("id", id));
        }
      }
    };
  }

  // ---------------- MODO DE PRUEBA (navegador) ----------------
  function servicioLocal() {
    const K_DATOS = "ahorro-vestuario-datos-v3", K_CUENTAS = "ahorro-vestuario-cuentas-v3", K_SESION = "ahorro-vestuario-sesion-v3";
    const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (_) { return def; } };
    const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const huella = s => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return String(h); };

    let datos = leer(K_DATOS, {});
    const oyentes = {};
    const lista = c => Object.entries(datos[c] || {}).map(([id, d]) => ({ id, ...d }));
    const avisar = c => (oyentes[c] || []).forEach(cb => cb(lista(c)));
    const guardarTodo = () => { escribir(K_DATOS, datos); Object.keys(oyentes).forEach(avisar); };

    let alCambiarCb = null;
    const sesion = () => leer(K_SESION, null);
    const cambiarSesion = u => { escribir(K_SESION, u); alCambiarCb && alCambiarCb(u); };

    window.addEventListener("storage", e => {
      if (e.key === K_DATOS) { datos = leer(K_DATOS, {}); Object.keys(oyentes).forEach(avisar); }
      if (e.key === K_SESION) alCambiarCb && alCambiarCb(sesion());
    });

    return {
      modo: "local",
      auth: {
        alCambiar(cb) { alCambiarCb = cb; setTimeout(() => cb(sesion()), 150); return () => { alCambiarCb = null; }; },
        alRecuperar() {},
        async ingresar(email, clave) {
          email = String(email).trim().toLowerCase();
          const c = leer(K_CUENTAS, {})[email];
          if (!c || c.clave !== huella(clave)) throw error("auth/invalid-credential");
          cambiarSesion({ uid: c.uid, email, nombre: c.nombre });
        },
        async registrar(nombre, email, clave) {
          email = String(email).trim().toLowerCase();
          const cuentas = leer(K_CUENTAS, {});
          if (cuentas[email]) throw error("auth/email-already-in-use");
          const u = { uid: nuevoId(), email, nombre };
          cuentas[email] = { uid: u.uid, nombre, clave: huella(clave) };
          escribir(K_CUENTAS, cuentas);
          cambiarSesion(u);
          return u;
        },
        async recuperar() { throw error("local/recuperar"); },
        async nuevaClave() {},
        async usuarioActual() { return sesion(); },
        async salir() { cambiarSesion(null); }
      },
      db: {
        escuchar(c, cb) {
          (oyentes[c] = oyentes[c] || []).push(cb);
          setTimeout(() => cb(lista(c)), 0);
          return () => { oyentes[c] = (oyentes[c] || []).filter(f => f !== cb); };
        },
        async agregar(c, d) { const id = nuevoId(); (datos[c] = datos[c] || {})[id] = d; guardarTodo(); return { id }; },
        async guardar(c, id, d) { (datos[c] = datos[c] || {})[id] = d; guardarTodo(); },
        async actualizar(c, id, d) { if (!datos[c] || !datos[c][id]) throw error("not-found"); Object.assign(datos[c][id], d); guardarTodo(); },
        async borrar(c, id) {
          if (c === "integrantes" && datos.aportes) Object.keys(datos.aportes).forEach(k => { if (datos.aportes[k].integranteId === id) delete datos.aportes[k]; });
          if (datos[c]) delete datos[c][id];
          guardarTodo();
        }
      }
    };
  }

  window.Servicio = conSupabase ? servicioSupabase() : servicioLocal();
})();
