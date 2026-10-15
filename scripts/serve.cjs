'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4173;
const url = `http://127.0.0.1:${port}`;
function openPreview() {
  if(args.includes('--open') && process.platform==='win32')execFile('powershell.exe',['-NoProfile','-Command',`Start-Process -FilePath '${url}'`],error=>{if(error)console.log('请在浏览器手动打开以上地址。');});
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  let requestPath;
  try { requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end('Bad request'); return; }
  const file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
  if (!file.startsWith(root + path.sep) || ['.git','.codex','Target','tests'].some(part => path.relative(root, file).split(path.sep).includes(part))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => {
  console.log(`百味饭馆正在营业： ${url}\n无需安装依赖。按 Ctrl+C 关闭。`);
  openPreview();
});
server.on('error', error => {
  if(error.code !== 'EADDRINUSE') { console.error(error.message); process.exitCode = 1; return; }
  // Compare the served entry page so repeated starts can reuse an older preview process too.
  const expected = fs.readFileSync(path.join(root,'index.html'));
  const occupied = () => { console.error(`端口${port}被其他程序占用，请运行 npm start -- --port ${port+1}`); process.exitCode = 1; };
  const request = http.get(`${url}/index.html`, response => {
    const chunks=[]; let size=0;
    response.on('data', chunk => { size+=chunk.length; if(size>expected.length)request.destroy(new Error('Different application')); else chunks.push(chunk); });
    response.on('end', () => {
      if(response.statusCode !== 200 || !Buffer.concat(chunks).equals(expected)) { occupied(); return; }
      console.log(`百味饭馆已经在运行，直接使用现有服务： ${url}\n无需重复启动；关闭本窗口不会停止原来的服务。`);
      openPreview();
    });
    response.on('error', error => request.destroy(error));
  });
  request.setTimeout(1500, () => request.destroy(new Error('Preview check timed out')));
  request.on('error', occupied);
});
