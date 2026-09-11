---
name: xhs-matrix
description: 小红书账号矩阵经营管理系统（xhs-matrix）本机 HTTP 客户端。用 ~/.xhs-matrix/credentials.json 的 PAT 查询或维护账号、客户、广告订单、投流、运营费用与经营指标。当用户提到查账号/客户/订单/投流/费用、记账、登记订单、经营看板数据、盈亏、复购提醒这类对系统的查询或增删改操作时使用。
version: 0.1.0
---

# xhs-matrix — 小红书账号矩阵经营管理系统

本 skill 让 Agent 直接读写 xhs-matrix 系统的数据。**skill 与脚本零密钥**——凭证在本机 `~/.xhs-matrix/credentials.json`（权限 600）。

## 客户端脚本

安装目录下的 `xhs-matrix.sh` 封装了全部调用（自动带 Bearer PAT、绕过 http_proxy、校验 TLS）：

```bash
./xhs-matrix.sh sql 'SELECT id, name, status FROM accounts WHERE deleted_at IS NULL'
./xhs-matrix.sh sql --write 'UPDATE accounts SET note = ?, updated_at = ? WHERE id = ?' '["已沟通", 1789000000000, 3]'
./xhs-matrix.sh metrics                                  # 指标目录
./xhs-matrix.sh metrics-query account_pnl '{}'           # 指标取数
./xhs-matrix.sh metrics-query monthly_overview '{"month":"2026-09","category":"美妆"}'
```

环境变量：`XHS_BASE_URL`（默认读凭证文件里的 baseUrl）、`X_INSECURE=1`（跳过 TLS 校验，**仅自签证书内网应急**，会让令牌暴露给中间人，平时不要设）。

## 端点速览

| 端点 | 用途 | scope |
|---|---|---|
| `POST /api/v1/agent/sql` | 单语句 SQL（参数化 `params` 数组），明细/自由查询与全部写操作 | read 查 / write 写 |
| `GET /api/v1/agent/metrics` | 指标目录：名称 / 中文名 / 业务定义 / 可切维度 / 时间口径 | read |
| `POST /api/v1/agent/metrics/query` | 按指标+参数取数：`{"metric":"account_pnl","params":{...}}` | read |

## 指标类问题必须用 metrics 端点

**「收入多少 / 盈亏 / 看板 / 排行 / 提醒 / 估值 / 汇总 / 对比」这类指标问题，一律先 `metrics` 看目录，再 `metrics-query` 取数。** 明细列出、自由筛选、写操作才用 SQL 端点。

**指标口径以 metrics 端点为准。** 它与服务端 dashboard 共用同一份指标定义层代码；如果你用 SQL 自算的结果与端点不一致，以端点为准（不要"修正"端点数字）。

常用指标：`monthly_overview`（月度总览，参数 month/category）、`account_pnl`（账号盈亏排行）、`idle_accounts`（闲置预警，参数 days/category）、`customer_contribution`（客户贡献）、`category_revenue`（赛道收入对比，参数 months）、`repurchase_reminders`（复购提醒，参数 days）、`account_valuation`（单账号估值，参数 accountId）。

## SQL 端点规则（违反即 4xx，不要重试）

- 单语句；只读语句以 SELECT/WITH/VALUES 开头且服务端判定 `readonly === true` 才算读，其余按写处理（需 write scope）。
- DDL（CREATE/ALTER/DROP）一律 403；读结果上限 1000 行（截断）。
- 凭据黑名单：结果列含 `password_hash`/`token_hash`、或引用 `sessions` 表 → 403。
- 返回 `rows` 是**数组的数组**（省 token），列名在 `columns` 字段。
- 收到 403 说明该操作被规则禁止，**不要换字段、换写法重试**——报告给用户。

## 写操作守则（写 SQL 绕过业务层，正确性靠你遵守）

