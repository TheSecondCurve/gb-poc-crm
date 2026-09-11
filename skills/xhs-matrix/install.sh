#!/bin/sh
# xhs-matrix skill 安装器：下载 SKILL.md + 客户端脚本到项目级/用户级/codex/claude 目录，然后引导授权。
# 更新 = 重跑同一条命令（curl -fsSL <baseUrl>/agent/skill/xhs-matrix/install.sh | sh），服务器现取最新版。
# 授权与安装分离：本机已有凭证默认跳过授权；X_SKIP_LOGIN=1 只装文件；X_FORCE_LOGIN=1 强制重签。
# 安全约定：set -e 不用 set -u；绕过 http_proxy；自定义 User-Agent；TLS 默认校验，X_INSECURE=1 逃生门。
# 本文件由服务端渲染下发，{{BASE_URL}} 会被替换为实际地址。
set -e

if [ -z "$XHS_BASE_URL" ]; then BASE_URL="{{BASE_URL}}"; else BASE_URL="$XHS_BASE_URL"; fi
UA="xhs-matrix-install/0.1.0"
CRED_FILE="${XHS_CRED_DIR:-$HOME/.xhs-matrix}/credentials.json"

INSECURE_OPT=""
if [ "$X_INSECURE" = "1" ]; then
  echo "警告：X_INSECURE=1 已跳过 TLS 证书校验，仅限自签证书内网应急。" >&2
  INSECURE_OPT="-k"
fi

# 目标目录：当前项目级 + 用户级 + codex/claude 全局（一次安装跨 Agent 复用）
DESTS="./.agents/skills/xhs-matrix $HOME/.agents/skills/xhs-matrix $HOME/.codex/skills/xhs-matrix $HOME/.claude/skills/xhs-matrix"
FILES="SKILL.md xhs-matrix.sh login.sh login.ps1 install.ps1"

for dest in $DESTS; do
  mkdir -p "$dest"
  for f in $FILES; do
    case "$f" in
      SKILL.md|install.ps1) src="$BASE_URL/agent/skill/xhs-matrix/$f" ;;
      login.sh|login.ps1)   src="$BASE_URL/agent/$f" ;;
      *)                    src="$BASE_URL/agent/skill/xhs-matrix/files/$f" ;;
    esac
    curl --noproxy '*' -fsSL $INSECURE_OPT -H "User-Agent: $UA" "$src" -o "$dest/$f"
  done
  chmod +x "$dest/xhs-matrix.sh" "$dest/login.sh"
  echo "已安装到 $dest"
done

# 授权：已有凭证默认跳过；X_SKIP_LOGIN=1 只装文件；X_FORCE_LOGIN=1 强制重签
if [ "$X_SKIP_LOGIN" = "1" ]; then
  echo "X_SKIP_LOGIN=1：跳过授权（仅安装文件）。"
  exit 0
fi
if [ -f "$CRED_FILE" ] && [ "$X_FORCE_LOGIN" != "1" ]; then
  echo "本机已有凭证（${CRED_FILE}），跳过授权。强制重签请设 X_FORCE_LOGIN=1。"
  exit 0
fi

echo "开始授权（用户名/密码仅在终端输入，不经过 Agent 对话）..."
XHS_BASE_URL="$BASE_URL" sh "$HOME/.agents/skills/xhs-matrix/login.sh"
