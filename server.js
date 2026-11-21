'use strict';

const http = require('node:http');
const path = require('node:path');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('[server] PORT 必须是 1–65535 之间的整数');
  process.exit(1);
}

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
const compressionCache = new Map();
const MAX_COMPRESSION_CACHE_ENTRIES = 24;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function setCommonHeaders(res) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  setCommonHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendApiError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function pickCompression(acceptEncodingHeader) {
  const accepted = new Map();

  for (const part of String(acceptEncodingHeader || '').split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';');
    if (!name) continue;

    let quality = 1;
    for (const parameter of parameters) {
      const [key, value] = parameter.trim().split('=');
      if (key === 'q') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) quality = parsed;
      }
    }
    accepted.set(name, quality);
  }

  if ((accepted.get('br') || 0) > 0) return 'br';
  if ((accepted.get('gzip') || 0) > 0) return 'gzip';
  return null;
}

async function compressBody(buffer, encoding, cacheKey) {
  const key = `${cacheKey}:${encoding}`;
  const cached = compressionCache.get(key);
  if (cached) return cached;

  let compressed;
  if (encoding === 'br') {
    compressed = await brotliCompress(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
      }
    });
  } else {
    compressed = await gzipCompress(buffer, { level: 6 });
  }

  if (compressed.length >= buffer.length) return null;

  compressionCache.set(key, compressed);
  if (compressionCache.size > MAX_COMPRESSION_CACHE_ENTRIES) {
    compressionCache.delete(compressionCache.keys().next().value);
  }
  return compressed;
}

async function serve404(req, res) {
  try {
    const body = await fsp.readFile(path.join(PUBLIC_DIR, '404.html'));
    setCommonHeaders(res);
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    setCommonHeaders(res);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — 这块区域还没有被探索。');
  }
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: '请求方法不被支持' }, { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { ok: false, error: '无效的请求路径' });
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendJson(res, 403, { ok: false, error: '禁止访问' });
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return serve404(req, res);
  }

  if (!stat.isFile()) return serve404(req, res);

  try {
    const data = await fsp.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const needsRevalidation = ['.html', '.css', '.js', '.json'].includes(extension);
    const cacheControl = needsRevalidation ? 'no-cache' : 'public, max-age=3600';
    const isCompressible = COMPRESSIBLE_EXTENSIONS.has(extension) && data.length > 1024;
    const encoding = isCompressible ? pickCompression(req.headers['accept-encoding']) : null;
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}${encoding ? `-${encoding}` : ''}"`;

    const ifNoneMatch = req.headers['if-none-match'];
    if (
      ifNoneMatch &&
      (ifNoneMatch.trim() === '*' ||
        ifNoneMatch.split(',').some((tag) => tag.trim() === etag))
    ) {
      setCommonHeaders(res);
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': cacheControl,
        ...(isCompressible ? { Vary: 'Accept-Encoding' } : {})
      });
      return res.end();
    }

    let body = data;
    let contentEncoding = null;

    if (encoding) {
      try {
        const compressed = await compressBody(
          data,
          encoding,
          `${filePath}:${stat.size}:${stat.mtimeMs}`
        );
        if (compressed) {
          body = compressed;
          contentEncoding = encoding;
        }
      } catch (error) {
        console.error('[static] 压缩失败：', error.message);
      }
    }

    setCommonHeaders(res);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': cacheControl,
      ETag: etag,
      ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
      ...(isCompressible ? { Vary: 'Accept-Encoding' } : {}),
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('[static] 读取失败：', error.message);
    return sendJson(res, 500, { ok: false, error: '服务器读取文件失败' });
  }
}

function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      status: 'online',
      uptime: Math.round(process.uptime()),
      node: process.version
    });
  }

  return sendApiError(res, 404, '接口不存在');
}

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJson(res, 400, { ok: false, error: '无效的请求地址' });
  }

  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }

  return serveStatic(req, res, url);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[server] 未处理的错误：', error);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: '服务器开小差了，请稍后再试' });
    } else {
      res.destroy();
    }
  });
});

server.requestTimeout = 15_000;
server.headersTimeout = 16_000;

function shutdown(signal) {
  console.log(`\n[server] 收到 ${signal}，正在关闭...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (error) => {
  console.error('');
  if (error.code === 'EADDRINUSE') {
    console.error(`  ✖ 端口 ${PORT} 已经被占用了。`);
    console.error('    可以先关闭占用该端口的程序，或者换一个端口启动：');
    console.error('    PowerShell:   $env:PORT=3001; npm start');
    console.error('    macOS/Linux:  PORT=3001 npm start');
  } else if (error.code === 'EACCES') {
    console.error(`  ✖ 没有权限监听端口 ${PORT}，请换一个 1024 以上的端口。`);
  } else {
    console.error('  ✖ 服务器启动失败：', error.message);
  }
  console.error('');
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  ⛏  MINECRAFT_SNAS — personal site');
  console.log(`  ➜  http://${shownHost}:${PORT}`);
  console.log(`  ➜  Node ${process.version} · zero dependencies`);
  console.log('');
});