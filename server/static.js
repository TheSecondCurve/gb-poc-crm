// 生产模式静态托管：dist/ 存在（含 index.html）时由 Fastify 进程直接发 SPA。
// hash 路由无需 history fallback；/api 与 /agent 前缀不受影响。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// 返回静态文件处理器；dist 缺失（无 index.html）时返回 null（调用方回退 JSON 404）
export function makeStaticHandler(distDir) {
  if (!existsSync(join(distDir, 'index.html'))) return null;
  const root = normalize(distDir);
  return (req, reply) => {
    let url = (req.raw.url ?? '/').split('?')[0];
    try {
      url = decodeURIComponent(url);
    } catch {
      return reply.code(400).send({ error: 'bad_request', message: '非法 URL' });
    }
    if (req.method !== 'GET' || url.startsWith('/api/') || url.startsWith('/agent/')) {
      return reply.code(404).send({ error: 'not_found', message: '资源不存在' });
    }
    let p = normalize(join(root, url));
    if (!p.startsWith(root + '/') && p !== root) {
      return reply.code(404).send({ error: 'not_found', message: '资源不存在' });
    }
    if (!existsSync(p) || !statSync(p).isFile()) p = join(root, 'index.html');
    return reply.type(MIME[extname(p).toLowerCase()] ?? 'application/octet-stream').send(readFileSync(p));
  };
}
