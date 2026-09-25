/**
 * Development proxy — a stand-in for working DNS, and the easiest way to put
 * the admin site on the admin's computer.
 *
 * jaydee15.mooo.com does not currently point at the hosting, so nothing can
 * reach the API by name. Freehostia only answers when a request carries
 * "Host: jaydee15.mooo.com", which a phone browser or fetch() cannot fake
 * reliably. This forwards every request to Freehostia with that header set.
 *
 *   phone  ->  http://<your PC>:8080/medicines.php
 *          ->  162.210.102.232 with Host: jaydee15.mooo.com
 *
 * It also serves backend/admin/ at /admin/, straight off this disk. That means
 * the admin site works before it has been uploaded anywhere, and because the
 * page and the API then share an origin, config.js needs no editing and the
 * browser sends no CORS preflight.
 *
 *   admin  ->  http://localhost:8080/admin/
 *
 * Run it with:  node devproxy.js
 * Once the A record is fixed, the admin can use http://jaydee15.mooo.com/admin/
 * instead and this file is only needed for the phone.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const UPSTREAM_IP = '162.210.102.232';
const UPSTREAM_HOST = 'jaydee15.mooo.com';
const PORT = 8080;

/** The admin site, served from this checkout rather than from the server. */
const ADMIN_DIR = path.join(__dirname, 'backend', 'admin');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Serves /admin/... off the disk. Returns false for anything else so the
 * request falls through to the proxy.
 */
function serveAdmin(req, res) {
  if (!req.url.startsWith('/admin')) return false;

  // /admin -> /admin/, so the relative paths inside the page resolve.
  if (req.url === '/admin') {
    res.writeHead(302, { Location: '/admin/' });
    res.end();
    return true;
  }

  const rest = req.url.split('?')[0].slice('/admin/'.length) || 'index.html';
  // Never let a crafted path climb out of the admin folder.
  const file = path.join(ADMIN_DIR, path.normalize(rest).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ADMIN_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(
      'Not found in ' + ADMIN_DIR + '\n\n' +
      'Run this from the MEDICINE folder so backend/admin/ sits next to it.',
    );
    return true;
  }

  console.log(`${req.method} ${req.url} -> local file`);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store', // always hand back the file as it is right now
  });
  res.end(fs.readFileSync(file));
  return true;
}

const server = http.createServer((req, res) => {
  if (serveAdmin(req, res)) return;

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // Pass the client's headers through, but force Host and a correct length.
    const headers = { ...req.headers, host: UPSTREAM_HOST };
    delete headers['accept-encoding']; // keep the response readable in logs
    if (body.length) headers['content-length'] = String(body.length);

    const upstream = http.request(
      { host: UPSTREAM_IP, port: 80, path: req.url, method: req.method, headers },
      (up) => {
        console.log(`${req.method} ${req.url} -> ${up.statusCode}`);
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );

    upstream.on('error', (err) => {
      console.error(`${req.method} ${req.url} -> proxy error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Proxy could not reach Freehostia' }));
    });

    upstream.end(body);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const lan = Object.values(nets)
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  console.log(`Proxying :${PORT} -> ${UPSTREAM_HOST} (${UPSTREAM_IP})`);
  console.log('\nAdmin site — open this on this computer:');
  console.log(`   http://localhost:${PORT}/admin/`);
  if (lan.length) {
    console.log('\nFrom another device on the same Wi-Fi, and for the phone app,');
    console.log('set API_BASE in mobile/src/config.ts to one of:');
    lan.forEach((ip) => console.log(`   http://${ip}:${PORT}`));
  }
  console.log('\nLeave this window open while you use the app or the admin site.');
});
