// can() 权限矩阵逐格：admin 全部权限；member 仅业务 CRUD + 指标查看
import { describe, it, expect } from 'vitest';
import { can, ACTIONS } from './permissions.js';

const admin = { id: 1, role: 'admin', disabledAt: null };
const member = { id: 2, role: 'member', disabledAt: null };

describe('can() 权限矩阵', () => {
  it('矩阵覆盖所有声明的权限点，无遗漏', () => {
    expect(ACTIONS.sort()).toEqual([
      'audit.read',
      'business.read',
      'business.write',
      'metrics.read',
      'token.revokeAny',
      'user.manage',
    ].sort());
  });

  it.each(ACTIONS)('admin 拥有 %s', (action) => {
    expect(can(admin, action)).toBe(true);
  });

  it.each(['business.read', 'business.write', 'metrics.read'])('member 可做 %s', (action) => {
    expect(can(member, action)).toBe(true);
  });

  it.each(['user.manage', 'token.revokeAny', 'audit.read'])('member 不可做 %s', (action) => {
    expect(can(member, action)).toBe(false);
  });

  it('未知角色 / 无用户 / 已禁用用户一律无权限', () => {
    expect(can({ role: 'root' }, 'business.read')).toBe(false);
    expect(can(null, 'business.read')).toBe(false);
    expect(can({ ...admin, disabledAt: 1 }, 'business.read')).toBe(false);
    expect(can({ ...member, disabledAt: 1 }, 'metrics.read')).toBe(false);
  });

  it('未知权限点对任何角色都为 false', () => {
    expect(can(admin, 'everything')).toBe(false);
  });
});