1. **金额一律分**（`amount_cents` 等，整数）。用户说"1500 元"→ 写 `150000`。
2. **时间一律 epoch 毫秒**。业务日期字段：订单是 `published_at`（发布日期），投入/费用是 `spent_at`（支出日期）；`created_at` 填当前时间。
3. **软删不硬删**：`UPDATE ... SET deleted_at = <now_ms> WHERE id = ?`，禁止 DELETE。查询默认带 `deleted_at IS NULL`。
4. **手动补审计字段**：UPDATE/INSERT 时同时设置 `updated_at = <now_ms>`；`ad_orders` 还要补 `updated_by = <你的用户 id>`。
5. 枚举列只写下方枚举表里的值，别发明新值。
6. 写完后把改了什么、影响哪几行简要汇报给用户。

## Schema 文档

> 本区块由 `node scripts/gen-skill-schema.mjs` 从 drizzle migration 半自动生成（列结构自动同步，含义列手写保留）。漂移检查：`npm run check:drift`。

<!-- SCHEMA:BEGIN -->
### `account_investments` — 账号投入（买入 + 投流，成本事实表）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `account_id` | integer | NOT NULL，→ accounts.id | 账号 → accounts.id |
| `type` | text | NOT NULL | 类型枚举：purchase=买入 / traffic=投流 |
| `amount_cents` | integer | NOT NULL | 金额（单位：分） |
| `spent_at` | integer | NOT NULL | 业务日期：支出日期（epoch ms） |
| `note` | text | 可空 | 备注 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
| `deleted_at` | integer | 可空 | 软删时间（epoch ms），非空即已删除；禁止硬删 |

### `accounts` — 小红书账号（矩阵资产）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `name` | text | NOT NULL | 账号名 |
| `category` | text | NOT NULL | 赛道（自由文本维度，如 美妆/穿搭） |
| `status` | text | NOT NULL，默认 'warming' | 状态枚举：warming=起号中 / active=正常接单 / sealed=已封死 |
| `purchased_at` | integer | 可空 | 买入日期（epoch ms） |
| `owner_id` | integer | 可空，→ users.id | 负责人 → users.id |
| `note` | text | 可空 | 备注 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
| `deleted_at` | integer | 可空 | 软删时间（epoch ms），非空即已删除；禁止硬删 |

### `ad_orders` — 广告订单（收入事实表）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `account_id` | integer | NOT NULL，→ accounts.id | 接单账号 → accounts.id |
| `customer_id` | integer | NOT NULL，→ customers.id | 客户 → customers.id |
| `brand` | text | 可空 | 品牌名 |
| `product` | text | 可空 | 产品名 |
| `brief` | text | 可空 | 需求简述 |
| `amount_cents` | integer | NOT NULL | 订单金额（单位：分） |
| `channel` | text | NOT NULL | 渠道枚举：private=私单 / platform=蒲公英 |
| `published_at` | integer | NOT NULL | 业务日期：发布日期（epoch ms），收入按它归集 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
| `updated_by` | integer | 可空，→ users.id | 最近修改人 → users.id（写 SQL 须手动补） |
| `deleted_at` | integer | 可空 | 软删时间（epoch ms），非空即已删除；禁止硬删 |

### `audit_log` — 审计日志（追加式，禁改禁删）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `user_id` | integer | 可空，→ users.id | 操作人 → users.id |
| `action` | text | NOT NULL | 动作（如 order.create / agent.sql.write） |
| `target_type` | text | 可空 | 目标类型 |
| `target_id` | text | 可空 | 目标 ID |
| `detail` | text | 可空 | 细节 JSON |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |

### `customers` — 客户（广告主）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `name` | text | NOT NULL | 客户名 |
| `type` | text | NOT NULL | 类型枚举：brand=品牌直客 / agency=媒介 / platform=蒲公英平台 |
| `wechat` | text | 可空 | 微信号 |
| `note` | text | 可空 | 备注 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
| `deleted_at` | integer | 可空 | 软删时间（epoch ms），非空即已删除；禁止硬删 |

