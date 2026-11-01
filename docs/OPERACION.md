# Operación de SysCol

## Publicar con HTTPS

No publiques datos reales usando HTTP. La configuración local solo escucha en `127.0.0.1:8080`.

Para un servidor propio accesible desde internet, necesitas un dominio o subdominio que controles apuntando a su dirección y puertos 80/443 accesibles. La configuración Caddy utiliza certificados automáticos sin contratar un servicio de certificados. No se ha comprado ningún dominio ni provisionado servidor.

Añade `DOMAIN=tu-dominio.example` al `.env` y ejecuta:

```sh
docker compose -f docker-compose.yml -f compose.https.yml up --build -d --wait
```

Abre la URL HTTPS del dominio desde el celular. La base de datos y la API deben seguir sin puertos públicos. Mantén el acceso externo al frontend a través de Caddy. Nginx solo confía en cabeceras de IP reenviadas desde redes privadas de los contenedores.

El proxy limita intentos de registro e inicio de sesión por IP. Ajusta ese límite si muchos empleados legítimos comparten una misma conexión. La API directa de desarrollo no incluye esa protección del proxy y no debe publicarse directamente.

## Copias de seguridad y restauración

Haz copias diarias y antes de actualizar. Conserva una copia cifrada fuera del equipo. La información incluye nombres, teléfonos y saldos de clientes: restringe quién puede acceder a los archivos.

Ejemplo sin redirección binaria de PowerShell:

```sh
mkdir backups
docker compose exec db pg_dump -U syscol -Fc -f /tmp/syscol.dump syscol
docker compose cp db:/tmp/syscol.dump ./backups/syscol-AAAA-MM-DD.dump
```

Comprueba el código de salida y que el archivo exista y tenga contenido. Usa un nombre nuevo para cada copia. La carpeta `backups/` no se debe subir a GitHub.

Prueba la restauración en una base **nueva**, nunca sobre la base en uso:

```sh
docker compose exec db createdb -U syscol syscol_restore
docker compose cp ./backups/syscol-AAAA-MM-DD.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U syscol --no-owner -d syscol_restore /tmp/restore.dump
docker compose exec db psql -U syscol -d syscol_restore -c "SELECT count(*) FROM ventas; SELECT count(*) FROM clientes;"
```

Solo cambia la conexión de la aplicación después de comprobar registros y saldos restaurados. No uses `docker compose down -v` en producción: elimina el volumen de datos.

## Actualizaciones y cuentas antiguas

Revisa la versión, respalda, construye las imágenes y reinicia. No ejecutes varios procesos de migración contra la misma base al mismo tiempo.

La migración conserva contraseñas y usuarios de `main`. Como antes no había una relación usuario-colmado, asigna un colmado separado a cada cuenta antigua y la convierte en dueño de ese colmado. Revisa esta asignación con el propietario antes de dar acceso. Los hashes bcrypt anteriores siguen siendo verificables; las cuentas nuevas usan Argon2.

Las migraciones nuevas rechazan el retroceso destructivo. Si una actualización debe revertirse, restaura una copia verificada junto con la versión correspondiente del código.

Los esquemas de las ramas experimentales no son una base de producción soportada: antes de migrar una base creada desde esas ramas hay que revisar su revisión Alembic y preparar una conversión específica. No se han modificado bases de datos existentes del usuario.

## WhatsApp automático, opcional

La integración está desactivada y no contacta a proveedores mientras `WHATSAPP_ENABLED=false`.

Requisitos externos:

1. Cuenta Twilio y remitente WhatsApp habilitado.
2. Plantilla aprobada con parámetros `1` nombre del cliente, `2` nombre del colmado y `3` saldo en pesos dominicanos.
3. Consentimiento explícito del cliente. Al retirar el consentimiento en Clientes, se excluye de los siguientes envíos.
4. Revisión y aceptación de tarifas antes de habilitar cualquier envío real.

Configura en `.env`, únicamente cuando quieras habilitarlo:

```dotenv
WHATSAPP_ENABLED=true
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+...
TWILIO_CONTENT_SID=HX...
```

```sh
docker compose -f docker-compose.yml -f compose.whatsapp.yml --profile whatsapp up -d
```

El ejecutor realiza una pasada al iniciar y cada 24 horas. Se envía como máximo una solicitud por cliente y día dominicano. El registro se confirma antes de contactar al proveedor para evitar reenvíos automáticos si la conexión falla. Consulta `/api/avisos` con autorización de dueño/administrador: `aceptado` confirma aceptación del proveedor; `rechazado` un error HTTP; `desconocido` o `enviando` requieren comprobación manual. No hay confirmación automática de entrega ni recepción.

No actives el perfil en este proyecto mientras se mantenga el requisito de cero gastos. Las pruebas usan un remitente simulado.

Documentación del proveedor: https://www.twilio.com/docs/whatsapp/api

## Capacidad y seguimiento

Las listas tienen paginación; productos y clientes tienen búsqueda en el servidor. Se mantienen índices por colmado y transacciones para stock y crédito. El servidor PostgreSQL es la fuente de verdad.

Las pruebas locales comprueban corrección concurrente con 10 trabajadores, no certifican una cantidad de colmados o usuarios activos. Antes de vender una instalación concreta, mide la carga representativa en ese servidor, el tamaño de la base, la latencia y el funcionamiento de las copias. Supervisa `/api/ready`, uso de disco y fallos de operaciones; nunca registres claves o contraseñas en servicios de logs.

El plan gratuito o el hardware de una computadora no implican disponibilidad ilimitada. No se han incorporado facturación fiscal, cobros bancarios, trabajo sin conexión o suscripciones: no formaban parte de las funciones del README.
