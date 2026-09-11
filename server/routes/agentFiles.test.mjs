// /agent/* 公开端点：login.sh / install.sh / SKILL.md 下发；skills 目录缺文件优雅 404；Host 白名单
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../app.js';
import { createTestApp } from '../test/helpers.mjs';

let dir, app;
afterEach(async () => {
  if (app) await app.close(); app = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined;
});

async function appWithSkills(files = {}) {
  dir = mkdtempSync(join(tmpdir(), 'xhs-skills-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  app = await buildServer({
    dbPath: join(dir, 'test.db'),
    env: { ADMIN_PASSWORD: 'admin-pass-123' },
    logger: false,
    skillsDir: dir,
  });
  return app;
}

describe('/agent/* 公开端点', () => {
  it('skills 目录缺文件时优雅 404（JSON），不 500', async () => {
    await appWithSkills(); // 空 skillsDir：部署包未包含 skills/ 的场景
    for (const url of ['/agent/login.sh', '/agent/skill/xhs-matrix/install.sh', '/agent/skill/xhs-matrix/SKILL.md']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('not_found');
    }
  });

  it('仓库 skills/ 目录随部署分发：默认 skillsDir 可直接下发真实 SKILL.md', async () => {
    const t = await createTestApp(); // 默认 skillsDir 指向仓库 skills/xhs-matrix
    const res = await t.app.inject({ method: 'GET', url: '/agent/skill/xhs-matrix/SKILL.md' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('version:');
    const sh = await t.app.inject({ method: 'GET', url: '/agent/skill/xhs-matrix/files/xhs-matrix.sh' });
    expect(sh.statusCode).toBe(200);
    await t.cleanup();
  });

  it('存在文件时下发并注入 baseUrl（{{BASE_URL}} 模板替换）', async () => {
    await appWithSkills({
      'login.sh': '#!/bin/sh\ncurl {{BASE_URL}}/api/v1/auth/tokens\n',
      'install.sh': '#!/bin/sh\necho {{BASE_URL}}\n',
      'SKILL.md': '---\nversion: 0.1.0\n---\n# xhs-matrix\n',
    });
    const res = await app.inject({ method: 'GET', url: '/agent/login.sh', headers: { host: '192.168.1.10:3000' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http://192.168.1.10:3000/api/v1/auth/tokens');
    const install = await app.inject({ method: 'GET', url: '/agent/skill/xhs-matrix/install.sh', headers: { host: 'localhost:3000' } });
    expect(install.body).toContain('http://localhost:3000');
    const skill = await app.inject({ method: 'GET', url: '/agent/skill/xhs-matrix/SKILL.md' });
    expect(skill.body).toContain('# xhs-matrix');
  });

  it('Host 头白名单校验：非法值回退 127.0.0.1，防 shell 注入', async () => {
    await appWithSkills({ 'login.sh': 'BASE={{BASE_URL}}' });
    const evil = await app.inject({ method: 'GET', url: '/agent/login.sh', headers: { host: 'evil.com; rm -rf /' } });
    expect(evil.body).toContain('http://127.0.0.1');
    expect(evil.body).not.toContain('evil.com');
    const ok = await app.inject({ method: 'GET', url: '/agent/login.sh', headers: { host: '10.0.0.5:8080' } });
    expect(ok.body).toContain('http://10.0.0.5:8080');
  });

  it('路径穿越被拒绝', async () => {
    await appWithSkills({ 'SKILL.md': 'x' });
    const res = await app.inject({ method: 'GET', url: '/agent/skill/xhs-matrix/..%2F..%2Fpackage.json' });
    expect([400, 404]).toContain(res.statusCode);
  });
});
