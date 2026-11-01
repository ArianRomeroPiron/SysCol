# Validación de la implementación

Fecha local: 31 de octubre de 2026. Todos los registros usados son ficticios.

## Comprobaciones completadas

- Revisión de las ocho ramas y los cinco PR antes de modificar código: `REVISION.md`.
- Ruff sin errores.
- Compilación de producción de Angular completada.
- 10 pruebas Python completadas contra PostgreSQL portátil 18.6: negocio, validación, roles, aislamiento de colmados, reintentos, migración antigua, búsquedas más allá de 200 clientes, concurrencia y WhatsApp simulado.
- Migración inicial a esquema nuevo, incluyendo el registro de avisos, y comparación Alembic sin diferencias en una base PostgreSQL nueva.
- Navegador Edge real, vista 1440 × 1000 y móvil 390 × 844: registro de dueño, creación de categoría y producto, stock inicial, cliente, venta al fiao y abono parcial. Sin errores JavaScript detectados. La prueba se conserva en `frontend/tests/e2e.cjs` y también se ejecuta sobre el despliegue de CI.
- Inspección visual de capturas; se corrigió la tabla de deudas para mostrar campos legibles en móvil.
- Configuración Compose validada sintácticamente. Las imágenes completas se verifican mediante el job `compose` de GitHub Actions.

## Qué comprueban las pruebas concurrentes

Con PostgreSQL real y 10 trabajadores concurrentes:

- 30 solicitudes de venta, stock de 10: se aceptan 10 y se rechazan 20; stock final 0 y exactamente 10 ventas.
- 20 solicitudes de abono de RD$10 contra deuda de RD$71: se aceptan 7 y se rechazan 13; deuda y saldo del cliente quedan en RD$1.

Estos resultados verifican coherencia financiera, no una capacidad garantizada de usuarios ni una certificación de rendimiento. PostgreSQL 16 se incluye en la configuración de CI; la instancia portátil local usa 18.6.

## Dependencias y límites no comprobados en vivo

- No se hicieron envíos reales de WhatsApp: faltan credenciales y aprobación de gasto. Se probó que está desactivado por defecto, que registra una respuesta incierta y que no duplica el intento del día.
- No se provisionó alojamiento, dominio ni certificado público. Se incluyó configuración Caddy para un dominio que el operador controle.
- No se restauró una copia real del usuario ni se tocaron bases existentes. La guía explica cómo restaurar a otra base sin sobrescribir producción.
- El motor Docker de esta computadora devuelve errores, por lo que aquí no se pudo ejecutar el despliegue completo en contenedores. El job de CI es la comprobación adicional para esa parte.
- Queda una advertencia de deprecación de `httpx` en el cliente de pruebas de Starlette; no impide las pruebas ni afecta al cliente HTTP de producción.
- Antes de comercializar hay que aclarar la licencia, verificar el alojamiento elegido y realizar una prueba piloto con el flujo y volumen de los clientes reales.
