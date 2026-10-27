# Ahorro del Vestuario · Carnaval de Negros y Blancos

Plataforma con inicio de sesión (correo y contraseña) para que el colectivo ahorre para el vestuario del desfile del **3 de enero**.
Base de datos e inicio de sesión: **Supabase**. Publicación: **Render**, como sitio estático gratis.

---

## Cómo funciona

**Integrantes**
- Crean su cuenta con nombre, correo y contraseña.
- La primera vez eligen su nombre de la lista (o se agregan).
- En **Mi ahorro** ven su avance, cuánto les falta y cuánto ahorrar por semana, y anotan cada ahorro (Efectivo, Nequi, Daviplata o Transferencia).
- Cada ahorro queda **Por confirmar** hasta que la tesorería lo reciba.
- En **Colectivo** ven el avance de todos, que se actualiza en tiempo real.

**Tesorería**
- ⚠️ **La primera persona que entra queda como tesorería.** Que entre primero la tesorera o el tesorero.
- Confirma o rechaza ahorros, anota a nombre de cualquiera, agrega o quita integrantes, cambia metas.
- Agrega más correos de tesorería en **Ajustes**.
- Descarga todo a Excel con **Descargar Excel (CSV)**.

---

## Archivos

```
ahorro-vestuario/
├── public/                  ← lo que se publica en Render
│   ├── index.html
│   ├── css/estilos.css
│   ├── img/icono.svg
│   └── js/
│       ├── app.js           lógica de la plataforma
│       ├── servicio.js      conexión con Supabase (o modo de prueba)
│       ├── confeti.js
│       ├── supabase-config.js   URL y clave pública de Supabase
│       └── vendor/supabase.js   librería oficial de Supabase (incluida)
├── supabase/esquema.sql     ← tablas y seguridad: se corre UNA vez en Supabase
├── scripts/generar-config.js  Render lo usa para escribir supabase-config.js
├── render.yaml              configuración para Render
└── package.json
```

---

## Paso 1 · Crear la base de datos en Supabase

1. Entra a <https://supabase.com>, crea una cuenta y un **New project** (región: *South America (São Paulo)*). Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor → New query**, pega **todo** el contenido de `supabase/esquema.sql` y toca **Run**. Debe decir *Success*.
   Esto crea las tablas `config`, `integrantes` y `aportes` con sus reglas de seguridad.
3. Ve a **Authentication → Sign In / Providers → Email**:
   - Deja activado **Email**.
   - Recomendado: **desactiva "Confirm email"**. El correo gratis de Supabase solo envía unos pocos mensajes por hora, y si 30 personas se registran el mismo día, muchas no recibirán la confirmación.
4. Copia tus datos en **Project Settings → API**, o con el botón **Connect**:
   - **Project URL**, del tipo `https://xxxx.supabase.co`
   - **anon public key** o **publishable key**
   - ❌ **Nunca** uses la `service_role` / `secret` key en la página.

## Paso 2 · Probar en tu computador

Pega la URL y la clave en `public/js/supabase-config.js` y en Antigravity pide:
*"Abre la carpeta public con un servidor local"* (o en una terminal: `npx serve public`).

Sin URL ni clave, funciona en **modo de prueba**: todo queda solo en ese navegador.

## Paso 3 · Publicar en Render

Render publica desde un repositorio de **GitHub**:

1. Sube esta carpeta a un repositorio de GitHub. En Antigravity puedes pedir: *"Crea un repositorio en GitHub con esta carpeta y súbela"*.
   Si pusiste tus datos en `supabase-config.js`, puedes dejarlos: la clave anon es pública. O déjalo vacío y usa variables en Render (punto 3).
2. En <https://render.com> → **New → Static Site** → conecta el repositorio y llena:
   - **Build Command:** `node scripts/generar-config.js`
   - **Publish Directory:** `public`
3. En **Environment** agrega:
   - `SUPABASE_URL` = tu Project URL
   - `SUPABASE_ANON_KEY` = tu clave anon / publishable
4. **Create Static Site**. Render te da un enlace como `https://ahorro-vestuario.onrender.com`.

   *(Alternativa: **New → Blueprint** usa el archivo `render.yaml` y te pide las dos variables.)*

## Paso 4 · Avisarle a Supabase tu enlace de Render

En Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://ahorro-vestuario.onrender.com` (tu enlace)
- **Redirect URLs:** agrega el mismo enlace

Esto hace que los correos de "Olvidé mi contraseña" y de confirmación lleven a tu página.

---

## Seguridad (ya incluida en esquema.sql)

- Solo quien inicia sesión ve los datos. Visitantes sin cuenta no ven nada.
- Un integrante solo anota ahorros a **su propio nombre**, y quedan *por confirmar*.
- Solo la tesorería confirma, cambia metas, agrega o quita personas y edita ajustes.
- Cada integrante puede borrar un ahorro suyo mientras siga *por confirmar*.
- Una cuenta solo puede estar unida a un integrante.

## Bueno saber

- **Supabase gratis pausa el proyecto si pasa 7 días sin uso.** Si alguien entra al menos una vez por semana no pasa nada. Si se pausa, se reactiva desde el panel de Supabase con un clic, y los datos no se pierden.
- En **Table Editor** de Supabase la tesorería puede ver y corregir los datos directamente.
- Para respaldos: **Tesorería → Descargar Excel (CSV)** de vez en cuando.
