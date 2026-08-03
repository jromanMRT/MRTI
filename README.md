# MRTI Core

Portal principal para acceder a las aplicaciones internas de MRTI.

## Desarrollo

```bash
npm install
npm run dev
```

## Producción

```bash
npm ci
npm run build
```

Nginx sirve `dist/` en la raíz `/` y centraliza los módulos:

- **IT Management:** `/it-management/`
- **MRTI Tickets:** `/tickets/`
- **MRTI Agent Core:** redirección al puerto `8477`

El Core concentra el inicio y cierre de sesión. IT Management y MRTI Tickets
comparten el token por estar publicados bajo el mismo origen; si se abre un
módulo sin sesión, éste redirige al Core y conserva la ruta de retorno.

La configuración conjunta para este servidor está en
`deploy/nginx.conf.example`. El activador conserva un respaldo y restaura la
configuración anterior automáticamente si Nginx no la acepta:

```bash
sudo ./deploy/activate.sh
```