### `operating_expenses` — 运营费用（公司级，不归属账号）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `category` | text | NOT NULL | 类别枚举：salary=工资 / office=办公 / other=其他 |
| `amount_cents` | integer | NOT NULL | 金额（单位：分） |
| `spent_at` | integer | NOT NULL | 业务日期：支出日期（epoch ms） |
| `note` | text | 可空 | 备注 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
| `deleted_at` | integer | 可空 | 软删时间（epoch ms），非空即已删除；禁止硬删 |

### `pat_tokens` — Agent 访问令牌（PAT）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `user_id` | integer | NOT NULL，→ users.id | 所属用户 → users.id |
| `token_hash` | text | NOT NULL | ⚠ 凭据列，SQL 端点黑名单禁止查询 |
| `prefix` | text | NOT NULL | 令牌前缀（展示与吊销定位用） |
| `scope` | text | NOT NULL | 权限枚举：read=只读 / write=读写 |
| `expires_at` | integer | NOT NULL | 过期时间（epoch ms），签发后 90 天 |
| `revoked_at` | integer | 可空 | 吊销时间（epoch ms），吊销不删行 |
| `revoked_by` | integer | 可空，→ users.id | 吊销操作人 → users.id |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |

### `sessions` — 登录会话（SQL 端点黑名单表，禁止查询）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | text | PK，NOT NULL | 会话 ID（签名 cookie 值） |
| `user_id` | integer | NOT NULL，→ users.id | 所属用户 → users.id |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `expires_at` | integer | NOT NULL | 过期时间（epoch ms） |

### `settings` — 系统设置（键值）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `key` | text | PK，NOT NULL | 键（idle_threshold_days / repurchase_threshold_days / session_secret） |
| `value` | text | NOT NULL | 值（文本） |

### `users` — 系统用户（登录与审计主体）

| 列 | 类型 | 约束 | 含义 |
|---|---|---|---|
| `id` | integer | PK 自增，NOT NULL | 主键 |
| `username` | text | NOT NULL | 登录名（唯一） |
| `password_hash` | text | NOT NULL | ⚠ 凭据列，SQL 端点黑名单禁止查询 |
| `display_name` | text | NOT NULL | 显示名 |
| `role` | text | NOT NULL | 角色枚举：admin=管理员 / member=成员 |
| `disabled_at` | integer | 可空 | 禁用时间（epoch ms），非空即禁用 |
| `created_at` | integer | NOT NULL | 记录创建时间（epoch ms） |
| `updated_at` | integer | NOT NULL | 最近修改时间（epoch ms），写 SQL 须手动补 |
<!-- SCHEMA:END -->

## 枚举中文含义

### `accounts.status` — 账号状态
| 值 | 中文含义 |
|---|---|
| `warming` | 起号中 |
| `active` | 正常接单 |
| `sealed` | 已封死 |

### `customers.type` — 客户类型
| 值 | 中文含义 |
|---|---|
| `brand` | 品牌直客 |
| `agency` | 媒介 |
| `platform` | 蒲公英平台 |

### `ad_orders.channel` — 订单渠道
| 值 | 中文含义 |
|---|---|
| `private` | 私单 |
| `platform` | 蒲公英 |

### `account_investments.type` — 投入类型
| 值 | 中文含义 |
|---|---|
| `purchase` | 买入 |
| `traffic` | 投流 |

### `operating_expenses.category` — 费用类别
| 值 | 中文含义 |
|---|---|
| `salary` | 工资 |
| `office` | 办公 |
| `other` | 其他 |

### `users.role` — 角色
| 值 | 中文含义 |
|---|---|
| `admin` | 管理员 |
| `member` | 成员 |

### `pat_tokens.scope` — 令牌权限
| 值 | 中文含义 |
|---|---|
| `read` | 只读 |
| `write` | 读写 |

## 授权与更新

- 没有凭证或令牌过期：重跑安装器 `curl -fsSL <baseUrl>/agent/skill/xhs-matrix/install.sh | sh`，或单独跑 `login.sh` 重新授权（用户名/密码只走终端交互，不要让用户在对话里发密码）。
- 更新 skill = 重跑同一条安装命令（服务器现取最新版，版本号以本文件 front-matter 的 `version` 为准）。
