FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# Runs as the unprivileged "node" user; the database lives on the /data volume.
RUN mkdir -p /data && chown node:node /data
USER node
ENV DB_PATH=/data/pacebook.db PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "src/index.js"]
