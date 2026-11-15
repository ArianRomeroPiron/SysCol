# Mejoras de diseño y uso (noviembre 2026)

Rama: `claude/syscol-design-ux-improvements-ff8b0b`, a partir de `main` en `fb9f5c5` (sin cambios posteriores en GitHub al empezar).
Se mantiene el stack (FastAPI, Angular, PostgreSQL, Alembic, Docker, GitHub Actions) y todas las funciones anteriores.
Capturas en [`docs/capturas/`](capturas/), tomadas con datos ficticios.

## Qué se encontró al recorrer la versión anterior

| Problema | Efecto en el colmado |
|---|---|
| Recargar la página cerraba la sesión y perdía el carrito. | Una venta a medias se perdía con un toque accidental. |
| Buscar productos exigía escribir y pulsar «Buscar». No se podía cambiar la cantidad en el carrito ni calcular la devuelta. | Ventas lentas; cuentas de cambio hechas a mano. |
| En celular el menú se desplazaba de lado y escondía Fiao, Ventas, Reportes y Equipo. | Secciones difíciles de encontrar. |
| Inventario mezclaba campos de ajuste en cada tarjeta; el formulario de edición quedaba al final de la página. Los ajustes usaban números negativos. | Errores al ajustar existencias y desorientación al editar. |
| Fiao listaba cada venta por separado, incluidas las ya pagadas, y buscaba los nombres en una lista de 200 clientes. | No se veía cuánto debe cada cliente; nombres incorrectos con muchos clientes. |
| Angular desactivaba la validación del navegador; los errores 422/429/502 mostraban mensajes técnicos o en inglés. | Formularios enviados vacíos y mensajes confusos. |
| Historial sin cliente ni vendedor; recibo sin nombre del colmado. Roles mostrados como `admin`/`cajero`. | Recibos poco útiles para el cliente. |
| No había anulación de ventas, cambio de rol o contraseña. | Una equivocación quedaba para siempre en ventas, stock y fiao. |

## Qué cambió

### Estructura y diseño
- **Computadora:** barra lateral con nombre del colmado, secciones y usuario (cambiar contraseña, cerrar sesión).
- **Celular:** barra inferior fija con Vender, Inventario, Clientes y Fiao, más «Más» para Ventas, Reportes, Equipo y la cuenta. Los formularios se abren como hoja inferior.
- Tablas que pasan a tarjetas en celular; botones de 44 px como mínimo; fuente del sistema a 16 px (sin descargas y sin zoom automático en iPhone).
- Un único color de acción (verde) y colores de aviso solo con significado: ámbar para poco stock o deuda y rojo para agotado, anulado o errores.
- Diálogos con título accesible, cierre con Escape y foco en el primer campo. Validación del navegador activada y mensajes del servidor traducidos a frases simples.

### Vender
- Búsqueda en vivo, filtro por categoría y **escáner**: Enter con un código de barras o una coincidencia única agrega el producto directamente.
- Tarjetas que se tocan completas, con la cantidad ya agregada y «Agotado».
- Carrito con − / cantidad / +, límite al stock disponible y confirmación para vaciar.
- Cliente con buscador directo, crear cliente en el momento, y aviso de cuánto se le puede fiar o cuánto excede.
- Forma de pago con botones. En efectivo: «¿Con cuánto paga?», billetes rápidos y **devuelta** en grande, también en el recibo.
- En celular, una barra flotante muestra artículos y total con acceso a la venta.
- El carrito, el cliente y la referencia de la venta se guardan en la pestaña: **recargar no pierde la venta** y un reintento sigue protegido contra duplicados.

### Inventario
- Lista con categoría, precio, ganancia por unidad y existencia con color; aviso de cuántos productos tienen poco stock.
- «Nuevo producto» en un diálogo: crear categoría sin salir, ver la ganancia mientras se escribe y registrar las unidades iniciales (se guardan como movimiento «Compra inicial»).
- «Entrada / salida» en lugar de números negativos, con motivos rápidos, cuántas unidades quedarán y los últimos movimientos del producto.

