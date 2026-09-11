# Agent 一键接入（install.sh）使用文档

> 面向：系统使用者和在本机跑 AI Agent（Kimi Code / Codex / Claude 等）的人。
> 机制细节与安全设计见 `docs/standards/agent-integration.md`（形态 B）。

## 这是什么

系统内置了 Agent 接入能力。在你自己电脑上跑**一条命令**，本机的 AI Agent 就获得查询和维护系统数据的能力（查账号/客户/订单、记账、补录历史数据、取经营指标），不需要开发任何导入工具或专用接口。

## 一条命令安装

```bash
curl -fsSL http://<系统地址>/agent/skill/xhs-matrix/install.sh | sh
```

`<系统地址>` 换成实际部署地址（如 `http://192.168.1.10:3000`）。Windows 用 PowerShell 版：

```powershell
irm http://<系统地址>/agent/skill/xhs-matrix/install.ps1 | iex
```

## 它做了什么

1. **下载 skill 文件**到四个位置（一次安装，多个 Agent 工具都能用）：
   - 当前项目 `./.agents/skills/xhs-matrix/`
   - 用户级 `~/.agents/skills/xhs-matrix/`
   - `~/.codex/skills/xhs-matrix/`、`~/.claude/skills/xhs-matrix/`
2. **引导授权**：在终端里输入系统的用户名/密码（按键不回显，**绝不经过 Agent 对话**），换得一个 PAT 令牌。
3. **写本机凭证**到 `~/.xhs-matrix/credentials.json`（目录权限 700、文件 600，原子写入）。

装完后 Agent 通过客户端脚本 `xhs-matrix.sh` 调系统：明细查询/写数据走 SQL 端点，经营指标走 metrics 端点（口径与系统看板一致）。

## 常用环境变量

| 变量 | 作用 |
|---|---|
| `XHS_BASE_URL` | 覆盖系统地址（默认用安装时注入的地址） |
| `X_SKIP_LOGIN=1` | 只装/更新文件，跳过授权（CI 场景） |
| `X_FORCE_LOGIN=1` | 已有凭证也强制重新授权换令牌 |
| `X_INSECURE=1` | 跳过 TLS 证书校验——**仅限自签证书内网应急**，会让令牌暴露给中间人，平时不要设 |

非交互环境（CI）可用 `XHS_USERNAME` / `XHS_PASSWORD` 代替终端输入。

## 更新

**重跑同一条命令就是更新**。安装器和 skill 文件每次都从服务器现取最新版并覆盖，服务器单方面决定最新态；本机已有凭证时自动跳过授权。系统升级不需要你做任何事。

## 令牌管理

- 令牌默认 **90 天过期**，过期后重跑安装命令（或 `X_FORCE_LOGIN=1`）重签即可。
- 自助管理：登录系统 → 设置 → 令牌管理，可查看/吊销自己的令牌；管理员可吊销任意令牌。
- 员工账号被禁用时，其名下所有令牌自动失效。

## 安全说明

- skill 文件与脚本**零密钥**，凭证只存在于你自己电脑上；令牌在服务端只存哈希，丢库不丢令牌原文。
- 令牌分 `read` / `write` 两档权限；DDL（建表/删表）任何令牌都禁止。
- 令牌调用的所有写操作会进系统审计日志（谁、何时、做了什么）。

## 故障排查

| 现象 | 处理 |
|---|---|
| `curl` 卡住不动 | 检查是否设了 http_proxy；脚本已显式绕过，手敲 curl 时加 `--noproxy '*'` |
| 401 | 令牌过期或被吊销，重跑安装命令重签 |
| 403 | 权限不够（read 令牌执行了写操作 / 触发了 DDL / 查询涉及凭据表），按需换 write 令牌；**不要改 SQL 绕** |
| 公司网络拦 TLS | 仅在确认是自签证书的内网环境下临时用 `X_INSECURE=1` |

## 卸载

删除四个安装目录下的 `xhs-matrix/` 文件夹和 `~/.xhs-matrix/credentials.json`，再到系统设置页吊销对应令牌。
