# Design

SysCol usa un mundo de **tienda cálida**: fondo tibio, tarjetas claras de esquinas suaves, etiquetas en lenguaje sencillo y **un solo color vivo (achiote) reservado para lo que se puede tocar**. Es una herramienta de trabajo (modo Operate): la navegación, los formularios y las tablas son estándar; el mundo aporta paleta, tipografía, densidad y un gesto distintivo.

## Paleta (tokens en `frontend/src/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--ground` | `#f5efe6` | Fondo tibio de la app |
| `--card` | `#fffdf9` | Tarjetas y paneles |
| `--ink` / `--ink-2` | `#2a211b` / `#6b5d52` | Texto principal / secundario |
| `--rail` | `#2b2019` | Riel lateral café y panel de bienvenida |
| `--action` | `#c8441a` | Única tinta saturada: acción principal, sección activa, foco |
| `--ok` | `#2f7a4b` | Abonos, deuda saldada |
| `--warn` | `#8a5a00` | Poco inventario, fiao cerca del límite, total a fiar |
| `--danger` | `#8e2a22` | Errores, producto agotado |

Tintes de categoría (`.tint-0`…`.tint-5`): seis colores suaves estables por `id_categoria` para reconocer productos de un vistazo.

## Tipografía

Figtree Variable, alojada localmente (`@fontsource-variable/figtree`, compatible con la CSP de nginx). Títulos 800 con tracking negativo; etiquetas 600; montos siempre con `tabular-nums`.

## Gesto distintivo: la cuenta del colmado

- El carrito es **«la cuenta»**: líneas `2× producto … monto`, el total como la cifra más grande de la pantalla, y la banda cambia a ámbar con «Total a fiar» cuando el método es fiao.
- Los productos ya agregados se marcan con borde de acción y «N en cuenta».
- El fiao se lee como confianza, no castigo: barra de uso del límite por cliente (ámbar desde 80 %) y barra verde de lo abonado en cada deuda.
- El recibo es un ticket con borde dentado y separadores punteados.

## Estructura

- Escritorio: riel café a la izquierda con la sección activa en achiote; contenido en el fondo tibio.
- Celular (≤760px): la navegación baja a una barra inferior para el pulgar; las tablas se apilan en filas con etiqueta.
- Iconos: trazos SVG de línea (estilo Lucide) definidos en `App.icons`; nada de emoji como iconos.

## Movimiento

Presión de botón con resorte (`scale(.97)`), entrada suave de líneas de la cuenta, recibo y avisos. Todo se desactiva con `prefers-reduced-motion`.
