# SysCol · Sistema para colmados

Gestión de inventario, ventas y fiao para colmados dominicanos, con interfaz adaptable a celular. Backend Python/FastAPI, frontend Angular/TypeScript y PostgreSQL. No se requieren suscripciones para ejecutar el sistema en una computadora propia.

## Funciones implementadas

- Cuentas de dueños y empleados; roles dueño, administrador y cajero. Los usuarios desactivados pierden acceso incluso con un token vigente.
- Separación de datos por colmado en consultas y operaciones.
- Categorías, productos, precios finales, códigos de barras, ajustes auditados de existencias y avisos de bajo inventario. Desactivar un producto conserva su historial.
- Punto de venta con carrito, efectivo, tarjeta, transferencia o fiao. El servidor determina precios, verifica existencias y registra todo en una transacción.
- Clientes, límites de crédito, historial de deudas, abonos parciales e idempotencia para reintentos de ventas y abonos.
- Historial de ventas y recibos internos imprimibles.
- Reportes por período: cantidad y total de ventas, productos más vendidos y deuda pendiente actual. Los días del reporte corresponden a República Dominicana.
- Recordatorios manuales por WhatsApp; integración automática opcional con Twilio, desactivada por defecto.
- Migraciones Alembic, despliegue Docker Compose, configuración HTTPS opcional y GitHub Actions con pruebas PostgreSQL, compilación Angular y prueba de despliegue.

**Los recibos son comprobantes internos, no facturas fiscales.** Registrar tarjeta o transferencia no procesa el pago ni confirma que el banco lo recibió. Los precios de venta son finales: no se añade automáticamente un 18 % uniforme a todos los productos.

## Instalación local

Requisitos: Docker Engine con Compose. Para desarrollar sin Docker: Python 3.13, Node 24 y PostgreSQL 16 o posterior.

```sh
git clone https://github.com/ArianRomeroPiron/SysCol.git
cd SysCol
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"
```

Genera **dos valores diferentes** con el comando anterior. Pon uno en `POSTGRES_PASSWORD` y otro en `SECRET_KEY` dentro de `.env`. Usa valores hexadecimales para evitar problemas al formar la URL de conexión. No publiques `.env`.

```sh
docker compose up --build -d --wait
```

Abre `http://localhost:8080`. Crea una cuenta de dueño. Añade categorías y productos, registra el stock inicial con motivo «Compra inicial», crea clientes y empieza a vender. El dueño crea los empleados desde **Mi equipo**; cada nueva cuenta pública de dueño crea otro colmado independiente.

La base de datos y el backend no publican puertos al exterior. Las migraciones se ejecutan al iniciar el backend. El endpoint `/api/ready` comprueba acceso al esquema migrado.

## Desarrollo

Desde `backend/`, crea un entorno virtual, instala `requirements-dev.txt` y copia `.env.example` a `.env` con una URL PostgreSQL válida y una clave aleatoria. Luego:

```sh
alembic upgrade head
uvicorn app.main:app --reload
```

Desde `frontend/`:

```sh
npm ci
npm start
```

Abre `http://localhost:4200`. El proxy envía `/api` al backend local. Las sesiones permanecen en memoria: al recargar o cerrar la página hay que iniciar sesión otra vez. No almacenes tokens manualmente en el navegador.

## Pruebas

```sh
cd backend
ruff check .
pytest -q
# Para incluir las pruebas de concurrencia, configura TEST_DATABASE_URL
# con una base PostgreSQL VACÍA y exclusiva para pruebas.
# Estas pruebas crean y eliminan tablas en esa base.
```

Configura también `DATABASE_URL` y `SECRET_KEY` antes de importar la aplicación. SQLite se permite exclusivamente como ayuda para pruebas rápidas; producción usa PostgreSQL.

```sh
cd frontend
npm ci
npm run build
# Con backend y frontend iniciados, opcionalmente:
npx playwright install chromium
npm run test:e2e
```

Resultados y límites de la validación: [docs/VALIDACION.md](docs/VALIDACION.md).

## Operación con usuarios reales

Consulta [docs/OPERACION.md](docs/OPERACION.md) antes de publicar el servicio. Incluye HTTPS, copias de seguridad, restauración, actualizaciones y requisitos externos de WhatsApp.

No se ha contratado alojamiento, comprado dominio ni habilitado envíos con cargo. Los planes gratuitos de terceros no garantizan capacidad, disponibilidad o almacenamiento ilimitados. Puedes alojar la aplicación en un equipo propio, pero necesitas conexión estable, copias externas y mantenimiento.

## WhatsApp

**Opción sin contratar servicios:** el botón abre WhatsApp con el texto del recordatorio; el operador confirma el envío. Requiere el consentimiento del cliente. El navegador puede bloquear ventanas emergentes; el texto también aparece en el aviso.

**Automatización opcional:** el código incluye un ejecutor diario con plantilla Twilio y registro de resultados. Requiere cuenta, remitente habilitado, plantilla aprobada y credenciales externas. Puede generar cargos del proveedor; está desactivado por defecto y no se ha enviado ningún mensaje real. Consulta la guía operativa antes de activarlo.

Un estado «aceptado» significa que el proveedor recibió la solicitud, no que WhatsApp entregó el mensaje. Los envíos de resultado desconocido no se reintentan automáticamente el mismo día.

## Ramas y PR anteriores

Se revisaron antes de editar: [docs/REVISION.md](docs/REVISION.md). Las ramas anteriores quedan disponibles para consultar su historial. No se incorporan automáticamente cambios incompatibles ni se eliminan ramas de colaboradores.

## Licencia y comercialización

La declaración original era «uso académico / personal, licencia por definir». La licencia y los derechos sobre contribuciones de colaboradores deben aclararse antes de comercializar. Este cambio no pretende resolver esa decisión ni añadir cobros o suscripciones.

---

## English

SysCol is a Dominican corner-store management application using Python/FastAPI, Angular/TypeScript and PostgreSQL. It includes tenant-isolated accounts, owner/admin/cashier roles, inventory, audited stock movements, server-priced transactional sales, customer credit limits, partial debt payments, internal printable receipts and period reports.

Run with `docker compose up --build -d --wait` after copying `.env.example` to `.env` and setting independent random hexadecimal database and signing secrets. Open `http://localhost:8080` and create an owner account. See the Spanish operations guide for HTTPS, backups, restores and testing.

WhatsApp manual reminders work without hiring an API service. Optional automatic reminders require a configured Twilio sender, approved template and credentials, may incur provider charges, and are disabled by default. No live messages have been sent. Receipts are internal records rather than fiscal invoices; recording a card payment does not charge a bank card. Commercial licensing remains to be clarified.
