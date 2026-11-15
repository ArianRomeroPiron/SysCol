import { Component, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

type Row = Record<string, any>;
type Tab =
  | "ventas"
  | "inventario"
  | "clientes"
  | "fiao"
  | "historial"
  | "reportes"
  | "equipo";
type CartLine = {
  id_producto: number;
  nombre: string;
  cantidad: number;
  precio: number;
  stock: number;
};
type Dialog =
  | { kind: "product" }
  | { kind: "stock"; product: Row }
  | { kind: "customer" }
  | { kind: "pay"; customer: Row }
  | { kind: "void"; sale: Row }
  | { kind: "employee" }
  | { kind: "staff"; employee: Row }
  | { kind: "password" }
  | { kind: "more" }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirm: string;
      danger?: boolean;
      action: () => Promise<void>;
    };

const SESSION_KEY = "syscol.session";
const FIELD_NAMES: Record<string, string> = {
  nombre: "Nombre",
  colmado: "Nombre del colmado",
  email: "Correo",
  password: "Contraseña",
  nueva: "Nueva contraseña",
  actual: "Contraseña actual",
  telefono: "Teléfono",
  limite_credito: "Límite de crédito",
  precio_compra: "Costo",
  precio_venta: "Precio",
  stock_minimo: "Alerta de poco stock",
  codigo_barras: "Código de barras",
  id_categoria: "Categoría",
  cantidad: "Cantidad",
  motivo: "Motivo",
  monto: "Monto",
};

export const NAV: {
  id: Tab;
  icon: string;
  label: string;
  title: string;
  role?: "manager" | "owner";
}[] = [
  { id: "ventas", icon: "🛒", label: "Vender", title: "Vender" },
  { id: "inventario", icon: "📦", label: "Inventario", title: "Inventario" },
  { id: "clientes", icon: "👥", label: "Clientes", title: "Clientes" },
  { id: "fiao", icon: "📒", label: "Fiao", title: "Fiao y abonos" },
  { id: "historial", icon: "🧾", label: "Ventas", title: "Ventas realizadas" },
  {
    id: "reportes",
    icon: "📊",
    label: "Reportes",
    title: "Así va tu negocio",
    role: "manager",
  },
  {
    id: "equipo",
    icon: "👔",
    label: "Equipo",
    title: "Tu equipo",
    role: "owner",
  },
];

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
  host: { "(document:keydown.escape)": "onEscape()" },
})
export class App {
  // Session and shell
  user = signal<Row | null>(null);
  restoring = signal(false);
  tab = signal<Tab>("ventas");
  busy = signal(false);
  loading = signal(false);
  error = signal("");
  notice = signal("");
  loginError = signal("");
  dialog = signal<Dialog | null>(null);
  dialogError = signal("");
  registering = false;
  showPassword = false;
  credentials = { nombre: "", colmado: "", email: "", password: "" };
  private token = "";
  private noticeTimer: any;

  isManager = computed(() => ["dueno", "admin"].includes(this.user()?.["rol"]));
  isOwner = computed(() => this.user()?.["rol"] === "dueno");
  nav = computed(() =>
    NAV.filter(
      (x) =>
        !x.role ||
        (x.role === "manager" && this.isManager()) ||
        (x.role === "owner" && this.isOwner()),
    ),
  );
  mainNav = computed(() => this.nav().slice(0, 4));
  moreNav = computed(() => this.nav().slice(4));
  current = computed(() => NAV.find((x) => x.id === this.tab())!);

  // Shared data
  products = signal<Row[]>([]);
  categories = signal<Row[]>([]);
  customers = signal<Row[]>([]);
  payments = signal<Row[]>([]);
  employees = signal<Row[]>([]);
  sales = signal<Row[]>([]);
  report = signal<Row | null>(null);
  creditSummary = signal<Row | null>(null);
  lowStockCount = signal(0);
  offset = signal(0);
  pageSize = 50;
  hasMore = signal(false);

