// /agent/* 公开端点：login.sh / install.sh / SKILL.md 下发（从 skills/xhs-matrix/ 目录读文件）。
// skill 与脚本零密钥，故公开；目录缺文件时优雅 404；Host 头白名单校验防 shell 注入。
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { httpError } from '../engine/errors.js';

export const SKILL_NAME = 'xhs-matrix';

// Host 格式校验（K6）：hostname / IPv4 / 方括号 IPv6 + 可选端口。字符集白名单天然防 shell 注入，
// 公网域名正常渲染；非法值一律 400，不再静默回退 127.0.0.1（回退会让脚本指向错误地址）。
const HOST_PATTERN = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;

function baseUrl(req) {
  const host = String(req.headers.host ?? '');
  if (!HOST_PATTERN.test(host)) throw httpError(400, 'bad_request', '非法 Host 头');
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

function serveSkillFile(req, skillsDir, fileName, { render }) {
  // 防路径穿越：规范化后必须仍在 skillsDir 内
  const full = normalize(join(skillsDir, fileName));
  if (!full.startsWith(normalize(skillsDir) + '/') && full !== normalize(skillsDir)) {
    throw httpError(400, 'bad_request', '非法路径');
  }
  if (!existsSync(full)) throw httpError(404, 'not_found', 'skill 文件不存在（部署包未包含 skills/ 目录）');
  let content = readFileSync(full, 'utf8');
  if (render) content = content.replaceAll('{{BASE_URL}}', baseUrl(req));
  return content;
}

export default async function agentFileRoutes(app, opts) {
  const skillsDir = opts.skillsDir;

  const send = (req, reply, fileName, render) => {
    const content = serveSkillFile(req, skillsDir, fileName, { render });
    return reply.type('text/plain; charset=utf-8').send(content);
  };

  app.get('/agent/login.sh', async (req, reply) => send(req, reply, 'login.sh', true));
  app.get('/agent/login.ps1', async (req, reply) => send(req, reply, 'login.ps1', true));
  app.get(`/agent/skill/${SKILL_NAME}/install.sh`, async (req, reply) => send(req, reply, 'install.sh', true));
  app.get(`/agent/skill/${SKILL_NAME}/install.ps1`, async (req, reply) => send(req, reply, 'install.ps1', true));
  app.get(`/agent/skill/${SKILL_NAME}/SKILL.md`, async (req, reply) => send(req, reply, 'SKILL.md', false));
  // skill 包内其他静态文件（客户端脚本等），仅下发不渲染
  app.get(`/agent/skill/${SKILL_NAME}/files/*`, async (req, reply) => send(req, reply, req.params['*'], false));
}
