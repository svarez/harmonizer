# Deploy en Render

Esta app debe publicarse como un Web Service de Node, no como Static Site, porque usa API Express, SQLite y archivos subidos.

## 1. Sube el repo a GitHub

```bash
git add .
git commit -m "Prepare Render deploy"
git remote add origin https://github.com/tu-usuario/harmonizer.git
git push -u origin main
```

## 2. Crea el servicio en Render

En Render:

1. New > Web Service.
2. Conecta el repositorio.
3. Runtime: Node.
4. Branch: `main`.
5. Build Command:

```bash
npm ci --include=dev --include=optional && npm run db:generate && npm run build:web && npm run build:api
```

6. Start Command:

```bash
npm run start:prod -w apps/api
```

## 3. Variables de entorno

Configura estas variables:

```bash
NODE_ENV=production
NPM_CONFIG_PRODUCTION=false
DATABASE_URL=file:/var/data/harmonizer.db
STORAGE_ROOT=/var/data/storage
```

`CORS_ORIGIN` no hace falta si frontend y API van en el mismo dominio de Render.

## 4. Disco persistente

Añade un Persistent Disk al servicio:

- Mount path: `/var/data`
- Size: el mínimo que te deje Render para empezar

Render usa filesystem efímero fuera del disco persistente, así que la base SQLite y los archivos subidos deben vivir dentro de `/var/data`.

## 5. Comprueba que funciona

Cuando Render termine el deploy, abre:

```text
https://tu-servicio.onrender.com/api/health
```

Deberías ver:

```json
{"status":"ok","service":"harmonizer-api"}
```

Luego abre:

```text
https://tu-servicio.onrender.com
```
