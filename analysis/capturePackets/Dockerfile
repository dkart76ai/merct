# --- Etapa 1: Build (Instalación de dependencias) ---
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS builder

WORKDIR /app

# INSTALAR HERRAMIENTAS DE COMPILACIÓN (Necesario para better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar solo archivos necesarios para instalar dependencias
COPY capturePackets/package*.json ./
COPY message-pack/message-pack-1.0.1.tgz ./message-pack-1.0.1.tgz

# Ajustar ruta y npm ci
RUN sed -i "s|file:../message-pack/message-pack-1.0.1.tgz|file:./message-pack-1.0.1.tgz|" package.json
RUN npm ci --only=production

# --- Etapa 2: Producción (Imagen final optimizada) ---
# Usamos la versión "service", que es más ligera para entornos headless
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# Instalar solo curl (limpiando caché de apt para ahorrar espacio)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar node_modules y código desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY capturePackets/ ./

# Seguridad: Usar el usuario 'pwuser' que ya existe en la imagen oficial
# Esto evita problemas de permisos con los navegadores instalados
RUN chown -R pwuser:pwuser /app
USER pwuser

# Variable de entorno para asegurar que Playwright no intente descargar navegadores
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Forzar a que los navegadores corran en modo headless si la app lo permite
ENV HEADLESS=true

EXPOSE 3000

CMD ["node", "server-v2.cjs"]
