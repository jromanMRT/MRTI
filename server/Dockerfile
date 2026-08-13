# MRTI Core API — imagen de producción (Fase de contenerización, ver
# MRTI/docs/architecture/CORE_INFRA_MIGRATION_GUIDE.md). Alcance de esta
# imagen: únicamente el proceso mrti-core-api (identidad/autenticación).
# No incluye build de frontend ni de otros módulos.

# ---- Stage 1: dependencias reproducibles -----------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Usuario no-root dedicado (node:20-alpine ya trae "node", pero se define
# explícito por claridad y para no depender de que la imagen base lo conserve).
RUN addgroup -S mrticore && adduser -S mrticore -G mrticore

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Solo lo necesario para ejecutar: sin test/, docs/, scripts/ de migración
# (esos corren fuera del contenedor, contra la base compartida), sin .env
# ni logs (excluidos también vía .dockerignore).

USER mrticore

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3005)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Forma exec (sin shell) para que Node reciba señales directamente como PID 1.
CMD ["node", "src/index.js"]
