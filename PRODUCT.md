# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Cajero** en el mostrador de un colmado dominicano: despacha clientes con prisa, en computadora o tablet, bajo la luz del local.
- **Dueño / administrador**: administra inventario, fiao, reportes y equipo desde cualquier dispositivo, a menudo el celular y a veces fuera del colmado.

Ambos usos pesan igual.

## Product Purpose

SysCol reemplaza la libreta de papel y la calculadora del colmado: inventario, ventas y fiao en un solo lugar, con las cuentas claras. Éxito = el cajero cobra rápido sin errores y el dueño sabe en todo momento qué hay, qué se vendió y quién debe.

## Positioning

Hecho específicamente para el colmado dominicano: el fiao (crédito informal al cliente del barrio) es una función de primera clase, con límites, abonos parciales y recordatorios por WhatsApp. Precios finales en pesos dominicanos (DOP), días según hora de República Dominicana.

## Operating Context

- Punto de venta con carrito; métodos efectivo, tarjeta, transferencia o fiao (registrar tarjeta/transferencia no procesa el pago).
- Recibos internos imprimibles (no son factura fiscal).
- Fiao: deudas por venta, abonos parciales, historial de abonos; recordatorios manuales por WhatsApp con consentimiento.
- Inventario: categorías, códigos de barras, ajustes de stock con motivo, alerta de bajo inventario.
- Reportes por período: cantidad de ventas, total, productos más vendidos, fiao pendiente.
- Roles: dueño, administrador, cajero. Cada colmado tiene sus datos separados.

## Capabilities and Constraints

- Frontend Angular (un solo componente `app.html` / `app.ts`, estilos globales en `styles.css`), backend FastAPI, PostgreSQL.
- Debe funcionar bien en celular (tablas se convierten en filas apiladas).
- Idioma: español dominicano, tono cercano ("Vamos a trabajar", "Tu colmado").

## Brand Commitments

- Nombre: **SysCol** (obligatorio mantenerlo).
- Lemas existentes: "Tu colmado al día", "Cuentas claras. Negocio al día."
- El look debe ser serio y profesional; nada infantil ni caricaturesco.

## Evidence on Hand

No hay logotipo, fotografías, testimonios ni clientes reales documentados. No inventarlos.

## Product Principles

1. Rapidez en el mostrador antes que adorno.
2. El dinero siempre legible: montos claros, alineados y sin ambigüedad.
3. El fiao es confianza del barrio: tratarlo con respeto y claridad, nunca como castigo.
4. Igual de usable en celular que en computadora.
