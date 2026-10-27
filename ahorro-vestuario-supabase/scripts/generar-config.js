// Genera public/js/supabase-config.js a partir de variables de entorno.
// Render lo ejecuta al publicar (ver render.yaml).
// Si las variables no existen, deja el archivo como está.
const fs = require("fs");
const path = require("path");

const url = (process.env.SUPABASE_URL || "").trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
const destino = path.join(__dirname, "..", "public", "js", "supabase-config.js");

if (!url || !anonKey) {
  console.log("SUPABASE_URL o SUPABASE_ANON_KEY no están definidas: se usa public/js/supabase-config.js tal como está.");
  process.exit(0);
}
if (/service_role|sb_secret_/i.test(anonKey)) {
  console.error("ERROR: SUPABASE_ANON_KEY parece ser la clave secreta (service_role). Usa la clave anon/publishable.");
  process.exit(1);
}

const contenido = `// Generado automáticamente al publicar. No editar.
window.SUPABASE_CONFIG = ${JSON.stringify({ url, anonKey }, null, 2)};
`;
fs.writeFileSync(destino, contenido);
console.log("Configuración de Supabase escrita en public/js/supabase-config.js");
