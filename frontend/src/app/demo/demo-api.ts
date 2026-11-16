/**
 * API de demostración que vive en el navegador.
 *
 * Reproduce las reglas del backend (precios del servidor, existencias, límite de
 * fiao, abonos, reportes en hora dominicana) y guarda todo en localStorage para
 * que SysCol se pueda probar sin servidor ni base de datos.
 */
type Row = Record<string, any>;

interface Db {
  seq: number;
  colmados: Row[];
  usuarios: Row[];
  categorias: Row[];
  productos: Row[];
  clientes: Row[];
  ventas: Row[];
  deudas: Row[];
  abonos: Row[];
}

const KEY = "syscol-demo-v1";
export const DEMO_EMAIL = "demo@syscol.app";
export const DEMO_PASSWORD = "colmado-de-prueba";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const fail = (status: number, detail: string): never => {
  throw new ApiError(status, detail);
};

const cents = (n: any) => Math.round(Number(n) * 100);
const money = (c: number) => c / 100;

async function hash(text: string) {
  const data = new TextEncoder().encode("syscol-demo:" + text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function fold(text: any) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Fecha (AAAA-MM-DD) en hora de República Dominicana. */
function drDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function load(): Db | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Db) : null;
  } catch {
    return null;
  }
}

let memory: Db | null = null;
function save(db: Db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Navegación privada o almacenamiento lleno: la demo sigue en memoria.
  }
}

async function database(): Promise<Db> {
  if (memory) return memory;
  const stored = load();
  if (stored) return (memory = stored);
  const fresh = await seed();
  save(fresh);
  return fresh;
}

/** Borra los datos de la demo y vuelve a los datos de ejemplo. */
export function resetDemo() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

function nextId(db: Db) {
  return ++db.seq;
}

function pageOf<T extends Row>(rows: T[], params: URLSearchParams, max = 200) {
  const offset = Math.max(0, Number(params.get("offset") || 0));
  const limit = Math.min(max, Math.max(1, Number(params.get("limit") || 100)));
  return rows.slice(offset, offset + limit);
}

function byIdDesc(a: Row, b: Row) {
  return b["id"] - a["id"];
}
function byName(a: Row, b: Row) {
  return a["nombre"].localeCompare(b["nombre"], "es") || a["id"] - b["id"];
}

function publicUser(u: Row) {
  const { hash: _, ...rest } = u;
  return rest;
}

// ---------- Reglas de negocio (equivalentes al backend) ----------

function owned(db: Db, list: keyof Db, id: number, user: Row): Row {
  const row = (db[list] as Row[]).find(
    (x) => x["id"] === Number(id) && x["colmado_id"] === user["colmado_id"],
  );
  return row ?? fail(404, "Registro no encontrado");
}

function manager(user: Row) {
  if (!["dueno", "admin"].includes(user["rol"]))
    fail(403, "Se requiere permiso de administrador");
}

function validProduct(data: Row) {
  const nombre = String(data["nombre"] ?? "").trim();
  if (!nombre || nombre.length > 160) fail(422, "Revisa el nombre del producto.");
  if (!(Number(data["id_categoria"]) > 0)) fail(422, "Selecciona una categoría.");
  for (const k of ["precio_compra", "precio_venta"])
    if (!(Number(data[k]) >= 0)) fail(422, "Revisa los precios del producto.");
  const minimo = Number(data["stock_minimo"] ?? 5);
  if (!Number.isInteger(minimo) || minimo < 0)
    fail(422, "La alerta de stock debe ser un número entero.");
  const codigo = data["codigo_barras"] ? String(data["codigo_barras"]).trim() : null;
  return {
    nombre,
    id_categoria: Number(data["id_categoria"]),
    codigo_barras: codigo || null,
    precio_compra: money(cents(data["precio_compra"])),
    precio_venta: money(cents(data["precio_venta"])),
    stock_minimo: minimo,
    activo: data["activo"] !== false,
  };
}