  // Point of sale
  search = signal("");
  categoryFilter = signal<number | null>(null);
  cart = signal<CartLine[]>([]);
  method = signal<"efectivo" | "tarjeta" | "transferencia" | "fiao">(
    "efectivo",
  );
  received = signal<number | null>(null);
  selectedCustomer = signal<Row | null>(null);
  customerQuery = "";
  customerResults = signal<Row[]>([]);
  reference = this.uuid();
  receipt = signal<Row | null>(null);
  private searchTimer: any;
  private searchSeq = 0;
  private customerTimer: any;

  units = computed(() => this.cart().reduce((n, x) => n + x.cantidad, 0));
  total = computed(
    () =>
      this.cart().reduce(
        (sum, x) => sum + Math.round(x.precio * 100) * x.cantidad,
        0,
      ) / 100,
  );
  change = computed(() => {
    const got = Number(this.received() || 0);
    return got > 0 ? Math.round((got - this.total()) * 100) / 100 : null;
  });
  availableCredit = computed(() => {
    const c = this.selectedCustomer();
    return c ? Number(c["limite_credito"]) - Number(c["saldo"]) : 0;
  });
  cashOptions = computed(() => {
    const t = this.total();
    const bills = [50, 100, 200, 500, 1000, 2000];
    return bills.filter((b) => b > t).slice(0, 4);
  });
  canCheckout = computed(() => {
    if (!this.cart().length || this.busy()) return false;
    if (this.method() === "fiao")
      return (
        !!this.selectedCustomer() && this.availableCredit() >= this.total()
      );
    if (this.method() === "efectivo" && this.received())
      return (this.change() ?? 0) >= 0;
    return true;
  });

  // Inventory
  invSearch = "";
  invCategory: number | null = null;
  lowOnly = false;
  product: Row = this.newProduct();
  initialStock: number | null = null;
  newCategory = "";
  addingCategory = false;
  stockDirection: "in" | "out" = "in";
  stockQty: number | null = null;
  stockReason = "";
  movements = signal<Row[]>([]);
  readonly stockReasons = {
    in: ["Compra a suplidor", "Conteo físico", "Devolución de cliente"],
    out: ["Merma o daño", "Producto vencido", "Consumo propio", "Conteo físico"],
  };

  // Customers and credit
  customerSearch = "";
  customer: Row = this.newCustomer();
  debts = signal<Row[]>([]);
  paymentValues: Record<number, number | null> = {};
  private paymentRefs: Record<string, string> = {};

  // History, reports and team
  voidReason = "";
  readonly voidReasons = [
    "Error al cobrar",
    "El cliente devolvió todo",
    "Producto equivocado",
  ];
  from = this.today();
  to = this.today();
  preset = signal("hoy");
  employee = { nombre: "", email: "", password: "", rol: "cajero" };
  staffRole = "cajero";
  staffPassword = "";
  passwords = { actual: "", nueva: "", confirmar: "" };

  constructor() {
    this.restoreSession();
  }

