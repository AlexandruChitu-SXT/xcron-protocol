FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Config volume — mount your keeper-config.json and PEM here
VOLUME /app/config

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "console.log('ok')" || exit 1

# Default: run with testnet config
ENV KEEPER_CONFIG=/app/config/keeper-config.json

CMD ["node", "dist/index.js"]
