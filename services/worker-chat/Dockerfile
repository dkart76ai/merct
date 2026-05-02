FROM node:20-slim

RUN apt-get update && apt-get install -y \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install worker-chat dependencies first (layer caching)
COPY services/worker-chat/package.json .
RUN npm install --production

# Install Playwright with Chromium
RUN npx playwright install chromium --with-deps

# Copy worker-chat source
COPY services/worker-chat/ ./

# Copy shared module into a local ./shared/ directory
COPY services/shared/ ./shared/
RUN cd shared && npm install --production

CMD ["node", "index.js"]