  // ---------- helpers ----------
  newProduct(): Row {
    return {
      nombre: "",
      id_categoria: null,
      codigo_barras: "",
      precio_compra: null,
      precio_venta: null,
      stock_minimo: 5,
      activo: true,
    };
  }
  newCustomer(): Row {
    return {
      nombre: "",
      telefono: "",
      limite_credito: 0,
      consentimiento_whatsapp: false,
    };
  }
  today(offsetDays = 0) {
    const date = new Date(Date.now() + offsetDays * 86400000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
  uuid(): string {
    return crypto.randomUUID();
  }
  private moneyFormat = new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  });
  money(value: any) {
    return this.moneyFormat.format(Number(value || 0));
  }
  bill(value: number) {
    return "RD$" + value.toLocaleString("es-DO");
  }
  roleName(rol: string) {
    return (
      { dueno: "Dueño", admin: "Administrador", cajero: "Cajero" }[rol] || rol
    );
  }
  methodName(m: string) {
    return (
      {
        efectivo: "Efectivo",
        tarjeta: "Tarjeta",
        transferencia: "Transferencia",
        fiao: "Fiao",
      }[m] || m
    );
  }
  categoryName(id: number) {
    return this.categories().find((c) => c["id"] === id)?.["nombre"] || "—";
  }
  initials(name: string) {
    return (name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase();
  }
  /** Accepts 809-555-1234, (829) 555 1234 or +1 849… and returns +18095551234. */
  normalizePhone(value: string) {
    const raw = (value || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return "+" + digits;
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
    return raw;
  }
  formatPhone(value: string) {
    const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
    return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
  }
  margin(p: Row) {
    const cost = Number(p["precio_compra"] || 0);
    const price = Number(p["precio_venta"] || 0);
    return { value: price - cost, pct: price ? ((price - cost) / price) * 100 : 0 };
  }
  inCart(id: number) {
    return this.cart().find((x) => x.id_producto === id)?.cantidad || 0;
  }
  creditUse(c: Row) {
    const limit = Number(c["limite_credito"]);
    return limit > 0 ? Math.min(100, (Number(c["saldo"]) / limit) * 100) : 100;
  }

  // ---------- API ----------
  private describe(body: any, status: number) {
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail) && body.detail.length) {
      const first = body.detail[0];
      const field = FIELD_NAMES[first.loc?.[first.loc.length - 1]] || "Un dato";
      const type = String(first.type || "");
      if (type === "missing") return `${field} es obligatorio.`;
      if (type.includes("too_short"))
        return `${field} es muy corto${first.ctx?.min_length ? ` (mínimo ${first.ctx.min_length})` : ""}.`;
      if (type.includes("too_long")) return `${field} es demasiado largo.`;
      if (type.includes("pattern") && field === "Teléfono")
        return "Escribe el teléfono con 10 dígitos, por ejemplo 809-555-1234.";
      if (type.startsWith("greater_than")) return `${field} debe ser mayor.`;
      if (type.startsWith("less_than")) return `${field} es demasiado grande.`;
      return `${field} no es válido. Revísalo e intenta otra vez.`;
    }
    if (status === 429)
      return "Demasiados intentos. Espera un minuto y vuelve a probar.";
    if (status >= 500)
      return "El servidor tuvo un problema. Intenta otra vez en un momento.";
    return "No se pudo completar la operación.";
  }
  async api(path: string, method = "GET", data?: unknown): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    if (data !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await fetch("/api" + path, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    } catch {
      throw new Error(
        "Sin conexión con el servidor. Revisa el internet e intenta otra vez.",
      );
    }
    if (response.status === 401 && this.user()) {
      this.endSession(false);
      throw new Error("Tu sesión venció. Entra de nuevo para seguir.");
    }
    if (response.status === 204) return null;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(this.describe(body, response.status));
    return body;
  }
  async run(action: () => Promise<void>, inDialog = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.dialogError.set("");
    try {
      await action();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "No se pudo conectar. Intenta otra vez.";
      if (inDialog && this.dialog()) this.dialogError.set(message);
      else this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }
  say(message: string) {
    this.notice.set(message);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(""), 4000);
  }

