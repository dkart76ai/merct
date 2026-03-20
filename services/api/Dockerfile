FROM node:20-slim
WORKDIR /app
COPY services/api/package.json .
RUN npm install
COPY services/api/ .
COPY services/shared/ ../shared/
RUN ln -s /app/node_modules /shared/node_modules
EXPOSE 3000
CMD ["node", "index.js"]
