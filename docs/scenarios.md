# P0 场景测试追踪清单

> 来源：docs/prd.md §4.2。规则见 engineering-standards.md §1：**P0 场景 100% 有对应测试**是验收硬指标；CI 用 `npm run check:scenarios` 比对本清单场景编号是否都出现在测试里，缺失即红。每条验收标准 = 一个测试用例，测试名带场景编号。

## S1（P0）账号建档与买入登记

| 验收标准 | 对应测试 |
|---|---|
| 当录入一个新账号并保存时，应同时产生该账号记录和一条金额等于买入成本的「买入」投入记录 | `S1: 录入新账号时同事务产生该账号记录和一条金额等于买入成本的「买入」投入记录`（server/routes/accounts.test.mjs）；前端联动 `S1 建账号自动买入提示`（src/pages/AccountsPage.test.tsx） |
| 当账号新建未接任何广告单时，其状态应为「起号中」 | `S1: 账号新建未接任何广告单时状态为「起号中」（warming）`（server/routes/accounts.test.mjs） |
| 当赛道品类为空提交时，应被拒绝并提示必填 | `S1: 赛道品类为空提交时被拒绝并提示必填`（server/routes/accounts.test.mjs） |

## S2（P0）投流记账

| 验收标准 | 对应测试 |
|---|---|
| 当登记一笔投流记录时，该账号累计投入应立即包含该笔金额 | `S2: 登记一笔投流记录时，该账号累计投入应立即包含该笔金额`（server/routes/investments.test.mjs） |
| 当查询某月投流总额时，应等于该月全部投流记录金额之和 | `S2: 某月投流总额等于该月全部投流记录金额之和`（server/engine/metrics.test.mjs） |

## S3（P0）广告单登记

| 验收标准 | 对应测试 |
|---|---|
| 当登记一条广告订单时，该账号累计收入、该客户累计合作金额、当月总收入应立即各增加订单金额 | `S3: 登记广告订单后，该账号累计收入与该客户累计合作金额立即各增加订单金额`（server/routes/orders.test.mjs）；`S3: 当月总收入按发布日期归集，登记后立即计入`（server/engine/metrics.test.mjs） |
| 当登记订单时选择了一个尚不存在的客户，应能在同一流程中新建客户并完成订单登记 | `S3: 登记订单时选择尚不存在的客户，可在同一流程中新建客户并完成登记`（server/routes/orders.test.mjs） |
| 当订单缺少账号、客户或金额时，应被拒绝并提示必填 | `S3: 订单缺少账号、客户或金额时被拒绝并提示必填`（server/routes/orders.test.mjs） |

## S4（P0）经营看板（interactive dashboard）

| 验收标准 | 对应测试 |
|---|---|
| 当存在广告订单与投入记录时，账号盈亏榜应显示每个账号的累计投入、累计收入、净盈亏，且某账号净盈亏 = 累计收入 −（买入成本 + 累计投流） | `S4: 每个账号显示累计投入/累计收入/净盈亏，净盈亏 = 累计收入 −（买入 + 累计投流）`（server/engine/metrics.test.mjs） |
| 当某账号超过 30 天（阈值可调）没有新广告订单时，应出现在闲置预警清单中 | `S4: 超过阈值（默认 30 天）没有新广告订单的账号出现在预警清单；阈值可调`（server/engine/metrics.test.mjs） |
| 当按赛道筛选时，看板所有指标应只统计该赛道账号的数据 | `S4: 按赛道筛选时只统计该赛道账号的数据`（server/engine/metrics.test.mjs）；前端联动 `S4 看板筛选联动`（src/pages/DashboardPage.test.tsx） |
| dashboard 数字与 `/api/v1/agent/metrics/query` 端点数字一致（analytics-design.md §与既有标准的关系） | `S4: dashboard 数字与 /api/v1/agent/metrics/query 完全一致（同一份指标定义层代码）`（server/engine/metrics.test.mjs） |

## S5（P0）客户管理底座

| 验收标准 | 对应测试 |
|---|---|
| 当打开某客户详情时，应列出该客户全部历史广告订单及累计金额，且累计金额等于其订单金额之和 | `S5: 客户详情列出全部历史订单，累计金额等于订单金额之和，含最近合作日期`（server/routes/customers.test.mjs） |
| 当历史数据迁移完成后，Excel 中的每条合作记录应能在对应客户详情中找到（迁移后人工核对，无自动化测试） | 人工核对 |

---

> P1/P2 场景（S6~S9）按需补测试，不在 CI 追踪门禁内；本期仍需交付（决策日志 K1）。
