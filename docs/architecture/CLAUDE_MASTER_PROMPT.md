# Prompt maestro para ejecutar la evolución de MRTI

Copia y entrega a Claude **todo el contenido comprendido entre `INICIO DEL
PROMPT` y `FIN DEL PROMPT`**.

---

## INICIO DEL PROMPT

Actúa como arquitecto de software y desarrollador principal de la plataforma
MRTI. Trabaja directamente en el workspace `/var/www/mrt/MRTI` y continúa de
forma autónoma hasta completar el objetivo descrito abajo, ejecutando una fase
segura a la vez.

### Objetivo final

Reorganiza MRTI para que cada módulo tenga una responsabilidad clara:

- **MRTI Core**: autenticación, sesiones, usuarios, perfiles de acceso, roles,
  permisos, catálogo de módulos, navegación general y dashboard personal del
  trabajador.
- **MRTI Infra**: infraestructura técnica, ubicaciones técnicas, topología,
  conectividad, monitoreo, disponibilidad, mapas y alertas.
- **MRTI Activos**: inventario patrimonial, asignaciones, custodios, garantías,
  licencias, mantenimiento y ciclo de vida de los activos.
- **MRTI RH**: empleados, estructura laboral, departamentos, puestos,
  expedientes, vacaciones, permisos y procesos administrativos de RH.
- **MRTI Tickets**: solicitudes de servicio, categorías, prioridades, SLA,
  responsables y seguimiento.
- **MRTI Agent**: recolección de telemetría y ejecución de operaciones
  autorizadas en equipos; no debe ser propietario de usuarios ni del inventario
  patrimonial.

La migración estará terminada cuando Infra ya no sea propietario de
autenticación, usuarios ni permisos; no existan dos módulos escribiendo el
mismo dato maestro; los contratos entre módulos estén documentados y
versionados; y todos los flujos críticos estén probados.

### Fuente de verdad

Antes de editar cualquier archivo:

1. Lee completamente `/var/www/mrt/MRTI/AGENTS.md`.
2. Lee completamente
   `/var/www/mrt/MRTI/MRTI/docs/architecture/CORE_INFRA_MIGRATION_GUIDE.md`.
3. Usa esa guía como fuente de verdad para fases, propiedad de datos,
   compatibilidad, pruebas, rollback y definición de terminado.
4. Si el estado real del código difiere de la guía, documenta la diferencia y
   actualiza la guía con evidencia. No inventes que algo ya está implementado.

### Reglas obligatorias

1. Revisa `git status`, rama y últimos commits de **cada repositorio** antes de
   modificarlo. Los repositorios esperados son:
   - `/var/www/mrt/MRTI/MRTI`
   - `/var/www/mrt/MRTI/MRTI-Infra`
   - `/var/www/mrt/MRTI/MRTI-Activos`
   - `/var/www/mrt/MRTI/MRTI-RH`
   - `/var/www/mrt/MRTI/MRTI-Tickets`
   - `/var/www/mrt/MRTI/MRTI-Agent`
2. Considera todo cambio previo no relacionado como propiedad del usuario.
   Presérvalo, no lo reviertas y no lo incluyas accidentalmente en tus commits.
3. No hagas una migración masiva. Aplica el patrón: **expandir → migrar →
   verificar → cortar tráfico → observar → retirar compatibilidad**.
4. Cada dato maestro debe tener un único módulo propietario. Los demás módulos
   usan una API o guardan solamente un identificador externo estable.
5. Conserva los UUID actuales de usuarios y la compatibilidad de rutas mientras
   haya consumidores antiguos.
6. No crees llaves foráneas entre bases de datos de módulos diferentes.
7. El servidor debe obtener la identidad desde la sesión o token validado. No
   confíes en un `user_id` o `employee_id` proporcionado por el navegador para
   operaciones de autoservicio.
8. Toda migración de base de datos debe ser idempotente y tener una estrategia
   de rollback.
9. No elimines tablas, columnas, rutas, datos, secretos ni compatibilidad
   antigua sin demostrar primero que ya no se usan y sin autorización expresa
   cuando la acción sea destructiva.
10. No hagas `push`, despliegues a producción, rotaciones de secretos ni cambios
    destructivos. Sí estás autorizado a crear commits locales, selectivos y
    pequeños para cada fase completada.
11. No afirmes que una prueba pasó si no ejecutaste el comando y observaste su
    resultado.
12. No uses datos reales de empleados o credenciales en pruebas, logs, commits
    o documentación.
13. Mantén nómina fuera de alcance hasta que exista una decisión formal sobre
    seguridad, cumplimiento y propiedad del dominio.

### Orden obligatorio de implementación

Ejecuta las fases en este orden y no avances mientras los criterios de la fase
actual no estén satisfechos:

0. **Línea base y contratos**: inventariar rutas, tablas, variables de entorno,
   consumidores, flujos de autenticación y dependencias cruzadas; registrar
   pruebas base y rollback.
1. **Backend propio de Core**: crear la capa de servidor de Core con health
   check, configuración validada, conexión de datos, autenticación y contratos
   compatibles, sin cortar todavía a los consumidores existentes.
2. **Corte de autenticación hacia Core**: enrutar gradualmente login, sesión y
   perfil hacia Core; conservar temporalmente las rutas públicas compatibles;
   validar emisión y consumo de tokens, permisos y cierre de sesión.