function validCustomer(data: Row) {
  const nombre = String(data["nombre"] ?? "").trim();
  if (!nombre || nombre.length > 160) fail(422, "Revisa el nombre del cliente.");
  const telefono = String(data["telefono"] ?? "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(telefono))
    fail(422, "Escribe el teléfono con código de país, por ejemplo +18095551234.");
  const limite = Number(data["limite_credito"] ?? 0);
  if (!(limite >= 0)) fail(422, "El límite de crédito no puede ser negativo.");
  return {
    nombre,
    telefono,
    limite_credito: money(cents(limite)),
    consentimiento_whatsapp: !!data["consentimiento_whatsapp"],
  };
}

function registerSale(db: Db, user: Row, data: Row, fecha = new Date().toISOString()) {
  const ref = String(data["referencia"] ?? "");
  const existing = db.ventas.find(
    (v) => v["colmado_id"] === user["colmado_id"] && v["referencia"] === ref,
  );
  if (existing) return existing;
  const metodo = data["metodo_pago"];
  if (!["efectivo", "tarjeta", "transferencia", "fiao"].includes(metodo))
    fail(422, "Método de pago no válido.");
  const items: Row[] = data["detalles"] ?? [];
  if (!items.length) fail(422, "Agrega productos a la venta.");
  const ids = items.map((x) => Number(x["id_producto"]));
  if (new Set(ids).size !== ids.length)
    fail(422, "Agrupa las cantidades del mismo producto");
  const client = data["id_cliente"]
    ? owned(db, "clientes", data["id_cliente"], user)
    : null;
  if (metodo === "fiao" && !client) fail(422, "El fiao requiere un cliente");

  // Validar todo antes de modificar nada (como una transacción).
  let total = 0;
  const detalles = items.map((item) => {
    const p = owned(db, "productos", item["id_producto"], user);
    const cantidad = Number(item["cantidad"]);
    if (!Number.isInteger(cantidad) || cantidad < 1) fail(422, "Cantidad no válida.");
    if (!p["activo"]) fail(409, "Producto inactivo");
    if (p["stock"] < cantidad) fail(409, "Stock insuficiente: " + p["nombre"]);
    const subtotal = cents(p["precio_venta"]) * cantidad;
    total += subtotal;
    return { p, cantidad, subtotal };
  });
  if (metodo === "fiao" && cents(client!["saldo"]) + total > cents(client!["limite_credito"]))
    fail(409, "La venta supera el límite de crédito");

  for (const d of detalles) d.p["stock"] -= d.cantidad;
  const venta = {
    id: nextId(db),
    colmado_id: user["colmado_id"],
    usuario_id: user["id"],
    id_cliente: client ? client["id"] : null,
    referencia: ref,
    fecha,
    metodo_pago: metodo,
    subtotal: money(total),
    impuesto: 0,
    total: money(total),
    detalles: detalles.map((d) => ({
      id: nextId(db),
      id_producto: d.p["id"],
      nombre: d.p["nombre"],
      cantidad: d.cantidad,
      precio_venta: d.p["precio_venta"],
      subtotal: money(d.subtotal),
    })),
  };
  db.ventas.push(venta);
  if (metodo === "fiao") {
    client!["saldo"] = money(cents(client!["saldo"]) + total);
    db.deudas.push({
      id: nextId(db),
      colmado_id: user["colmado_id"],
      id_cliente: client!["id"],
      id_venta: venta.id,
      monto_total: money(total),
      saldo_pendiente: money(total),
      fecha,
    });
  }
  return venta;
}

function registerPayment(db: Db, user: Row, id: number, data: Row, fecha = new Date().toISOString()) {
  const ref = String(data["referencia"] ?? "");
  const existing = db.abonos.find(
    (a) => a["colmado_id"] === user["colmado_id"] && a["referencia"] === ref,
  );
  if (existing) return existing;
  const monto = cents(data["monto"]);
  if (!(monto > 0)) fail(422, "Escribe un monto mayor que cero.");
  const debt = owned(db, "deudas", id, user);
  if (cents(debt["saldo_pendiente"]) < monto)
    fail(409, "El abono supera el saldo pendiente");
  const client = owned(db, "clientes", debt["id_cliente"], user);
  debt["saldo_pendiente"] = money(cents(debt["saldo_pendiente"]) - monto);
  client["saldo"] = money(cents(client["saldo"]) - monto);
  const abono = {
    id: nextId(db),
    colmado_id: user["colmado_id"],
    id_deuda: Number(id),
    monto: money(monto),
    referencia: ref,
    usuario_id: user["id"],
    fecha,
  };
  db.abonos.push(abono);
  return abono;
}

// ---------- Rutas ----------

async function route(
  db: Db,
  method: string,
  path: string,
  params: URLSearchParams,
  body: any,
  token: string | null,
): Promise<[number, any]> {
  // Autenticación
  if (method === "POST" && path === "/auth/register") {
    const email = String(body?.email ?? "").trim().toLowerCase();
    const nombre = String(body?.nombre ?? "").trim();
    const colmado = String(body?.colmado ?? "").trim();
    if (!nombre || !colmado) fail(422, "Escribe tu nombre y el del colmado.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, "Revisa el correo electrónico.");
    if (String(body?.password ?? "").length < 12)
      fail(422, "La contraseña debe tener al menos 12 caracteres.");
    if (db.usuarios.some((u) => u["email"] === email)) fail(409, "Correo ya registrado");
    const store = { id: nextId(db), nombre: colmado };
    db.colmados.push(store);
    const user = {
      id: nextId(db),
      nombre,
      email,
      rol: "dueno",
      esta_activo: true,
      colmado_id: store.id,
      hash: await hash(body.password),
    };
    db.usuarios.push(user);
    return [201, publicUser(user)];
  }
  if (method === "POST" && path === "/auth/login") {
    const email = String(body?.username ?? "").trim().toLowerCase();
    const user = db.usuarios.find((u) => u["email"] === email);
    if (!user || user["hash"] !== (await hash(String(body?.password ?? ""))) || !user["esta_activo"])
      fail(401, "Credenciales inválidas");
    return [200, { access_token: "demo." + user!["id"], token_type: "bearer" }];
  }

  const user = db.usuarios.find((u) => "demo." + u["id"] === token);
  if (!user || !user["esta_activo"]) fail(401, "Tu sesión terminó. Vuelve a entrar.");
  const mine = <T extends Row>(rows: T[]) =>
    rows.filter((x) => x["colmado_id"] === user!["colmado_id"]);
  const seg = path.split("/").filter(Boolean);

  if (method === "GET" && path === "/auth/me") return [200, publicUser(user!)];
  if (path === "/auth/usuarios" || path.startsWith("/auth/usuarios/")) {
    if (user!["rol"] !== "dueno") fail(403, "Solo el dueño administra empleados");
    if (method === "GET")
      return [200, mine(db.usuarios).sort((a, b) => a["id"] - b["id"]).map(publicUser)];
    if (method === "POST") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!String(body?.nombre ?? "").trim()) fail(422, "Escribe el nombre del empleado.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, "Revisa el correo del empleado.");
      if (String(body?.password ?? "").length < 12)
        fail(422, "La contraseña inicial debe tener al menos 12 caracteres.");
      if (!["admin", "cajero"].includes(body?.rol)) fail(422, "Rol no válido.");
      if (db.usuarios.some((u) => u["email"] === email)) fail(409, "Correo ya registrado");
      const emp = {
        id: nextId(db),
        nombre: String(body.nombre).trim(),
        email,
        rol: body.rol,
        esta_activo: true,
        colmado_id: user!["colmado_id"],
        hash: await hash(body.password),
      };
      db.usuarios.push(emp);
      return [201, publicUser(emp)];
    }
    if (method === "PATCH" && seg[3] === "estado") {
      const emp = owned(db, "usuarios", Number(seg[2]), user!);
      if (emp["rol"] === "dueno") fail(409, "No puedes desactivar al dueño");
      emp["esta_activo"] = params.get("activo") === "true";
      return [200, publicUser(emp)];
    }
  }

  // Inventario
  if (path === "/categorias") {
    if (method === "GET") return [200, pageOf(mine(db.categorias).sort(byIdDesc), params)];
    if (method === "POST") {
      manager(user!);
      const nombre = String(body?.nombre ?? "").trim();
      if (!nombre || nombre.length > 120) fail(422, "Escribe el nombre de la categoría.");
      const cat = { id: nextId(db), colmado_id: user!["colmado_id"], nombre };
      db.categorias.push(cat);
      return [201, cat];
    }
  }
  if (path === "/productos") {
    if (method === "GET") {
      const q = fold(params.get("q"));
      let rows = mine(db.productos);
      if (q)
        rows = rows.filter(
          (p) => fold(p["nombre"]).includes(q) || fold(p["codigo_barras"]).includes(q),
        );
      if (params.get("bajo_stock") === "true")
        rows = rows.filter((p) => p["stock"] <= p["stock_minimo"] && p["activo"]);
      return [200, pageOf(rows.sort(byName), params)];
    }
    if (method === "POST") {
      manager(user!);
      const data = validProduct(body ?? {});
      owned(db, "categorias", data.id_categoria, user!);
      const p = { id: nextId(db), colmado_id: user!["colmado_id"], stock: 0, ...data };
      db.productos.push(p);
      return [201, p];
    }
  }
  if (seg[0] === "productos" && seg[1]) {
    const p = owned(db, "productos", Number(seg[1]), user!);
    if (method === "PUT" && !seg[2]) {
      manager(user!);
      const data = validProduct(body ?? {});
      owned(db, "categorias", data.id_categoria, user!);
      Object.assign(p, data);
      return [200, p];
    }
    if (method === "POST" && seg[2] === "stock") {
      manager(user!);
      const cantidad = Number(body?.cantidad);
      if (!Number.isInteger(cantidad)) fail(422, "Escribe una cantidad entera de unidades.");
      if (String(body?.motivo ?? "").trim().length < 3)
        fail(422, "Escribe el motivo del ajuste (mínimo 3 letras).");
      if (p["stock"] + cantidad < 0) fail(409, "El ajuste deja stock negativo");
      p["stock"] += cantidad;
      return [200, p];
    }
  }

  // Clientes
  if (path === "/clientes") {
    if (method === "GET") {
      const q = fold(params.get("q"));
      let rows = mine(db.clientes);
      if (q)
        rows = rows.filter((c) => fold(c["nombre"]).includes(q) || c["telefono"].includes(q));
      return [200, pageOf(rows.sort(byName), params)];
    }
    if (method === "POST") {
      const c = { id: nextId(db), colmado_id: user!["colmado_id"], saldo: 0, ...validCustomer(body ?? {}) };
      db.clientes.push(c);
      return [201, c];
    }
  }
  if (seg[0] === "clientes" && seg[1] && method === "PUT") {
    manager(user!);
    const c = owned(db, "clientes", Number(seg[1]), user!);
    const data = validCustomer(body ?? {});
    if (cents(data.limite_credito) < cents(c["saldo"]))
      fail(409, "El límite no puede ser menor que la deuda actual");
    Object.assign(c, data);
    return [200, c];
  }

  // Ventas, fiao y abonos
  if (path === "/ventas") {
    if (method === "GET") return [200, pageOf(mine(db.ventas).sort(byIdDesc), params)];
    if (method === "POST") return [201, registerSale(db, user!, body ?? {})];
  }
  if (seg[0] === "ventas" && seg[1] && method === "GET")
    return [200, owned(db, "ventas", Number(seg[1]), user!)];
  if (path === "/deudas" && method === "GET")
    return [200, pageOf(mine(db.deudas).sort(byIdDesc), params)];
  if (seg[0] === "deudas" && seg[2] === "abonos" && method === "POST")
    return [201, registerPayment(db, user!, Number(seg[1]), body ?? {})];
  if (path === "/abonos" && method === "GET")
    return [200, pageOf(mine(db.abonos).sort(byIdDesc), params)];

  // Reportes
  if (path === "/reportes" && method === "GET") {
    manager(user!);
    const desde = params.get("desde") || "";
    const hasta = params.get("hasta") || "";
    if (!desde || !hasta || hasta < desde) fail(422, "Selecciona un período válido");
    const days = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (days > 366) fail(422, "Selecciona un período de hasta 366 días");
    const ventas = mine(db.ventas).filter((v) => {
      const d = drDate(v["fecha"]);
      return d >= desde && d <= hasta;
    });
    const top = new Map<number, { nombre: string; cantidad: number; total: number }>();
    for (const v of ventas)
      for (const d of v["detalles"]) {
        const row = top.get(d.id_producto) ?? { nombre: d.nombre, cantidad: 0, total: 0 };
        row.cantidad += d.cantidad;
        row.total += cents(d.subtotal);
        top.set(d.id_producto, row);
      }
    return [
      200,
      {
        ventas: ventas.length,
        total: money(ventas.reduce((s, v) => s + cents(v["total"]), 0)),
        deuda_pendiente: money(mine(db.clientes).reduce((s, c) => s + cents(c["saldo"]), 0)),
        productos: [...top.values()]
          .sort((a, b) => b.cantidad - a.cantidad)
          .slice(0, 20)
          .map((r) => ({ ...r, total: money(r.total) })),
      },
    ];
  }

  // Recordatorio por WhatsApp
  if (seg[0] === "whatsapp" && seg[1] && method === "GET") {
    const c = owned(db, "clientes", Number(seg[1]), user!);
    if (!c["consentimiento_whatsapp"]) fail(409, "El cliente no ha autorizado recordatorios");
    if (cents(c["saldo"]) <= 0) fail(409, "El cliente no tiene saldo pendiente");
    const mensaje = `Hola ${c["nombre"]}, te recordamos tu saldo pendiente de RD$ ${Number(c["saldo"]).toFixed(2)}. Gracias.`;
    return [
      200,
      {
        modo: "manual",
        mensaje,
        url: "https://wa.me/" + c["telefono"].replace(/^\+/, "") + "?text=" + encodeURIComponent(mensaje),
      },
    ];
  }

  return fail(404, "Ruta no encontrada en la demo");
}

/** Sustituto de `fetch` para las llamadas a `/api` en modo demo. */
export async function demoFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, location.origin);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = (init.method || "GET").toUpperCase();
  let body: any;
  if (init.body instanceof URLSearchParams) body = Object.fromEntries(init.body);
  else if (typeof init.body === "string") body = JSON.parse(init.body);
  const headers = new Headers(init.headers);
  const token = (headers.get("Authorization") || "").replace(/^Bearer /, "") || null;

  const db = await database();
  // Trabajamos sobre una copia: si una regla falla, nada queda a medias.
  const draft: Db = structuredClone(db);
  try {
    const [status, data] = await route(draft, method, path, url.searchParams, body, token);
    if (method !== "GET") save(draft);
    await new Promise((r) => setTimeout(r, 120)); // un poco de latencia realista
    return json(status, structuredClone(data));
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { detail: e.message });
    return json(500, { detail: "Algo salió mal en la demo. Intenta otra vez." });
  }
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- Datos de ejemplo ----------

