# Revisión previa a cambios

Se inspeccionaron las ocho ramas y los cinco PR del repositorio antes de editar.

| Rama / PR | Resultado |
|---|---|
| main | Solo autenticación; módulos vacíos y frontend sin aplicación. |
| develop, feature/docker-setup / #1 | Base Docker ya integrada; Compose no carga correctamente las variables documentadas. |
| feature/auth-jwt / #3 | Integrada. Falta impedir acceso de usuarios inactivos, validar datos y separar colmados. |
| feature/backend-core / #2 | Incluye categorías/productos, pero elimina autenticación, migración inicial y documentación. No integrar en bloque. |
| feature/roles-y-ci / #4 | Roles y CI aprovechables como referencia. Faltan autorización efectiva y pruebas de negocio. |
| fix/ruff-deps / #5 | Mismo commit que #4; el arreglo descrito no existe como diferencia entre ambas ramas. |
| P2-—-Ventas | Modelos y estructura de ventas aprovechables como referencia. Acepta precio arbitrario del cliente, no valida stock ni descuenta existencias; registro acepta rol. No desplegar. |

Los tres PR abiertos no tienen revisiones registradas. No se fusionan automáticamente: sus cambios incompatibles se sustituyen por una implementación coherente con pruebas. Se conserva el historial y la migración inicial de main.

## Alcance de implementación

Autenticación y empleados, aislamiento por colmado, categorías, productos, ajustes de stock, clientes, ventas, deudas, abonos, reportes y recordatorios. Frontend Angular, migraciones, Compose, CI y guía operativa deben usar los mismos contratos.

## Límites conocidos

El envío automático real de WhatsApp depende de credenciales y condiciones del proveedor; por defecto no se envían mensajes ni se generan gastos. La alternativa gratuita abre el mensaje para enviarlo manualmente. No equivale a automatización gratuita ilimitada.

El README declara uso académico/personal y licencia sin definir: debe aclararse antes de comercializar. No se presume capacidad ilimitada ni disponibilidad de un alojamiento gratuito para producción.
