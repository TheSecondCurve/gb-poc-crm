# AGENTS.md — 小红书账号矩阵经营管理系统

> 读者首先是编码 Agent。标准与决策见 `docs/standards/*.md`（本项目实例，文末为「本项目决策」）、需求见 `docs/prd.md`、决策日志见 `docs/design.md`（K 编号）、P0 场景测试追踪见 `docs/scenarios.md`。

## 1. 工程结构与分层

```
src/                # 前端：main.tsx / App.tsx / store.tsx / api.ts / i18n.ts / types.ts
├── components/     # 极简组件层（ui.tsx 等）+ 业务组件
└── pages/          # 一页面一文件，测试同目录（*.test.tsx）
server/             # 后端 Fastify：index 入口 / routes 路由 / engine 业务引擎 / db / migrations
│                   # /agent/* 公开端点 + /api/v1/agent/sql + metrics 端点也在此（标配）
│                   # 测试与源码同目录（*.test.mjs / *.test.ts）
skills/xhs-matrix/  # Agent skill 包源：SKILL.md + 客户端脚本（必须随部署分发，Dockerfile 含 COPY skills ./skills）
docs/               # prd.md / scenarios.md / design.md / standards/
```

分层规则：routes 只做鉴权/参数解析/响应，业务逻辑在 engine，数据访问在 db；**禁止跨层**（routes 不直接写 SQL 业务口径，指标口径只在指标定义层一份实现）。dashboard 与 `/api/v1/agent/metrics[/query]` 必须调用同一份指标定义层代码。

## 2. 常用命令（照抄可跑）

```bash
npm run dev          # 前后端开发（Vite 代理 /api 到 Fastify）
npm run lint
npm run typecheck
npm run test         # Vitest：每个测试一个临时 SQLite 库，handler 直调
npm run test:coverage
npm run migrate      # Drizzle 迁移；生产随容器启动自动执行
npm run check:scenarios   # 需求追踪检查：PRD P0 场景编号是否都出现在测试里
npm run check:drift       # SKILL.md schema 区块与 migration 漂移检查
docker compose up -d      # 部署（单容器，SQLite 在 /data named volume）
```

## 3. TDD 契约与需求追踪（engineering-standards §1、§2 生效）

- 需求层级：业务线 → 场景 S{n}（docs/prd.md §4.2，编号永不复用）→ 验收标准（每条 = 一个测试用例）。测试名带场景编号，如 `S3: 登记广告单同步更新账号与客户累计`。
- **先写失败测试再写实现**：编码 Agent 必须先运行新测试确认红（失败输出留在会话里），再写实现；**禁止为凑绿修改既有测试断言**——认为旧测试错了就停下来报告。
- 需求变更顺序固定：**先改 PRD → 再改测试（红）→ 再改实现（绿）**。
- P0 场景（S1~S5）100% 有对应测试是验收硬指标；`check:scenarios` 缺失即红。
- 覆盖率门禁：v8 聚合 ≥80%（唯一数字门槛）；另过 engineering-standards §4 必测清单（权限矩阵、认证边界、迁移幂等、备份恢复冒烟、SQL 端点对抗用例、枚举/镜像 drift check）。

## 4. 编码约定

- JSON 字段 camelCase；时间用 epoch 毫秒（事实表双时间戳：`created_at` + 业务日期）；**金额一律分**，独立成列。
- 删除 = 软删（`deleted_at`），不硬删；状态用枚举不用布尔/自由文本。
- 维度用外键引用，禁止把维度信息塞进 JSON 字段或备注文本。
- SQLite：连接层 PRAGMA `WAL` / `busy_timeout=5000` / `foreign_keys=ON`（不写进 migration）；备份只用 `.backup`，禁止 cp 热库；库文件 chmod 600，放 /data。
- 认证：服务端 session + 签名 httpOnly cookie（HMAC），密码 argon2id；Agent 访问走独立 PAT（hash 存储、read/write scope、90 天过期）。
- SQL 端点安全：`stmt.readonly === true` 且 SELECT/WITH/VALUES 开头才算读；鉴权在 prepare 之前；DDL 一律 403；单语句；读上限 1000 行；凭据列/sessions 表黑名单 403。
- 前端：手写极简组件层 + Tailwind v4，hash 路由，Context 单 store，YNAB 式交互规范（就地编辑、破坏性操作 Modal 确认、Toast 反馈、等宽数字）——细则见 docs/standards/tech-architecture.md。

## 5. 明确不要做（负面清单）

- **不做 JWT**（浏览器走 session cookie，Agent 走 PAT）
- **不做数据导入 UI/向导**——历史迁移与补录走 `/api/v1/agent/sql`（PRD §7）
- **不接小红书/蒲公英平台 API**，不做粉丝数等数据自动抓取——全部人工录入（PRD §8）
- **不做发票管理、财务软件对接**（PRD §8）
- **不做员工提成计算**（当前固定月薪，PRD §1）
- 不上 Redis / worker pool / 微服务；不引 react-router / redux / zustand / react-query / 前端组件库
- 不做原生 App（响应式 Web）
- 不做同比/环比/目标达成率等衍生指标；不做每日快照（实时计算）
- 不启用形态 A（系统内置 AI 助手）
- 指标口径以 metrics 端点为准，**禁止**在页面组件、route handler、SKILL.md 里各自手写指标 SQL
- 决策偏离标准时，必须先在 docs/design.md 追加 K 编号记录，再改代码