async function seed(): Promise<Db> {
  const db: Db = {
    seq: 0,
    colmados: [],
    usuarios: [],
    categorias: [],
    productos: [],
    clientes: [],
    ventas: [],
    deudas: [],
    abonos: [],
  };
  const store = { id: nextId(db), nombre: "Colmado La Esquina" };
  db.colmados.push(store);
  const owner = {
    id: nextId(db),
    nombre: "Ramón",
    email: DEMO_EMAIL,
    rol: "dueno",
    esta_activo: true,
    colmado_id: store.id,
    hash: await hash(DEMO_PASSWORD),
  };
  db.usuarios.push(owner, {
    id: nextId(db),
    nombre: "Yeison Mateo",
    email: "cajero@syscol.app",
    rol: "cajero",
    esta_activo: true,
    colmado_id: store.id,
    hash: await hash("cajero-de-prueba"),
  });

  const cats: Record<string, number> = {};
  for (const nombre of ["Víveres", "Bebidas", "Lácteos y embutidos", "Limpieza", "Higiene"]) {
    const id = nextId(db);
    cats[nombre] = id;
    db.categorias.push({ id, colmado_id: store.id, nombre });
  }

  const productos: [string, string, string | null, number, number, number, number][] = [
    ["Arroz selecto 5 lb", "Víveres", "7460101000011", 230, 285, 60, 10],
    ["Habichuelas rojas 1 lb", "Víveres", "7460101000028", 70, 95, 30, 8],
    ["Aceite vegetal 32 oz", "Víveres", "7460101000035", 255, 310, 22, 6],
    ["Azúcar crema 2 lb", "Víveres", null, 70, 90, 25, 8],
    ["Café molido 1 lb", "Víveres", "7460101000042", 195, 240, 8, 4],
    ["Espaguetis 1 lb", "Víveres", null, 38, 50, 40, 10],
    ["Salsa de tomate 8 oz", "Víveres", null, 22, 30, 36, 10],
    ["Refresco cola 2 L", "Bebidas", "7460202000017", 95, 120, 40, 10],
    ["Agua 1 galón", "Bebidas", null, 45, 60, 14, 10],
    ["Jugo de naranja 1 L", "Bebidas", null, 85, 110, 12, 5],
    ["Cerveza 12 oz", "Bebidas", null, 95, 125, 48, 24],
    ["Leche evaporada", "Lácteos y embutidos", null, 58, 72, 30, 12],
    ["Salami 1 lb", "Lácteos y embutidos", "7460303000019", 160, 195, 14, 5],
    ["Queso de freír 1 lb", "Lácteos y embutidos", null, 210, 260, 9, 4],
    ["Huevos (unidad)", "Lácteos y embutidos", null, 8, 11, 90, 30],
    ["Detergente en polvo 1 kg", "Limpieza", null, 140, 175, 15, 5],
    ["Cloro 1 galón", "Limpieza", null, 95, 125, 11, 4],
    ["Jabón de cuaba", "Limpieza", null, 30, 45, 4, 6],
    ["Pasta dental", "Higiene", null, 75, 95, 16, 5],
    ["Papel higiénico 4 rollos", "Higiene", null, 110, 140, 18, 6],
  ];
  for (const [nombre, cat, codigo, compra, venta, stock, minimo] of productos)
    db.productos.push({
      id: nextId(db),
      colmado_id: store.id,
      nombre,
      id_categoria: cats[cat],
      codigo_barras: codigo,
      precio_compra: compra,
      precio_venta: venta,
      stock,
      stock_minimo: minimo,
      activo: true,
    });

  const clientes: [string, string, number, boolean][] = [
    ["Doña Marta Rodríguez", "+18095551234", 3000, true],
    ["Juan Pérez", "+18295550198", 1500, true],
    ["Carmen Báez", "+18495557711", 2000, false],
    ["José Núñez", "+18095553390", 1000, true],
    ["Luisa Almonte", "+18295554420", 2500, true],
  ];
  for (const [nombre, telefono, limite, wa] of clientes)
    db.clientes.push({
      id: nextId(db),
      colmado_id: store.id,
      nombre,
      telefono,
      limite_credito: limite,
      saldo: 0,
      consentimiento_whatsapp: wa,
    });

  // Ventas de los últimos días, generadas con las mismas reglas de la caja.
  const pid = (name: string) => db.productos.find((p) => p["nombre"] === name)!["id"];
  const cid = (name: string) => db.clientes.find((c) => c["nombre"] === name)!["id"];
  const plan: [number, number, string, string | null, [string, number][]][] = [
    [6, 9, "efectivo", null, [["Arroz selecto 5 lb", 1], ["Aceite vegetal 32 oz", 1]]],
    [6, 13, "fiao", "Doña Marta Rodríguez", [["Arroz selecto 5 lb", 2], ["Salami 1 lb", 2], ["Leche evaporada", 3]]],
    [5, 10, "efectivo", null, [["Refresco cola 2 L", 2], ["Huevos (unidad)", 12]]],
    [5, 18, "transferencia", null, [["Cerveza 12 oz", 12]]],
    [4, 8, "fiao", "Juan Pérez", [["Café molido 1 lb", 1], ["Azúcar crema 2 lb", 2]]],
    [4, 16, "tarjeta", null, [["Detergente en polvo 1 kg", 1], ["Cloro 1 galón", 1], ["Papel higiénico 4 rollos", 1]]],
    [3, 11, "efectivo", null, [["Espaguetis 1 lb", 3], ["Salsa de tomate 8 oz", 3], ["Queso de freír 1 lb", 1]]],
    [3, 19, "fiao", "José Núñez", [["Arroz selecto 5 lb", 1], ["Habichuelas rojas 1 lb", 2], ["Aceite vegetal 32 oz", 1]]],
    [2, 9, "efectivo", null, [["Huevos (unidad)", 30], ["Leche evaporada", 2]]],
    [2, 17, "fiao", "Doña Marta Rodríguez", [["Refresco cola 2 L", 2], ["Salami 1 lb", 1], ["Jugo de naranja 1 L", 2]]],
    [1, 10, "efectivo", null, [["Agua 1 galón", 4], ["Pasta dental", 1]]],
    [1, 15, "fiao", "Luisa Almonte", [["Arroz selecto 5 lb", 2], ["Aceite vegetal 32 oz", 1], ["Habichuelas rojas 1 lb", 3]]],
    [0, 8, "efectivo", null, [["Café molido 1 lb", 1], ["Leche evaporada", 2], ["Huevos (unidad)", 6]]],
    [0, 9, "tarjeta", null, [["Cerveza 12 oz", 6], ["Refresco cola 2 L", 1]]],
  ];
  const now = Date.now();
  const at = (daysAgo: number, hour: number) => {
    const day = drDate(new Date(now - daysAgo * 86400000).toISOString());
    // La hora local dominicana es UTC-4.
    const iso = new Date(day + "T" + String(hour).padStart(2, "0") + ":15:00-04:00");
    return new Date(Math.min(iso.getTime(), now - 60000)).toISOString();
  };
  for (const [daysAgo, hour, metodo, cliente, items] of plan)
    registerSale(
      db,
      owner,
      {
        referencia: crypto.randomUUID(),
        metodo_pago: metodo,
        id_cliente: cliente ? cid(cliente) : null,
        detalles: items.map(([name, cantidad]) => ({ id_producto: pid(name), cantidad })),
      },
      at(daysAgo, hour),
    );

  // Algunos abonos: uno salda la deuda de José, otro abona parte de Marta.
  const debtOf = (name: string) => db.deudas.filter((d) => d["id_cliente"] === cid(name));
  registerPayment(db, owner, debtOf("José Núñez")[0]["id"], { referencia: crypto.randomUUID(), monto: debtOf("José Núñez")[0]["monto_total"] }, at(1, 12));
  registerPayment(db, owner, debtOf("Doña Marta Rodríguez")[0]["id"], { referencia: crypto.randomUUID(), monto: 500 }, at(0, 10));
  return db;
}