### Clientes y fiao
- Teléfono aceptado como `809-555-1234`; se guarda en formato internacional.
- Fiao muestra **lo que te deben en total**, clientes ordenados por deuda, barra de uso del límite, abono y recordatorio de WhatsApp en la misma tarjeta.
- El abono lista las deudas pendientes del cliente con «Abonar» o «Saldar». La referencia de idempotencia depende de la deuda y del monto: cambiar el monto tras un error ya no provoca un rechazo por referencia repetida.

### Ventas, reportes y equipo
- Historial con cliente, vendedor, forma de pago y estado. Recibo con nombre del colmado, quién atendió, cliente y devuelta, preparado para impresora de 80 mm.
- **Anular venta** (dueño o administrador): devuelve existencias con movimiento auditado, cancela el fiao si no tiene abonos y conserva la venta marcada con motivo y responsable.
- Reportes con atajos (hoy, ayer, 7 días, mes), promedio por venta, desglose por forma de pago, abonos recibidos y ventas anuladas excluidas. El texto aclara que el total no es ganancia ni dinero en caja.
- Equipo: cambiar rol o restablecer contraseña de empleados y confirmación antes de desactivar. Cada usuario puede cambiar su propia contraseña.

## Cambios en el servidor

Todos conservan precios calculados en el servidor, verificación de stock, límites de crédito, idempotencia y separación por colmado.

| Endpoint | Cambio |
|---|---|
| `GET /auth/me` | Incluye `colmado` (nombre). |
| `POST /auth/password` | Cambio de contraseña propia; exige la actual. |
| `PATCH /auth/usuarios/{id}` | Solo dueño: rol `admin`/`cajero` y/o nueva contraseña. No modifica la cuenta del dueño. |
| `POST /ventas/{id}/anular` | Dueño/administrador. Bloquea venta, cliente y productos en el mismo orden que ventas y abonos. Rechaza ventas ya anuladas o fiao con abonos. |
| `GET /ventas` | Añade `cliente`, `vendedor`, datos de anulación. |
| `GET /productos` | Filtros `id_categoria` y `activo`. |
| `GET /movimientos` | Filtro `producto_id`. |
| `GET /clientes` | Filtro `con_deuda` (ordenado por saldo). |
| `GET /fiao/resumen` | Total pendiente y clientes con deuda. |
| `GET /deudas`, `GET /abonos` | Nombre del cliente; filtros `pendientes` e `id_cliente`. |
| `GET /reportes` | Excluye anuladas; añade `por_metodo`, `abonos` y `anuladas`. |

Migración `623527437bba`: tres columnas opcionales en `ventas` (`anulada_en`, `anulada_por`, `motivo_anulacion`). No modifica datos existentes; el retroceso se bloquea como en las migraciones anteriores.

## Sesión: decisión y riesgo

El token se guarda en `sessionStorage`: sobrevive a recargar, pero se borra al cerrar la pestaña y no se comparte con otras pestañas. El carrito se guarda por usuario. Al vencer la sesión se conserva el carrito para el mismo usuario; «Cerrar sesión» lo descarta (avisando antes si hay productos).

Un script inyectado podría leer ese token. Lo mitiga la CSP existente (`script-src 'self'`, sin scripts externos) y el vencimiento de 60 minutos. La alternativa más fuerte es una cookie `HttpOnly` con protección CSRF; se deja como mejora pendiente porque cambia el contrato de autenticación.

## Pendiente o fuera de alcance

- **Devoluciones parciales:** solo existe la anulación completa. Una venta fiao con abonos no se puede anular; habría que definir cómo devolver lo abonado.
- **Ganancia real:** la ganancia mostrada usa el costo actual del producto; las ventas no guardan el costo del momento, por lo que no hay reporte de ganancia histórica.
- **Cierre de caja** (efectivo esperado frente a contado) y abonos con forma de pago: no existen en el modelo de datos.
- **Revocar sesiones:** cambiar una contraseña no invalida tokens ya emitidos (máximo 60 minutos). Desactivar al usuario sí bloquea de inmediato.
- **Sin conexión:** la aplicación necesita conexión con el servidor; no hay modo fuera de línea.
- Validación con usuarios reales de colmados, impresoras térmicas concretas y lectores de código específicos.
- WhatsApp automático, facturación fiscal, licencia y alojamiento siguen igual que antes.
