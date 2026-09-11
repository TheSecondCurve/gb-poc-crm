// 需求追踪检查：PRD §4.2 中全部 P0 场景编号必须出现在 server/ 下的测试文件里。
// 规则见 docs/standards/engineering-standards.md §1；缺失即 exit 1。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prd = readFileSync(join(root, 'docs', 'prd.md'), 'utf8');

const p0 = new Set();
for (const m of prd.matchAll(/场景\s+(S\d+)（(P\d)/g)) {
  if (m[2] === 'P0') p0.add(m[1]);
}
if (p0.size === 0) {
  console.error('check:scenarios: 未从 docs/prd.md 解析到任何 P0 场景编号');
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.test\.mjs$/.test(name)) yield p;
  }
}

const corpus = [...walk(join(root, 'server'))].map((f) => readFileSync(f, 'utf8')).join('\n');

const missing = [...p0].filter((id) => !new RegExp(`\\b${id}\\b`).test(corpus));
for (const id of [...p0].sort()) {
  console.log(`${missing.includes(id) ? '✗' : '✓'} ${id}`);
}
if (missing.length > 0) {
  console.error(`check:scenarios: 缺失 P0 场景测试：${missing.join(', ')}`);
  process.exit(1);
}
console.log('check:scenarios: 全部 P0 场景编号均有测试覆盖');
