# 多阶段构建：前端 vite build → 生产依赖 → 运行时（非 root）
# better-sqlite3 / argon2 在部分 Node patch 版本无预编译二进制，npm ci 需源码编译，
# 故每个跑 npm ci 的阶段都要装构建工具链；运行时阶段拷贝编好的 .node，无需工具链。

# ---- 阶段 1：前端构建 ----
FROM node:20-slim AS webbuild
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- 阶段 2：生产依赖 ----
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- 阶段 3：运行时 ----
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r app && useradd -r -g app -d /app app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY skills ./skills
COPY scripts/backup.sh ./scripts/backup.sh
COPY --from=webbuild /app/dist ./dist

# SQLite 库文件与备份目录（named volume 挂载点），非 root 可写
RUN mkdir -p /data/backups && chown -R app:app /data
USER app

EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/data/app.db
# 迁移随启动自动执行（server/app.js → migrate(db)）
CMD ["node", "server/index.js"]
