// /agent/* 公开端点：login.sh / install.sh / SKILL.md 下发（从 skills/xhs-matrix/ 目录读文件）。
// skill 与脚本零密钥，故公开；目录缺文件时优雅 404；Host 头白名单校验防 shell 注入。
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { httpError } from '../engine/errors.js';

export const SKILL_NAME = 'xhs-matrix';

// Host 白名单：localhost / 环回 / 私网 IPv4 / 常见内网主机名后缀；其余回退 127.0.0.1
const HOST_WHITELIST = /^(localhost|127\.0\.0\.1|\[::1\]|::1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9][a-z0-9.-]*\.(local|internal|lan))(:\d{1,5})?$/i;

function baseUrl(req) {
  const host = String(req.headers.host ?? '');
  if (HOST_WHITELIST.test(host)) return `http://${host}`;
  return 'http://127.0.0.1:3000';
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
