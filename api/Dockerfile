# Stage 1: Build dashboard
FROM node:22-slim AS dashboard-builder
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json* ./
RUN npm install
COPY dashboard/ .
RUN npm run build

# Stage 2: Build and run API
FROM node:22-slim
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm install
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build
COPY --from=dashboard-builder /dashboard/dist ../dashboard/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
