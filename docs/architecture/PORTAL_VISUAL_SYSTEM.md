# Sistema visual transversal de MRTI

Estado: activo  
Fecha base: 2026-08-24  
Referencia canónica: `MRTI/src/style.css`

## Objetivo

Todos los módulos deben sentirse parte del mismo portal sin ocultar su dominio.
La identidad visual, el tema y el shell de navegación son compartidos; las rutas,
permisos, datos y acciones siguen perteneciendo al módulo definido en
`CORE_INFRA_MIGRATION_GUIDE.md`.

## Tokens canónicos

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `#f6f2e7` | `#17120c` |
| Fondo secundario | `#eee3c4` | `#211a11` |
| Superficie | `#ffffff` | `#251e13` |
| Superficie secundaria | `#f1ead9` | `#2f2517` |
| Texto | `#221b12` | `#f5ecd9` |
| Texto secundario | `#6c5f47` | `#d7cab1` |
| Borde | `#e1d3ab` | `#4a3a22` |
| Acento | `#a9781f` | `#d9a63c` |
| Acento brillante | `#d9a63c` | `#f3d68d` |
| Éxito | `#2f7d43` | `#6fcf8c` |
| Información | `#3f6a86` | `#8ec2e0` |
| Error | `#a1432f` | `#e08a72` |

Los módulos con Tailwind conservan nombres utilitarios existentes (`slate`,
`sky`, `blue`, `cyan`) pero los resuelven a estos tokens mediante su
`tailwind.config.js`. Esto mantiene compatibilidad sin reescribir cada pantalla.

## Tema

- La preferencia se guarda en `localStorage` con la clave única `mrti_theme`.
- Los valores permitidos son `light` y `dark`.
- Sin preferencia guardada se usa `prefers-color-scheme` del sistema.
- El tema se aplica como `data-theme` en `<html>` y declara `color-scheme` para
  que controles nativos coincidan.
- Gráficas, tooltips, SVG y estados deben usar tokens; no deben fijar un fondo
  oscuro si la pantalla también funciona en modo claro.

## Shell de módulo

El patrón común incluye:

1. Barra lateral de `256px`, colapsable a `64px` en escritorio.
2. Marca y nombre del módulo en la parte superior.
3. Navegación con icono, texto y estado activo dorado.
4. Enlace visible de regreso al portal Core.
5. Selector de tema en el pie de la barra.
6. Drawer lateral con backdrop, cierre por navegación y tecla `Escape` en
   pantallas pequeñas.
7. Encabezado de contenido de `72px` cuando el módulo necesita búsqueda,
   contexto o controles de sesión.
8. En escritorio, la barra permanece fija y cubre todo el alto visible
   (`100dvh`, con respaldo `100vh`) aunque el documento tenga desplazamiento.
9. El contenido reserva exactamente `256px` o `64px` según el estado de la
   barra y anima también su ancho; los contenedores generales deben aprovechar
   ese espacio. Los límites de ancho se conservan sólo en formularios o fichas
   donde mejoren la lectura.

La pantalla informativa de pared de MRTI-Obs (`/news-screen`) es una excepción:
usa un shell de visualización a distancia, aunque mantiene contraste específico
en ambos temas.

## Accesibilidad y comportamiento

- Ancho mínimo soportado: `320px`.
- Todo control sólo-icono requiere `aria-label` y estado `aria-expanded` o
  `aria-pressed` cuando corresponda.
- El foco visible usa el acento de marca y no depende únicamente del color para
  indicar el elemento activo.
- Se respeta `prefers-reduced-motion`.
- Los fondos de botones primarios son dorado oscuro fijo con texto blanco, para
  conservar contraste en ambos temas.
- Los colores semánticos de disponibilidad, prioridad y error no se usan como
  color principal de marca.

## Propiedad y evolución

Core es propietario de este contrato visual. Cada repositorio mantiene una copia
local de los tokens para poder compilar y desplegar de forma independiente. Un
cambio de paleta debe expandirse módulo por módulo, verificarse y retirarse con
el mismo enfoque incremental de la guía de arquitectura; no se introduce una
dependencia de ejecución entre frontends.

## Verificación mínima

Para una modificación transversal:

- build de Core, Activos, MRTI-Obs, RH y Tickets;
- typecheck de MRTI-Obs y Tickets;
- pruebas frontend disponibles;
- `git diff --check` en cada repositorio;
- smoke HTTP del build publicado o de `vite preview`;
- revisión de claro, oscuro, escritorio, sidebar colapsada y drawer móvil.

## Rollback

Cada módulo puede revertir su commit visual de forma independiente y reconstruir
su frontend. No hay migraciones, cambios de API ni cambios de datos asociados a
este sistema visual.
