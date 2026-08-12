# MRTI

Portal principal para acceder a las aplicaciones internas de MRTI. La portada
también funciona como dashboard personal: muestra información laboral, saldos
y solicitudes propias sin abrir el módulo administrativo de Recursos Humanos.

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

- **MRTI-Obs:** `/mrti-obs/` (`/mrti-infra/` redirige durante compatibilidad)
- **MRTI Tickets:** `/tickets/`
- **MRTI Activos:** `/activos/`
- **MRTI RH:** `/rh/`
- **MRTI Agent Core:** redirección al puerto `8477`

MRTI concentra el inicio y cierre de sesión. MRTI-Obs y MRTI Tickets
comparten el token por estar publicados bajo el mismo origen; si se abre un
módulo sin sesión, éste redirige a MRTI y conserva la ruta de retorno.

La configuración conjunta para este servidor está en
`deploy/nginx.conf.example`. El activador conserva un respaldo y restaura la
configuración anterior automáticamente si Nginx no la acepta:

```bash
sudo ./deploy/activate.sh
```
