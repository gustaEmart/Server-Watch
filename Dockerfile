FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache iputils

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY routes ./routes
COPY services ./services
COPY storage ./storage
COPY ws ./ws
COPY scripts ./scripts
COPY probe ./probe
COPY tools/probe/install-linux.sh ./tools/probe/install-linux.sh

RUN mkdir -p /app/data /app/downloads && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
