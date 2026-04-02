FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# Install dependencies
RUN npm ci --workspace=server --workspace=web

# Copy source
COPY server/ ./server/
COPY web/ ./web/

# Build web client
RUN npm run build --workspace=web

# Build server
RUN npm run build --workspace=server

# Create data directories
RUN mkdir -p /data/vault

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
