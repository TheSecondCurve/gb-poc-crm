#!/bin/sh
# xhs-matrix 客户端：封装 /api/v1/agent/sql 与 /api/v1/agent/metrics[/query]。
# 用法：
#   xhs-matrix.sh sql [--write] '<SQL>' [params-json]
#   xhs-matrix.sh metrics
#   xhs-matrix.sh metrics-query <metric> [params-json]
# 凭证：~/.xhs-matrix/credentials.json（login.sh 签发）。XHS_BASE_URL 可覆盖 baseUrl。
# 安全约定：set -e 不用 set -u；绕过 http_proxy；自定义 User-Agent；TLS 默认校验，X_INSECURE=1 逃生门。
set -e

CRED_FILE="${XHS_CRED_DIR:-$HOME/.xhs-matrix}/credentials.json"
UA="xhs-matrix-client/0.1.0"

if [ ! -f "$CRED_FILE" ]; then
  echo "缺少凭证 ${CRED_FILE}：请先运行 login.sh（或重跑 install.sh）完成授权。" >&2
  exit 1
fi
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$CRED_FILE" | head -n 1)
CRED_BASE=$(sed -n 's/.*"baseUrl":"\([^"]*\)".*/\1/p' "$CRED_FILE" | head -n 1)
BASE_URL="${XHS_BASE_URL:-$CRED_BASE}"
if [ -z "$TOKEN" ] || [ -z "$BASE_URL" ]; then
  echo "凭证文件损坏（缺 token/baseUrl）：请重跑 login.sh。" >&2
  exit 1
fi

INSECURE_OPT=""
if [ "$X_INSECURE" = "1" ]; then
  echo "警告：X_INSECURE=1 已跳过 TLS 证书校验，仅限自签证书内网应急。" >&2
  INSECURE_OPT="-k"
fi

req() {
  # req <METHOD> <PATH> [BODY]
  if [ -n "${3:-}" ]; then
    curl --noproxy '*' -sS $INSECURE_OPT -H "User-Agent: $UA" -H "Authorization: Bearer $TOKEN" \
      -X "$1" "$BASE_URL$2" -H 'Content-Type: application/json' -d "$3"
  else
    curl --noproxy '*' -sS $INSECURE_OPT -H "User-Agent: $UA" -H "Authorization: Bearer $TOKEN" \
      -X "$1" "$BASE_URL$2"
  fi
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

CMD="${1:-}"
case "$CMD" in
  sql)
    if [ "${2:-}" = "--write" ]; then SQL="${3:-}"; PARAMS="${4:-[]}"; else SQL="${2:-}"; PARAMS="${3:-[]}"; fi
    if [ -z "$SQL" ]; then
      echo "用法：xhs-matrix.sh sql [--write] '<SQL>' [params-json]" >&2
      exit 1
    fi
    req POST /api/v1/agent/sql "$(printf '{"sql":"%s","params":%s}' "$(json_escape "$SQL")" "$PARAMS")"
    ;;
  metrics)
    req GET /api/v1/agent/metrics
    ;;
  metrics-query)
    METRIC="${2:-}"
    PARAMS="${3:-{\}}"
    if [ -z "$METRIC" ]; then
      echo "用法：xhs-matrix.sh metrics-query <metric> [params-json]" >&2
      exit 1
    fi
    req POST /api/v1/agent/metrics/query "$(printf '{"metric":"%s","params":%s}' "$(json_escape "$METRIC")" "$PARAMS")"
    ;;
  *)
    echo "用法：xhs-matrix.sh <sql [--write] '<SQL>' [params] | metrics | metrics-query <metric> [params]>" >&2
    exit 1
    ;;
esac
printf '\n'
