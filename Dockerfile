# kulapita 管理画面のコンテナイメージ
# AWS CodeBuild (ARM64) でビルドし、ECS Fargate (ARM64) で動かす。
# Docker Hub の回数制限を避けるため、同じイメージを AWS の公開レジストリ (ECR Public) から取得する。
FROM public.ecr.aws/docker/library/node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