  // ---------- session ----------
  /** The token lives in sessionStorage: it survives a reload but not closing the tab. */
  private store(key: string, value?: unknown) {
    try {
      if (value === undefined) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: the app still works, only without reload recovery */
    }
  }
  private read(key: string) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }
  private async restoreSession() {
    const saved = this.read(SESSION_KEY);
    if (!saved?.token) return;
    this.token = saved.token;
    this.restoring.set(true);
    try {
      const me = await this.api("/auth/me");
      this.user.set(me);
      this.restoreCart();
      const tab = NAV.some((x) => x.id === saved.tab) ? saved.tab : "ventas";
      this.tab.set(tab);
      await this.run(() => this.load());
    } catch {
      this.token = "";
      this.store(SESSION_KEY);
    } finally {
      this.restoring.set(false);
    }
  }
  private cartKey() {
    return "syscol.cart." + this.user()?.["id"];
  }
  saveCart() {
    if (!this.user()) return;
    this.store(
      this.cartKey(),
      this.cart().length
        ? {
            cart: this.cart(),
            method: this.method(),
            customer: this.selectedCustomer(),
            reference: this.reference,
          }
        : undefined,
    );
  }
  private restoreCart() {
    const draft = this.read(this.cartKey());
    if (!draft?.cart?.length) return;
    this.cart.set(draft.cart);
    this.method.set(draft.method || "efectivo");
    this.selectedCustomer.set(draft.customer || null);
    // Keeping the reference makes a retried sale idempotent on the server.
    this.reference = draft.reference || this.uuid();
  }
  async login() {
    this.loginError.set("");
    await this.run(async () => {
      try {
        if (this.registering)
          await this.api("/auth/register", "POST", this.credentials);
        const body = new URLSearchParams({
          username: this.credentials.email,
          password: this.credentials.password,
        });
        let response: Response;
        try {
          response = await fetch("/api/auth/login", { method: "POST", body });
        } catch {
          throw new Error("Sin conexión con el servidor.");
        }
        const result = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Correo o contraseña incorrectos."
              : this.describe(result, response.status),
          );
        this.token = result.access_token;
        this.user.set(await this.api("/auth/me"));
        this.store(SESSION_KEY, { token: this.token, tab: "ventas" });
        this.credentials.password = "";
        this.registering = false;
        this.restoreCart();
        this.tab.set("ventas");
        await this.load();
        if (this.cart().length)
          this.say("Recuperamos la venta que estaba en curso.");
      } catch (e) {
        this.loginError.set(e instanceof Error ? e.message : String(e));
      }
    });
  }
  logout() {
    this.dialog.set(null);
    if (this.cart().length) {
      this.dialog.set({
        kind: "confirm",
        title: "¿Cerrar sesión?",
        message:
          "Hay una venta sin registrar en el carrito. Si cierras sesión se descarta.",
        confirm: "Cerrar sesión",
        danger: true,
        action: async () => this.endSession(true),
      });
      return;
    }
    this.endSession(true);
  }
  /** explicit=false keeps the cart draft so the same user can finish it after signing in again. */
  endSession(explicit: boolean) {
    if (explicit) this.store(this.cartKey());
    this.store(SESSION_KEY);
    this.token = "";
    this.user.set(null);
    this.dialog.set(null);
    this.cart.set([]);
    this.receipt.set(null);
    this.products.set([]);
    this.customers.set([]);
    this.debts.set([]);
    this.sales.set([]);
    this.payments.set([]);
    this.report.set(null);
    this.employees.set([]);
    this.categories.set([]);
    this.selectedCustomer.set(null);
    this.received.set(null);
    this.method.set("efectivo");
    this.paymentValues = {};
    this.paymentRefs = {};
    this.reference = this.uuid();
    this.tab.set("ventas");
    if (!explicit) this.loginError.set("Tu sesión venció. Entra de nuevo.");
  }

  // ---------- navigation & loading ----------
  async navigate(tab: Tab) {
    if (this.busy()) return;
    this.dialog.set(null);
    this.tab.set(tab);
    this.offset.set(0);
    this.store(SESSION_KEY, { token: this.token, tab });
    window.scrollTo({ top: 0 });
    await this.run(() => this.load());
  }
  private query(extra: Record<string, any> = {}) {
    const params = new URLSearchParams({
      offset: String(this.offset()),
      limit: String(this.pageSize),
    });
    for (const [k, v] of Object.entries(extra))
      if (v !== null && v !== undefined && v !== "" && v !== false)
        params.set(k, String(v));
    return "?" + params.toString();
  }
  private page<T>(rows: T[]) {
    this.hasMore.set(rows.length === this.pageSize);
    return rows;
  }
  async load() {
    switch (this.tab()) {
      case "ventas":
        this.categories.set(await this.api("/categorias?limit=200"));
        await this.loadProducts();
        break;
      case "inventario":
        this.categories.set(await this.api("/categorias?limit=200"));
        await this.loadProducts();
        this.lowStockCount.set(
          (await this.api("/productos?bajo_stock=true&limit=200")).length,
        );
        break;
      case "clientes":
        this.customers.set(
          this.page(
            await this.api("/clientes" + this.query({ q: this.customerSearch })),
          ),
        );
        break;
      case "fiao":
        this.creditSummary.set(await this.api("/fiao/resumen"));
        this.customers.set(
          this.page(
            await this.api(
              "/clientes" +
                this.query({ q: this.customerSearch, con_deuda: true }),
            ),
          ),
        );
        this.payments.set(await this.api("/abonos?limit=10"));
        break;
      case "historial":
        this.sales.set(this.page(await this.api("/ventas" + this.query())));
        break;
      case "reportes":
        this.report.set(
          await this.api("/reportes?desde=" + this.from + "&hasta=" + this.to),
        );
        break;
      case "equipo":
        this.employees.set(await this.api("/auth/usuarios"));
        break;
    }
  }
  async loadProducts() {
    const seq = ++this.searchSeq;
    const pos = this.tab() === "ventas";
    const rows = await this.api(
      "/productos" +
        this.query(
          pos
            ? {
                q: this.search().trim(),
                id_categoria: this.categoryFilter(),
                activo: true,
              }
            : {
                q: this.invSearch.trim(),
                id_categoria: this.invCategory,
                bajo_stock: this.lowOnly,
              },
        ),
    );
    if (seq === this.searchSeq) this.products.set(this.page(rows));
    return rows as Row[];
  }
  async next(delta: number) {
    this.offset.set(Math.max(0, this.offset() + delta * this.pageSize));
    await this.run(() => this.load());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  /** Live search without blocking the rest of the screen. */
  queueSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      this.offset.set(0);
      this.loading.set(true);
      try {
        await this.loadProducts();
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : String(e));
      } finally {
        this.loading.set(false);
      }
    }, 250);
  }
  /** Debounced reload for list filters (customers, credit, inventory). */
  queueLoad() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      this.offset.set(0);
      this.loading.set(true);
      try {
        if (this.tab() === "inventario") await this.loadProducts();
        else await this.load();
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : String(e));
      } finally {
        this.loading.set(false);
      }
    }, 300);
  }
  async filterInventory() {
    this.offset.set(0);
    await this.run(async () => {
      await this.loadProducts();
    });
  }
  onEscape() {
    if (this.dialog()) this.close();
    else if (this.receipt()) this.receipt.set(null);
  }

  // ---------- point of sale ----------
  setCategory(id: number | null) {
    this.categoryFilter.set(id);
    this.offset.set(0);
    this.queueSearch();
  }
  /** Enter in the search box: a barcode scanner or exact match adds directly. */
  async scan(input: HTMLInputElement) {
    clearTimeout(this.searchTimer);
    const term = this.search().trim();
    if (!term) return;
    this.offset.set(0);
    try {
      const rows = await this.loadProducts();
      const exact =
        rows.find((p) => p["codigo_barras"] && p["codigo_barras"] === term) ||
        rows.find((p) => p["nombre"].toLowerCase() === term.toLowerCase()) ||
        (rows.length === 1 ? rows[0] : null);
      if (exact) {
        if (this.add(exact)) {
          this.search.set("");
          await this.loadProducts();
        }
      } else if (!rows.length) {
        this.error.set(`No encontramos «${term}».`);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
    input.focus();
  }
  add(p: Row): boolean {
    this.error.set("");
    if (!p["activo"] || p["stock"] < 1) {
      this.error.set(`${p["nombre"]} está agotado.`);
      return false;
    }
    const existing = this.cart().find((x) => x.id_producto === p["id"]);
    if (existing && existing.cantidad >= p["stock"]) {
      this.error.set(`Solo quedan ${p["stock"]} de ${p["nombre"]}.`);
      return false;
    }
    this.cart.update((rows) =>
      existing
        ? rows.map((x) =>
            x.id_producto === p["id"]
              ? { ...x, cantidad: x.cantidad + 1, stock: p["stock"] }
              : x,
          )
        : [
            ...rows,
            {
              id_producto: p["id"],
              nombre: p["nombre"],
              cantidad: 1,
              precio: Number(p["precio_venta"]),
              stock: p["stock"],
            },
          ],
    );
    this.saveCart();
    return true;
  }
  setQty(line: CartLine, qty: number) {
    qty = Math.floor(Number(qty) || 0);
    if (qty < 1) return this.remove(line.id_producto);
    if (qty > line.stock) {
      this.error.set(`Solo quedan ${line.stock} de ${line.nombre}.`);
      qty = line.stock;
    }
    this.cart.update((rows) =>
      rows.map((x) =>
        x.id_producto === line.id_producto ? { ...x, cantidad: qty } : x,
      ),
    );
    this.saveCart();
  }
  remove(id: number) {
    this.cart.update((rows) => rows.filter((x) => x.id_producto !== id));
    this.saveCart();
  }
  clearCart() {
    this.dialog.set({
      kind: "confirm",
      title: "¿Vaciar la venta?",
      message: "Se quitarán todos los productos del carrito.",
      confirm: "Vaciar",
      danger: true,
      action: async () => this.resetSale(),
    });
  }
  private resetSale() {
    this.cart.set([]);
    this.selectedCustomer.set(null);
    this.method.set("efectivo");
    this.received.set(null);
    this.customerQuery = "";
    this.customerResults.set([]);
    this.reference = this.uuid();
    this.saveCart();
  }
  setMethod(m: "efectivo" | "tarjeta" | "transferencia" | "fiao") {
    this.method.set(m);
    if (m !== "efectivo") this.received.set(null);
    this.saveCart();
  }
  queueCustomerSearch() {
    clearTimeout(this.customerTimer);
    const q = this.customerQuery.trim();
    if (!q) return this.customerResults.set([]);
    this.customerTimer = setTimeout(async () => {
      try {
        this.customerResults.set(
          await this.api("/clientes?limit=8&q=" + encodeURIComponent(q)),
        );
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    }, 250);
  }
  pickCustomer(c: Row | null) {
    this.selectedCustomer.set(c);
    this.customerQuery = "";
    this.customerResults.set([]);
    this.saveCart();
  }
  scrollToCart() {
    document
      .getElementById("cart")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async checkout() {
    await this.run(async () => {
      if (!this.cart().length) throw new Error("Agrega productos a la venta.");
      const customer = this.selectedCustomer();
      if (this.method() === "fiao" && !customer)
        throw new Error("Elige el cliente que se lleva fiao.");
      const sale = await this.api("/ventas", "POST", {
        referencia: this.reference,
        id_cliente: customer?.["id"] ?? null,
        metodo_pago: this.method(),
        detalles: this.cart().map((x) => ({
          id_producto: x.id_producto,
          cantidad: x.cantidad,
        })),
      });
      const paidWith =
        this.method() === "efectivo" && this.received()
          ? { recibido: this.received(), devuelta: this.change() }
          : {};
      this.receipt.set({ ...sale, ...paidWith });
      this.resetSale();
      await this.loadProducts();
    });
  }
  newSale() {
    this.receipt.set(null);
    setTimeout(() => document.getElementById("pos-search")?.focus());
  }

  // ---------- dialogs ----------
  open(d: Dialog) {
    this.dialogError.set("");
    this.dialog.set(d);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        ".modal [autofocus], .modal input:not([type=checkbox]), .modal select, .modal button",
      );
      el?.focus();
    });
  }
  close() {
    if (!this.busy()) this.dialog.set(null);
  }
  async confirmAction(action: () => Promise<void>) {
    await this.run(async () => {
      await action();
      if (this.dialog()?.kind === "confirm") this.dialog.set(null);
    }, true);
  }

  // ---------- inventory ----------
  editProduct(p?: Row) {
    this.product = p
      ? { ...p, codigo_barras: p["codigo_barras"] || "" }
      : this.newProduct();
    if (!p && this.invCategory) this.product["id_categoria"] = this.invCategory;
    this.initialStock = null;
    this.addingCategory = !this.categories().length;
    this.newCategory = "";
    this.open({ kind: "product" });
  }
  async saveCategory() {
    await this.run(async () => {
      const name = this.newCategory.trim();
      if (!name) throw new Error("Escribe el nombre de la categoría.");
      const created = await this.api("/categorias", "POST", { nombre: name });
      this.categories.set(await this.api("/categorias?limit=200"));
      this.product["id_categoria"] = created.id;
      this.newCategory = "";
      this.addingCategory = false;
      this.say(`Categoría «${name}» creada.`);
    }, true);
  }
  async saveProduct() {
    await this.run(async () => {
      const { id, stock, colmado_id, ...data } = this.product;
      if (!data["id_categoria"]) throw new Error("Elige una categoría.");
      data["codigo_barras"] = (data["codigo_barras"] || "").trim() || null;
      const saved = await this.api(
        "/productos" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        data,
      );
      if (!id && Number(this.initialStock) > 0)
        await this.api("/productos/" + saved.id + "/stock", "POST", {
          cantidad: Number(this.initialStock),
          motivo: "Compra inicial",
        });
      this.dialog.set(null);
      await this.loadProducts();
      this.say(id ? "Producto actualizado." : `${saved.nombre} agregado.`);
    }, true);
  }
  async openStock(p: Row) {
    this.stockDirection = "in";
    this.stockQty = null;
    this.stockReason = "";
    this.movements.set([]);
    this.open({ kind: "stock", product: p });
    try {
      this.movements.set(
        await this.api("/movimientos?limit=8&producto_id=" + p["id"]),
      );
    } catch {
      /* history is optional */
    }
  }
  stockResult(p: Row) {
    const qty = Number(this.stockQty || 0);
    return p["stock"] + (this.stockDirection === "in" ? qty : -qty);
  }
  async adjust(p: Row) {
    await this.run(async () => {
      const qty = Math.floor(Number(this.stockQty || 0));
      if (qty < 1) throw new Error("Escribe cuántas unidades.");
      if (this.stockReason.trim().length < 3)
        throw new Error("Escribe o elige el motivo.");
      await this.api("/productos/" + p["id"] + "/stock", "POST", {
        cantidad: this.stockDirection === "in" ? qty : -qty,
        motivo: this.stockReason.trim(),
      });
      this.dialog.set(null);
      await this.load();
      this.say(
        `${this.stockDirection === "in" ? "Entrada" : "Salida"} de ${qty} registrada.`,
      );
    }, true);
  }

  // ---------- customers ----------
  editCustomer(c?: Row) {
    this.customer = c
      ? { ...c, telefono: this.formatPhone(c["telefono"]) }
      : this.newCustomer();
    this.open({ kind: "customer" });
  }
  async saveCustomer() {
    await this.run(async () => {
      const { id, saldo, colmado_id, ...data } = this.customer;
      data["telefono"] = this.normalizePhone(data["telefono"]);
      if (!/^\+[1-9]\d{7,14}$/.test(data["telefono"]))
        throw new Error(
          "Escribe el teléfono con 10 dígitos, por ejemplo 809-555-1234.",
        );
      const saved = await this.api(
        "/clientes" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        data,
      );
      this.dialog.set(null);
      if (this.tab() === "ventas") this.pickCustomer(saved);
      else await this.load();
      this.say(id ? "Cliente actualizado." : `${saved.nombre} agregado.`);
    }, true);
  }
  newCustomerFromSale() {
    this.customer = this.newCustomer();
    this.customer["nombre"] = this.customerQuery.trim();
    this.customerResults.set([]);
    this.open({ kind: "customer" });
  }
  async whatsapp(c: Row) {
    await this.run(async () => {
      const result = await this.api("/whatsapp/" + c["id"]);
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) this.say("Mensaje: " + result.mensaje);
      else this.say("WhatsApp abierto. Confirma el envío allí.");
    });
  }

  // ---------- credit ----------
  async openPay(c: Row) {
    this.paymentValues = {};
    this.debts.set([]);
    this.open({ kind: "pay", customer: c });
    await this.run(async () => {
      this.debts.set(
        await this.api(
          "/deudas?pendientes=true&limit=200&id_cliente=" + c["id"],
        ),
      );
    }, true);
  }
  async pay(d: Row, all = false) {
    await this.run(async () => {
      const id = d["id"];
      const amount = all ? Number(d["saldo_pendiente"]) : this.paymentValues[id];
      if (!amount || amount <= 0) throw new Error("Escribe el monto del abono.");
      if (amount > Number(d["saldo_pendiente"]))
        throw new Error(
          "El abono es mayor que lo pendiente de esa venta (" +
            this.money(d["saldo_pendiente"]) +
            ").",
        );
      // One reference per debt and amount: a retry is safe and a new amount is a new payment.
      const key = id + ":" + amount;
      this.paymentRefs[key] ||= this.uuid();
      await this.api("/deudas/" + id + "/abonos", "POST", {
        referencia: this.paymentRefs[key],
        monto: amount,
      });
      delete this.paymentRefs[key];
      this.paymentValues[id] = null;
      const dlg = this.dialog();
      if (dlg?.kind === "pay") {
        const debts = await this.api(
          "/deudas?pendientes=true&limit=200&id_cliente=" + dlg.customer["id"],
        );
        this.debts.set(debts);
        const balance = debts.reduce(
          (s: number, x: Row) => s + Number(x["saldo_pendiente"]),
          0,
        );
        this.dialog.set({ kind: "pay", customer: { ...dlg.customer, saldo: balance } });
        if (!debts.length) this.dialog.set(null);
      }
      await this.load();
      this.say(`Abono de ${this.money(amount)} registrado.`);
    }, true);
  }

  // ---------- history ----------
  openVoid(s: Row) {
    this.voidReason = "";
    this.open({ kind: "void", sale: s });
  }
  async voidSale(s: Row) {
    await this.run(async () => {
      if (this.voidReason.trim().length < 3)
        throw new Error("Escribe o elige el motivo de la anulación.");
      const updated = await this.api("/ventas/" + s["id"] + "/anular", "POST", {
        motivo: this.voidReason.trim(),
      });
      this.dialog.set(null);
      this.sales.update((rows) =>
        rows.map((x) => (x["id"] === updated.id ? updated : x)),
      );
      this.say(`Venta #${updated.id} anulada. Las existencias volvieron al inventario.`);
    }, true);
  }

  // ---------- reports ----------
  setPreset(p: string) {
    this.preset.set(p);
    if (p === "hoy") this.from = this.to = this.today();
    if (p === "ayer") this.from = this.to = this.today(-1);
    if (p === "7") {
      this.from = this.today(-6);
      this.to = this.today();
    }
    if (p === "mes") {
      this.to = this.today();
      this.from = this.to.slice(0, 8) + "01";
    }
    this.run(() => this.load());
  }
  methodShare(total: any) {
    const all = Number(this.report()?.["total"] || 0);
    return all ? Math.round((Number(total) / all) * 100) : 0;
  }
  average() {
    const r = this.report();
    return r && r["ventas"] ? Number(r["total"]) / r["ventas"] : 0;
  }

  // ---------- team ----------
  async saveEmployee() {
    await this.run(async () => {
      await this.api("/auth/usuarios", "POST", this.employee);
      const name = this.employee.nombre;
      this.employee = { nombre: "", email: "", password: "", rol: "cajero" };
      this.dialog.set(null);
      await this.load();
      this.say(`${name} ya puede entrar con su correo.`);
    }, true);
  }
  editStaff(e: Row) {
    this.staffRole = e["rol"];
    this.staffPassword = "";
    this.open({ kind: "staff", employee: e });
  }
  async saveStaff(e: Row) {
    await this.run(async () => {
      const data: Row = {};
      if (this.staffRole !== e["rol"]) data["rol"] = this.staffRole;
      if (this.staffPassword) data["password"] = this.staffPassword;
      if (!Object.keys(data).length) throw new Error("No hay cambios.");
      await this.api("/auth/usuarios/" + e["id"], "PATCH", data);
      this.dialog.set(null);
      await this.load();
      this.say("Cambios guardados para " + e["nombre"] + ".");
    }, true);
  }
  toggle(e: Row) {
    const activate = !e["esta_activo"];
    this.open({
      kind: "confirm",
      title: activate ? `¿Activar a ${e["nombre"]}?` : `¿Desactivar a ${e["nombre"]}?`,
      message: activate
        ? "Podrá volver a entrar con su correo y contraseña."
        : "No podrá entrar ni registrar ventas. Su historial se conserva y puedes activarlo después.",
      confirm: activate ? "Activar" : "Desactivar",
      danger: !activate,
      action: async () => {
        await this.api(
          "/auth/usuarios/" + e["id"] + "/estado?activo=" + activate,
          "PATCH",
        );
        await this.load();
      },
    });
  }
  async changePassword() {
    await this.run(async () => {
      if (this.passwords.nueva !== this.passwords.confirmar)
        throw new Error("Las contraseñas nuevas no coinciden.");
      await this.api("/auth/password", "POST", {
        actual: this.passwords.actual,
        nueva: this.passwords.nueva,
      });
      this.passwords = { actual: "", nueva: "", confirmar: "" };
      this.dialog.set(null);
      this.say("Contraseña actualizada.");
    }, true);
  }

  print() {
    window.print();
  }
}
