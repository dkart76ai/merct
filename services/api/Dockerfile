FROM node:20-slim

WORKDIR /app

# Copy and install api dependencies first (layer caching)
COPY services/api/package.json .
RUN npm install --production

# Copy api source
COPY services/api/ ./

# Copy shared module into a local ./shared/ directory
COPY services/shared/ ./shared/
RUN cd shared && npm install --production

EXPOSE 3000
CMD ["node", "index.js"]
