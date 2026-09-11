#!/bin/sh
# xhs-matrix 授权脚本：用户名/密码（终端交互，静默回显）换 PAT，写 ~/.xhs-matrix/credentials.json
# 安全约定（agent-integration.md）：set -e 不用 set -u；凭证原子写入 tmp+rename，目录 700 文件 600；
# 显式绕过 http_proxy；自定义 User-Agent；TLS 默认校验，X_INSECURE=1 逃生门（仅限自签内网应急）。
# 本文件由服务端渲染下发，{{BASE_URL}} 会被替换为实际地址。
set -e

if [ -z "$XHS_BASE_URL" ]; then BASE_URL="{{BASE_URL}}"; else BASE_URL="$XHS_BASE_URL"; fi
SCOPE="${XHS_SCOPE:-write}"
CRED_DIR="${XHS_CRED_DIR:-$HOME/.xhs-matrix}"
CRED_FILE="$CRED_DIR/credentials.json"
UA="xhs-matrix-login/0.1.0"

INSECURE_OPT=""
if [ "$X_INSECURE" = "1" ]; then
  echo "警告：X_INSECURE=1 已跳过 TLS 证书校验，令牌可能被中间人窃取，仅限自签证书内网应急。" >&2
  INSECURE_OPT="-k"
fi
# 非交互（CI）走环境变量；否则 /dev/tty 交互，密码静默回显
if [ -n "$XHS_USERNAME" ] && [ -n "$XHS_PASSWORD" ]; then
  USERNAME="$XHS_USERNAME"
  PASSWORD="$XHS_PASSWORD"
else
  printf '用户名: ' > /dev/tty
  read -r USERNAME < /dev/tty
  printf '密码: ' > /dev/tty
  stty -echo < /dev/tty
  read -r PASSWORD < /dev/tty
  stty echo < /dev/tty
  printf '\n' > /dev/tty
fi

# JSON 转义（密码里可能有引号/反斜杠）
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PAYLOAD=$(printf '{"username":"%s","password":"%s","scope":"%s"}' "$(json_escape "$USERNAME")" "$(json_escape "$PASSWORD")" "$(json_escape "$SCOPE")")

RESP=$(curl --noproxy '*' -sS -f $INSECURE_OPT -H "User-Agent: $UA" -X POST "$BASE_URL/api/v1/auth/tokens" -H 'Content-Type: application/json' -d "$PAYLOAD") || {
  echo "授权失败：用户名/密码错误、账号被禁用或服务不可达（${BASE_URL}）" >&2
  exit 1
}

# 从扁平 JSON 提取字段（避免依赖 jq）
json_field() {
  printf '%s' "$RESP" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1
}
TOKEN=$(json_field token)
PREFIX=$(json_field prefix)
EXPIRES_AT=$(printf '%s' "$RESP" | sed -n 's/.*"expiresAt":\([0-9]*\).*/\1/p' | head -n 1)
if [ -z "$TOKEN" ]; then
  echo "授权失败：响应中没有 token：$RESP" >&2
  exit 1
fi

umask 077
mkdir -p "$CRED_DIR"
chmod 700 "$CRED_DIR"
TMP="$CRED_FILE.tmp.$$"
printf '{"baseUrl":"%s","token":"%s","prefix":"%s","scope":"%s","expiresAt":%s}\n' \
  "$BASE_URL" "$TOKEN" "$PREFIX" "$SCOPE" "${EXPIRES_AT:-0}" > "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$CRED_FILE"

echo "授权成功：令牌前缀 ${PREFIX}（scope=${SCOPE}，90 天过期），凭证已写入 ${CRED_FILE}"
