// Local dev server: serves public/ and routes /api/<name> to api/<name>.js
const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    try { return await require('./api/' + u.pathname.slice(5).replace(/[^a-z-]/g, '') + '.js')(req, res); }
    catch (e) { res.statusCode = 500; return res.end(String(e)); }
  }
  let f = path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