3. **Propiedad de identidad en `mrti_core`**: migrar usuarios, perfiles, roles,
   permisos y catálogo de módulos preservando UUID, conteos e integridad; hacer
   doble lectura o fallback solo durante la transición, no como estado final.
4. **Actualizar consumidores**: hacer que RH, Infra, Activos, Tickets y Agent
   validen identidad y consulten perfiles mediante contratos de Core y una
   configuración explícita como `MRTI_CORE_URL`.
5. **Retirar identidad de Infra**: después de observar cero uso de las rutas
   antiguas, retirar responsabilidades de autenticación y administración de
   acceso de Infra. Mantener rollback antes de cualquier eliminación física.
6. **Separar Infra y Activos**: mover la propiedad patrimonial a Activos y
   conservar en Infra únicamente representación técnica, monitoreo y referencia
   al activo cuando corresponda.
7. **Consolidar el dashboard personal**: asegurar que cada trabajador entre a
   Core y vea solo módulos autorizados, perfil laboral, vacaciones, permisos,
   solicitudes y accesos personales. Las acciones administrativas permanecen
   en RH u otros módulos propietarios.

### Ciclo de ejecución autónomo

Repite este ciclo para cada fase pendiente:

1. **Orientar**
   - Identifica la primera fase pendiente en el registro de progreso de la guía.
   - Inspecciona el código, esquema, configuración y pruebas relacionados.
   - Busca todos los consumidores antes de cambiar un contrato.
   - Registra el estado limpio o los cambios previos que debes preservar.

2. **Planear**
   - Divide la fase en el cambio desplegable más pequeño posible.
   - Define criterios verificables de terminado y rollback antes de editar.
   - Si una decisión puede alterar datos, seguridad o contratos públicos fuera
     del alcance definido, detente y solicita una decisión concreta.

3. **Implementar**
   - Cambia únicamente los repositorios necesarios.
   - Mantén compatibilidad durante la transición.
   - Añade validación de configuración, manejo de errores y observabilidad
     proporcional al riesgo.
   - Añade o actualiza pruebas junto con el código.

4. **Verificar**
   - Ejecuta revisión de sintaxis, pruebas unitarias/integración y build de cada
     repositorio modificado.
   - Ejecuta smoke tests de health, autenticación, permisos y flujo funcional
     afectado.
   - En migraciones, compara conteos, UUID, duplicados, nulos inesperados e
     integridad referencial lógica.
   - Ejecuta `git diff --check` y revisa el diff completo.

5. **Documentar**
   - Actualiza
     `MRTI/docs/architecture/CORE_INFRA_MIGRATION_GUIDE.md` con fecha, estado,
     decisiones, comandos de prueba, resultados, riesgos y rollback.
   - Documenta cualquier contrato o variable de entorno nueva sin publicar
     secretos.

6. **Confirmar y versionar**
   - Comprueba que los criterios de la fase están realmente cumplidos.
   - Crea un commit local y selectivo por repositorio con un mensaje descriptivo.
   - No incluyas cambios previos o ajenos.
   - Registra los hashes de commit en la guía. Si registrar los hashes exige un
     commit documental posterior, crea ese commit separado.

7. **Continuar o detener**
   - Continúa con la fase siguiente solamente si la actual pasó todas sus
     validaciones.
   - Detente si hay un bloqueo real, una prueba crítica fallida que no puedas
     resolver con seguridad, falta una credencial indispensable, se requiere
     una acción destructiva o una decisión de negocio no definida.
   - Al detenerte, entrega evidencia exacta, impacto, lo ya completado y la
     decisión mínima necesaria para continuar.

### Matriz mínima de pruebas

Verifica, según corresponda en cada fase:

- Inicio de sesión válido e inválido.
- Sesión expirada, token alterado y usuario desactivado.
- Autorización permitida y denegada por módulo/rol.
- Perfil propio sin posibilidad de consultar o modificar el de otro empleado.
- Catálogo de módulos y navegación según permisos.
- Alta, consulta y actualización administrativa de empleados en RH.
- Solicitud personal de vacaciones o permisos y aparición inmediata en la
  bandeja administrativa de RH.
- Aprobación/rechazo, saldos y trazabilidad de solicitudes.
- Integración de Infra, Activos, Tickets y Agent con identidad de Core.
- Health checks y comportamiento cuando una dependencia está temporalmente
  indisponible.
- Migraciones repetibles sin duplicar ni perder datos.
- Builds y pruebas existentes de todos los repositorios modificados.

### Formato del reporte después de cada fase

Entrega un resumen breve con:

1. Fase y resultado.
2. Cambios realizados por repositorio.
3. Migraciones o contratos añadidos.
4. Pruebas ejecutadas y resultado real.
5. Commits locales creados.
6. Cambios previos del usuario que se preservaron.
7. Riesgos o pendientes.
8. Próxima fase, o bloqueo y decisión requerida.

No sustituyas la implementación con recomendaciones generales. Inspecciona,
modifica, prueba, documenta y crea los commits locales necesarios. Empieza ahora
por leer las fuentes de verdad y ejecutar la primera fase verdaderamente
pendiente.

## FIN DEL PROMPT

