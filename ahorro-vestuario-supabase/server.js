const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;

// Buscar automáticamente la carpeta donde se encuentra index.html
const candidateDirs = [
  path.join(__dirname, 'ahorro-vestuario', 'ahorro-vestuario-supabase', 'public'),
  path.join(__dirname, 'ahorro-vestuario-supabase', 'public'),
  path.join(__dirname, 'public'),
  path.join(__dirname, 'ahorro-vestuario'),
  __dirname
];

let BASE_DIR = candidateDirs.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || __dirname;

console.log(`📁 Sirviendo archivos desde: ${BASE_DIR}`);

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (stats && stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else {
        // En caso de que se solicite una ruta SPA que no exista, fallback a index.html
        filePath = path.join(BASE_DIR, 'index.html');
      }
    }

    fs.stat(filePath, (err2, stats2) => {
      if (err2 || !stats2.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('500 Internal Server Error');
          return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n=================================================`);
  console.log(` ✅ Servidor local activo en: ${url}`);
  console.log(` Presiona Ctrl + C para detener el servidor.`);
  console.log(`=================================================\n`);

  // Abrir en el navegador en Windows
  const openCmd = process.platform === 'win32' ? `start ${url}` : `xdg-open ${url}`;
  exec(openCmd, () => {});
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Puerto ${PORT} en uso, probando puerto ${PORT + 1}...`);
    server.listen(PORT + 1);
  } else {
    console.error('Error del servidor:', err);
  }
});
