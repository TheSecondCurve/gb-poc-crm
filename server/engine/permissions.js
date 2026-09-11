// 权限点清单 + 两档角色矩阵（小团队裁剪：admin / member，数据范围全部放开）
export const ACTIONS = [
  'business.read', // 业务数据查看
  'business.write', // 业务数据增改删（含软删）
  'metrics.read', // 指标查询
  'user.manage', // 用户管理（建号/禁用/改角色/重置密码）
  'token.revokeAny', // 吊销任意用户的 PAT
  'audit.read', // 审计日志查看
];

const MATRIX = {
  admin: Object.fromEntries(ACTIONS.map((a) => [a, true])),
  member: {
    'business.read': true,
    'business.write': true,
    'metrics.read': true,
    'user.manage': false,
    'token.revokeAny': false,
    'audit.read': false,
  },
};

export function can(user, action) {
  if (!user || user.disabledAt) return false;
  const role = MATRIX[user.role];
  if (!role) return false;
  return role[action] === true;
}
