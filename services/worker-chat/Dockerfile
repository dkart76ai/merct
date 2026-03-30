FROM node:20-slim
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/worker-chat/package.json .
RUN npm install
RUN npx playwright install chromium --with-deps
COPY services/worker-chat/ .
COPY services/shared/ ../shared/
RUN ln -s /app/node_modules /shared/node_modules
CMD ["node", "index.js"]
