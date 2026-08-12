# Evolución de MRTI Core a portal empresarial

Fecha base: 2026-08-12
Estado: implementación incremental — Etapas 1 y 2 publicadas

## 1. Diagnóstico de la arquitectura actual

MRTI Core ya es propietario de identidad, sesiones, perfiles, roles base,
áreas de acceso y permisos de módulos. Su frontend compone información personal
mediante APIs de RH, Activos y Solicitudes. MRTI-Obs conserva topología y
observabilidad. Esta separación es correcta y debe mantenerse.

Componentes reutilizables:

- autenticación central y contrato `/api/auth/*`;
- filtro de aplicaciones mediante `allowed_modules`;
- autoservicio de RH, Activos y Solicitudes;
- degradación independiente de widgets;
- notificaciones derivadas actuales;
- Centro de control y administración de áreas de acceso.

Limitaciones actuales:

- frontend monolítico en `src/main.js`;
- catálogo de aplicaciones duplicado en constantes de frontend/backend;
- no existen comunicados, notificaciones persistentes, búsqueda global,
  directorio de autoservicio ni aprobaciones consolidadas;
- los roles existentes son globales y todavía no forman un RBAC granular;
- la sesión usa almacenamiento local y JWT compartido durante la migración;
- no existe recuperación autónoma de contraseña ni SSO corporativo.

## 2. Arquitectura objetivo

```text
MRTI Core
├── Identidad y sesiones
├── Usuarios, roles y permisos
├── Catálogo de aplicaciones
├── Composición de Home y widgets
├── Comunicados
├── Notificaciones globales
├── Búsqueda y directorio autorizado
├── Auditoría
└── Integraciones HTTP versionadas
    ├── Solicitudes
    ├── RH
    ├── Activos
    ├── Compras / Pagos (futuro)
    └── MRTI-Obs
```

Core no será propietario del inventario, expedientes laborales, observabilidad,
compras ni workflows de solicitudes. Sólo conserva configuración, referencias
estables y respuestas compuestas autorizadas.

## 3. Cambios de datos propuestos

Cada grupo requiere una migración aditiva, idempotente y reversible:

1. `applications` y `application_permissions`: sustituir gradualmente el
   catálogo hardcodeado, conservando códigos actuales.
2. `roles`, `permissions`, `user_roles`, `role_permissions`: ampliar el modelo
   sin eliminar inicialmente `user_profiles.role` ni `access_area_modules`.
3. `announcements` y tablas de audiencia: comunicados por empresa, departamento,
   puesto, sitio o usuario, con vigencia e historial.
4. `notifications` y preferencias: estado leído, destino y referencia externa.
5. `audit_events`: actor, acción, entidad, IP y metadata sin secretos.
6. Configuración de widgets del Home por rol, departamento y usuario.

No se crearán llaves foráneas hacia bases de otros módulos.

## 4. Endpoints propuestos

- `GET /api/portal/v1/home`: composición y configuración visible del Home.
- `GET /api/portal/v1/applications`: catálogo filtrado por permisos.
- `GET /api/portal/v1/announcements`: publicaciones vigentes para el usuario.
- `GET/PATCH /api/portal/v1/notifications`: bandeja y estado leído.
- `GET /api/portal/v1/search?q=`: búsqueda federada con límites por fuente.
- `GET /api/portal/v1/directory`: directorio corporativo autorizado.
- `GET /api/portal/v1/approvals`: resumen de APIs propietarias.
- Endpoints administrativos separados para catálogo, publicaciones y widgets.

Todos deben derivar la identidad desde la sesión en servidor y aplicar permisos
antes de consultar o devolver información.

## 5. Riesgos y compatibilidad

- No cambiar formato/secretos JWT hasta retirar consumidores antiguos.
- Mantener UUID de usuarios, códigos de módulos y rutas compatibles.
- Evitar duplicar departamentos de RH con áreas de acceso de Core o áreas físicas
  de MRTI-Obs.
- No mostrar datos sensibles en widgets globales ni antes del login.
- No construir un workflow universal en Core: Solicitudes conserva esa lógica.
- Mantener fallos aislados por integración y timeouts consistentes.
- Un catálogo dinámico debe desplegarse primero con fallback al catálogo actual.

## 6. Fases

### Etapa 1 — Experiencia de entrada y Home

- identidad visual local y reemplazable;
- login corporativo adaptable, contraseña visible/oculta y ayuda de recuperación;
- navegación orientada a tareas;
- saludo y contexto de RH/ubicación;
- resumen personal, acciones rápidas, notificaciones y aplicaciones secundarias;
- búsqueda local dentro de aplicaciones autorizadas.

### Etapa 2 — Catálogo dinámico y auditoría

- [x] migración `applications` con datos actuales;
- [x] API filtrada con fallback compatible;
- [x] administración de catálogo;
- [x] auditoría de login, permisos y cambios administrativos.

Completada el 2026-08-12 en `MRTI@3e3a9be`. La ruta pública
`/api/portal/v1/*` se dirige a Core mediante una ubicación específica de Nginx;
`/api/*` continúa perteneciendo a MRTI-Obs. La auditoría excluye campos cuyo
nombre indique contraseña, token o secreto y nunca bloquea la operación
principal si el registro falla.

### Etapa 3 — Comunicados y notificaciones persistentes

- audiencia, vigencia, prioridad e historial;
- bandeja leída/no leída y preferencias;
- administración y pruebas de aislamiento.

### Etapa 4 — Solicitudes y aprobaciones consolidadas

- renombrado gradual de la experiencia “Tickets” a “Solicitudes”;
- categorías configurables y contratos por origen;
- resúmenes de aprobación sin trasladar workflows a Core.

### Etapa 5 — Directorio, búsqueda federada y widgets configurables

- directorio mediante RH;
- búsqueda con permisos por fuente;
- configuración de Home por rol/departamento/usuario;
- preparación para una interfaz futura de “Pregúntale a MRTI”.

## 7. Inventario funcional después de la Etapa 2

| Función | Estado | Propietario / siguiente contrato |
|---|---|---|
| Login, cierre de sesión y cambio de contraseña | Funcional | Core; recuperación autónoma requiere definir correo/SSO |
| Home, RH, activos y solicitudes personales | Funcional | APIs `*-self` de cada módulo |
| Catálogo, permisos y administración de aplicaciones | Funcional y dinámico | Core `/api/portal/v1/applications` |
| Auditoría de sesión, perfiles, usuarios, áreas y aplicaciones | Funcional | Core `audit_events` |
| Comunicados y estado leído de notificaciones | Pendiente, Etapa 3 | Core, con audiencia y vigencia propias |
| Aprobaciones | Pendiente, Etapa 4 | Resumen de APIs de RH/Solicitudes; Core no decide el workflow |
| Documentos | Pendiente de módulo propietario | No almacenar expedientes o archivos sensibles en Core |
| Directorio | Pendiente, Etapa 5 | Contrato de RH limitado a datos corporativos autorizados |
| Búsqueda global | Pendiente, Etapa 5 | Federación con permiso y timeout por fuente |
| Widgets administrables | Pendiente, Etapa 5 | Configuración en Core; datos maestros permanecen fuera |

## 8. Identidad visual

`public/company-logo.svg` es un emblema interno reemplazable creado para esta
etapa porque no existe un archivo oficial en el workspace. Cuando la empresa
entregue su manual de marca, debe sustituirse conservando el mismo nombre o
actualizando una única configuración central; no debe asumirse como logotipo
legal definitivo.
