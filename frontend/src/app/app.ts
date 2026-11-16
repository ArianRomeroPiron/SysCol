import { Component, OnDestroy, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  DEMO,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  resetDemo,
  send,
} from "./transport";

type Row = Record<string, any>;
@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
})
export class App implements OnDestroy {
  user = signal<Row | null>(null);
  tab = signal("ventas");
  busy = signal(false);
  error = signal("");
  notice = signal("");
  registering = false;
  /** Versión de prueba: la API y los datos viven en este navegador. */
  readonly demo = DEMO;
  credentials = { nombre: "", colmado: "", email: "", password: "" };
  products = signal<Row[]>([]);
  categories = signal<Row[]>([]);
  customers = signal<Row[]>([]);
  debts = signal<Row[]>([]);
  payments = signal<Row[]>([]);
  employees = signal<Row[]>([]);
  sales = signal<Row[]>([]);
  report = signal<Row | null>(null);
  cart = signal<
    { id_producto: number; nombre: string; cantidad: number; precio: number }[]
  >([]);
  total = computed(
    () =>
      this.cart().reduce(
        (sum, x) => sum + Math.round(x.precio * 100) * x.cantidad,
        0,
      ) / 100,
  );
  isManager = computed(() => ["dueno", "admin"].includes(this.user()?.["rol"]));
  product: Row = this.newProduct();
  customer: Row = this.newCustomer();
  employee = { nombre: "", email: "", password: "", rol: "cajero" };
  category = "";
  search = "";
  customerSearch = "";
  /** Clientes encontrados por la última búsqueda en el punto de venta. */
  customerMatches = signal<number | null>(null);
  async findCustomers() {
    await this.run(async () => {
      const found: Row[] = await this.api(
        "/clientes?limit=200&q=" + encodeURIComponent(this.customerSearch),
      );
      this.customers.set(found);
      const q = this.customerSearch.trim();
      this.customerMatches.set(q ? found.length : null);
      if (q && found.length === 1) this.customerId = found[0]["id"];
      else if (!found.some((c) => c["id"] === this.customerId))
        this.customerId = null;
    });
  }
  offset = 0;
  paymentsOffset = 0;
  pageSize = 50;
  /** Último término buscado, para explicar resultados vacíos. */
  searched = signal("");
  customerId: number | null = null;
  method = "efectivo";
  reference = this.uuid();
  paymentRefs: Record<number, string> = {};
  paymentValues: Record<number, number> = {};
  stockValues: Record<number, number> = {};
  stockReasons: Record<number, string> = {};
  from = this.today();
  to = this.today();
  receipt = signal<Row | null>(null);
  private token = "";

  /** Trazos de iconos (24×24, estilo línea) dibujados en el propio SVG. */
  readonly icons: Record<string, string> = {
    store:
      "M2 7l4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4M2 7h20M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-.9 2.7 2.7 0 0 1-2 .9 2.7 2.7 0 0 1-2-.9 2.7 2.7 0 0 1-2 .9 2.7 2.7 0 0 1-2-.9 2.7 2.7 0 0 1-2 .9 2.7 2.7 0 0 1-2-.9A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",
    ventas:
      "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11",
    inventario:
      "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15",
    clientes:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    fiao: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4M21.38 5.63a1 1 0 1 0-3-3l-5.02 5a2 2 0 0 0-.5.86l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .86-.5z",
    historial: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
    reportes: "M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3",
    equipo:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M19 8v6M22 11h-6",
    search: "M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0M21 21l-4.3-4.3",
    plus: "M5 12h14M12 5v14",
    x: "M18 6 6 18M6 6l12 12",
    logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
    chat: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
    print:
      "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6M6 14h12v8H6z",
    arrow: "M5 12h14M12 5l7 7-7 7",
    left: "m15 18-6-6 6-6",
    right: "m9 18 6-6-6-6",
    edit: "M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z",
    alert:
      "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    check: "M20 6 9 17l-5-5",
    fiscal:
      "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M9 15l2 2 4-4",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  };

  readonly sections: Record<string, { title: string; desc: string }> = {
    ventas: {
      title: "Una nueva venta",
      desc: "Busca el producto, agrégalo a la cuenta y cobra.",
    },
    inventario: {
      title: "Tu inventario",
      desc: "Lo que hay en el colmado, a qué precio y cuándo reponer.",
    },
    clientes: {
      title: "Tus clientes",
      desc: "La gente del barrio, su límite de fiao y lo que deben.",
    },
    fiao: {
      title: "Fiao y abonos",
      desc: "Registra abonos parciales o salda una deuda. Los recordatorios se envían manualmente desde Clientes.",
    },
    historial: {
      title: "Historial de ventas",
      desc: "Cada venta registrada, con su recibo listo para imprimir.",
    },
    reportes: {
      title: "Así va tu negocio",
      desc: "Ventas, total vendido y fiao pendiente del período que elijas.",
    },
    fiscal: {
      title: "Facturación electrónica",
      desc: "Prepara tu colmado para emitir comprobantes fiscales electrónicos (e-CF) ante la DGII.",
    },
    equipo: {
      title: "Tu equipo",
      desc: "Quién trabaja contigo y qué puede hacer en SysCol.",
    },
  };

  nav = computed(() => {
    const items = [
      { id: "ventas", label: "Punto de venta", short: "Vender" },
      { id: "inventario", label: "Inventario", short: "Inventario" },
      { id: "clientes", label: "Clientes", short: "Clientes" },
      { id: "fiao", label: "Fiao y abonos", short: "Fiao" },
      { id: "historial", label: "Historial de ventas", short: "Historial" },
    ];
    if (this.isManager())
      items.push(
        { id: "reportes", label: "Reportes", short: "Reportes" },
        { id: "fiscal", label: "Facturación", short: "e-CF" },
      );
    if (this.user()?.["rol"] === "dueno")
      items.push({ id: "equipo", label: "Mi equipo", short: "Equipo" });
    return items;
  });

  cartUnits = computed(() =>
    this.cart().reduce((sum, x) => sum + x.cantidad, 0),
  );

  readonly methods: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    fiao: "Fiao",
  };
  readonly roles: Record<string, string> = {
    dueno: "Dueño",
    admin: "Administrador",
    cajero: "Cajero",
  };

  categoryName(id: number) {
    return this.categories().find((c) => c["id"] === id)?.["nombre"] || "";
  }
  initial(text: string) {
    return (text || "?").trim().charAt(0).toUpperCase();
  }
  /** Tono estable por categoría para reconocer los productos de un vistazo. */
  tint(id: number) {
    return "tint-" + (Math.abs(Number(id) || 0) % 6);
  }
  percent(part: any, whole: any) {
    const w = Number(whole) || 0;
    if (w <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((Number(part) / w) * 100)));
  }
  qtyInCart(id: number) {
    return this.cart().find((x) => x.id_producto === id)?.cantidad || 0;
  }

  newProduct(): Row {
    return {
      nombre: "",
      id_categoria: null,
      codigo_barras: null,
      precio_compra: 0,
      precio_venta: 0,
      stock_minimo: 5,
      activo: true,
      tasa_itbis: 18,
    };
  }
  newCustomer(): Row {
    return {
      nombre: "",
      telefono: "+1809",
      limite_credito: 0,
      consentimiento_whatsapp: false,
      rnc: "",
      razon_social: "",
    };
  }
  today() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santo_Domingo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  uuid(): string {
    return crypto.randomUUID();
  }
  money(value: any) {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(Number(value || 0));
  }
  async api(path: string, method = "GET", data?: unknown): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    if (data !== undefined) headers["Content-Type"] = "application/json";
    const response = await send("/api" + path, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (response.status === 401 && this.user()) this.logout();
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        typeof body.detail === "string"
          ? body.detail
          : "Revisa los datos del formulario.",
      );
    return body;
  }
  async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await action();
    } catch (e) {
      this.error.set(
        e instanceof Error
          ? e.message
          : "No se pudo conectar. Intenta otra vez.",
      );
    } finally {
      this.busy.set(false);
    }
  }
  async login() {
    await this.run(async () => {
      if (this.registering)
        await this.api("/auth/register", "POST", this.credentials);
      const body = new URLSearchParams({
        username: this.credentials.email,
        password: this.credentials.password,
      });
      const response = await send("/api/auth/login", { method: "POST", body });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.detail || "No se pudo iniciar sesión");
      this.token = result.access_token;
      this.user.set(await this.api("/auth/me"));
      this.credentials.password = "";
      await this.load();
      void this.loadStore();
      this.startAutoRefresh();
    });
  }
  async useDemoAccount() {
    this.registering = false;
    this.credentials.email = DEMO_EMAIL;
    this.credentials.password = DEMO_PASSWORD;
    await this.login();
  }
  restartDemo() {
    if (
      !confirm(
        "¿Borrar todo lo que registraste y volver a los datos de ejemplo?",
      )
    )
      return;
    resetDemo();
    this.logout();
    this.notice.set("La demo volvió a los datos de ejemplo.");
  }
  logout() {
    this.stopAutoRefresh();
    clearTimeout(this.searchTimer);
    this.token = "";
    this.user.set(null);
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
    this.product = this.newProduct();
    this.customer = this.newCustomer();
    this.employee = { nombre: "", email: "", password: "", rol: "cajero" };
    this.customerId = null;
    this.paymentValues = {};
    this.paymentRefs = {};
    this.stockValues = {};
    this.stockReasons = {};
    this.reference = this.uuid();
    this.store.set(null);
    this.fiscal.set(null);
    this.fiscalForm = this.fiscalFrom(null);
    this.fiscalDirty = false;
    this.offset = 0;
    this.paymentsOffset = 0;
    this.search = "";
    this.customerSearch = "";
    this.searched.set("");
    this.customerMatches.set(null);
    this.tab.set("ventas");
  }
  async navigate(tab: string) {
    if (this.busy()) return;
    clearTimeout(this.searchTimer);
    this.tab.set(tab);
    this.offset = 0;
    this.paymentsOffset = 0;
    this.search = "";
    this.customerSearch = "";
    this.searched.set("");
    this.customerMatches.set(null);
    await this.run(() => this.load());
  }
  async load() {
    const query = "?offset=" + this.offset + "&limit=" + this.pageSize;
    switch (this.tab()) {
      case "ventas":
      case "inventario":
        this.products.set(
          await this.api(
            "/productos" + query + "&q=" + encodeURIComponent(this.search),
          ),
        );
        this.searched.set(this.search.trim());
        this.categories.set(await this.api("/categorias?limit=200"));
        if (this.tab() === "ventas")
          this.customers.set(
            await this.api(
              "/clientes?limit=200&q=" +
                encodeURIComponent(this.customerSearch),
            ),
          );
        break;
      case "clientes":
        this.customers.set(
          await this.api(
            "/clientes" +
              query +
              "&q=" +
              encodeURIComponent(this.customerSearch),
          ),
        );
        this.searched.set(this.customerSearch.trim());
        break;
      case "fiao":
        this.debts.set(await this.api("/deudas" + query));
        this.payments.set(
          await this.api(
            "/abonos?offset=" +
              this.paymentsOffset +
              "&limit=" +
              this.pageSize,
          ),
        );
        this.customers.set(await this.api("/clientes?limit=200"));
        break;
      case "historial":
        this.sales.set(await this.api("/ventas" + query));
        break;
      case "reportes":
        this.report.set(
          await this.api("/reportes?desde=" + this.from + "&hasta=" + this.to),
        );
        break;
      case "equipo":
        this.employees.set(await this.api("/auth/usuarios"));
        break;
      case "fiscal": {
        const store = await this.api("/colmado");
        this.store.set(store);
        if (!this.fiscalDirty) this.fiscalForm = this.fiscalFrom(store);
        this.fiscal.set(await this.api("/fiscal/resumen"));
        break;
      }
    }
  }
  async next(delta: number) {
    this.offset = Math.max(0, this.offset + delta * this.pageSize);
    await this.run(() => this.load());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async nextPayments(delta: number) {
    this.paymentsOffset = Math.max(
      0,
      this.paymentsOffset + delta * this.pageSize,
    );
    await this.run(() => this.load());
  }
  /** Una página llena indica que puede haber más registros después. */
  hasMore(rows: Row[]) {
    return rows.length >= this.pageSize;
  }

  // Búsqueda mientras se escribe
  private searchTimer?: ReturnType<typeof setTimeout>;
  searchSoon(action: "lista" | "clientesVenta" = "lista") {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      if (this.busy()) return this.searchSoon(action);
      if (action === "clientesVenta") void this.findCustomers();
      else void this.searchNow();
    }, 300);
  }
  async searchNow() {
    clearTimeout(this.searchTimer);
    this.offset = 0;
    await this.run(() => this.load());
  }
  clearSearch(field: "search" | "customerSearch") {
    this[field] = "";
    if (field === "customerSearch" && this.tab() === "ventas")
      void this.findCustomers();
    else void this.searchNow();
  }

  // Actualización automática: otros dispositivos (cajero, dueño) ven lo mismo.
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshing = false;
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };
  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => void this.refresh(), 20000);
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("focus", this.onVisible);
  }
  stopAutoRefresh() {
    clearInterval(this.refreshTimer);
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("focus", this.onVisible);
  }
  /** Recarga en silencio la sección actual, sin interrumpir lo que se hace. */
  async refresh() {
    if (
      !this.user() ||
      this.busy() ||
      this.refreshing ||
      this.receipt() ||
      document.visibilityState !== "visible"
    )
      return;
    this.refreshing = true;
    try {
      await this.load();
    } catch {
      // Silencioso: el próximo intento o la próxima acción mostrará el error.
    } finally {
      this.refreshing = false;
    }
  }
  ngOnDestroy() {
    this.stopAutoRefresh();
    clearTimeout(this.searchTimer);
  }
  /** Lleva el formulario a la vista para editar. */
  editProduct(p: Row) {
    this.product = { ...p };
    this.focusForm("product-form");
  }
  editCustomer(c: Row) {
    this.customer = { ...c };
    this.focusForm("customer-form");
  }
  private focusForm(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector<HTMLInputElement>("input")?.focus({
        preventScroll: true,
      });
    });
  }
  add(p: Row) {
    if (!p["activo"] || p["stock"] < 1) return;
    const existing = this.cart().find((x) => x.id_producto === p["id"]);
    if (existing && existing.cantidad >= p["stock"]) {
      this.error.set("No hay más existencias disponibles.");
      return;
    }
    this.cart.update((rows) =>
      existing
        ? rows.map((x) =>
            x.id_producto === p["id"] ? { ...x, cantidad: x.cantidad + 1 } : x,
          )
        : [
            ...rows,
            {
              id_producto: p["id"],
              nombre: p["nombre"],
              cantidad: 1,
              precio: Number(p["precio_venta"]),
            },
          ],
    );
  }
  remove(id: number) {
    this.cart.update((rows) => rows.filter((x) => x.id_producto !== id));
  }
  async checkout() {
    await this.run(async () => {
      if (!this.cart().length) throw new Error("Agrega productos a la venta.");
      if (this.method === "fiao" && !this.customerId)
        throw new Error("Selecciona el cliente del fiao.");
      const sale = await this.api("/ventas", "POST", {
        referencia: this.reference,
        id_cliente: this.customerId,
        metodo_pago: this.method,
        detalles: this.cart().map((x) => ({
          id_producto: x.id_producto,
          cantidad: x.cantidad,
        })),
      });
      this.receipt.set(sale);
      this.cart.set([]);
      this.reference = this.uuid();
      this.notice.set("Venta registrada correctamente.");
      await this.load();
    });
  }
  async saveProduct() {
    await this.run(async () => {
      const { id, stock, colmado_id, ...data } = this.product;
      await this.api(
        "/productos" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        data,
      );
      this.product = this.newProduct();
      await this.load();
      this.notice.set("Producto guardado.");
    });
  }
  async saveCategory() {
    await this.run(async () => {
      const nombre = this.category.trim();
      await this.api("/categorias", "POST", { nombre });
      this.category = "";
      await this.load();
      this.notice.set("Categoría «" + nombre + "» agregada.");
    });
  }
  async adjust(p: Row) {
    await this.run(async () => {
      await this.api("/productos/" + p["id"] + "/stock", "POST", {
        cantidad: Number(this.stockValues[p["id"]]),
        motivo: this.stockReasons[p["id"]] || "",
      });
      delete this.stockValues[p["id"]];
      delete this.stockReasons[p["id"]];
      await this.load();
      this.notice.set("Ajuste registrado.");
    });
  }
  async saveCustomer() {
    await this.run(async () => {
      const { id, saldo, colmado_id, ...data } = this.customer;
      await this.api(
        "/clientes" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        data,
      );
      this.customer = this.newCustomer();
      await this.load();
      this.notice.set("Cliente guardado.");
    });
  }
  customerName(id: number) {
    return (
      this.customers().find((x) => x["id"] === id)?.["nombre"] ||
      "Cliente #" + id
    );
  }
  async pay(d: Row) {
    await this.run(async () => {
      const id = d["id"];
      this.paymentRefs[id] ||= this.uuid();
      await this.api("/deudas/" + id + "/abonos", "POST", {
        referencia: this.paymentRefs[id],
        monto: this.paymentValues[id],
      });
      delete this.paymentRefs[id];
      delete this.paymentValues[id];
      await this.load();
      this.notice.set("Abono registrado.");
    });
  }
  async whatsapp(c: Row) {
    await this.run(async () => {
      const result = await this.api("/whatsapp/" + c["id"]);
      this.notice.set(result.mensaje);
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }
  async saveEmployee() {
    await this.run(async () => {
      await this.api("/auth/usuarios", "POST", this.employee);
      this.employee = { nombre: "", email: "", password: "", rol: "cajero" };
      await this.load();
      this.notice.set("Empleado creado.");
    });
  }
  async toggle(e: Row) {
    await this.run(async () => {
      await this.api(
        "/auth/usuarios/" + e["id"] + "/estado?activo=" + !e["esta_activo"],
        "PATCH",
      );
      await this.load();
      this.notice.set(
        e["nombre"] + (e["esta_activo"] ? " fue desactivado." : " fue activado."),
      );
    });
  }
  print() {
    window.print();
  }

  // ---------- Facturación electrónica ----------
  /** Datos del colmado (nombre y datos fiscales) para recibos y e-CF. */
  store = signal<Row | null>(null);
  fiscal = signal<Row | null>(null);
  fiscalForm: Row = this.fiscalFrom(null);
  /** Evita que la recarga automática pise lo que se está escribiendo. */
  fiscalDirty = false;
  exportFrom = this.monthStart();
  exportTo = this.today();
  readonly tasas = [
    { value: 18, label: "18 % (tasa general)" },
    { value: 16, label: "16 % (tasa reducida)" },
    { value: 0, label: "Exento" },
  ];
  readonly pasosFe = [
    {
      id: "rnc",
      title: "Inscribe el colmado en el RNC",
      desc: "Necesitas estar en el Registro Nacional de Contribuyentes, como persona física o empresa.",
    },
    {
      id: "oficina_virtual",
      title: "Activa la Oficina Virtual (OFV)",
      desc: "Con la clave de la OFV haces las solicitudes a la DGII desde dgii.gov.do.",
    },
    {
      id: "modalidad",
      title: "Elige cómo vas a emitir",
      desc: "Facturador Gratuito de la DGII si emites hasta 150 facturas al mes; si emites más, un proveedor autorizado.",
    },
    {
      id: "solicitud",
      title: "Solicita ser emisor electrónico",
      desc: "Haz la solicitud en la OFV o en una administración local de la DGII.",
    },
    {
      id: "certificado",
      title: "Obtén el certificado digital",
      desc: "Lo exige la DGII para firmar los e-CF; tu proveedor te indica cómo usarlo.",
    },
    {
      id: "pruebas",
      title: "Completa la certificación y empieza a emitir",
      desc: "Pasa las pruebas que pide la DGII y entrega e-CF en cada venta.",
    },
  ];
  fiscalFrom(store: Row | null): Row {
    return {
      rnc: store?.["rnc"] || "",
      razon_social: store?.["razon_social"] || "",
      direccion: store?.["direccion"] || "",
      pasos_fe: [...(store?.["pasos_fe"] || [])],
    };
  }
  monthStart() {
    return this.today().slice(0, 8) + "01";
  }
  stepDone(id: string) {
    return (this.fiscalForm["pasos_fe"] as string[]).includes(id);
  }
  toggleStep(id: string, done: boolean) {
    const steps = (this.fiscalForm["pasos_fe"] as string[]).filter(
      (x) => x !== id,
    );
    this.fiscalForm["pasos_fe"] = done ? [...steps, id] : steps;
    void this.saveFiscal(true);
  }
  stepsDone() {
    return this.pasosFe.filter((p) => this.stepDone(p.id)).length;
  }
  async saveFiscal(quiet = false) {
    await this.run(async () => {
      const store = await this.api("/colmado", "PUT", this.fiscalForm);
      this.store.set(store);
      this.fiscalForm = this.fiscalFrom(store);
      this.fiscalDirty = false;
      if (!quiet) this.notice.set("Datos fiscales guardados.");
    });
  }
  async loadStore() {
    try {
      this.store.set(await this.api("/colmado"));
    } catch {
      // El recibo funciona sin datos fiscales.
    }
  }
  /** Línea del recibo: base e ITBIS incluidos en el total. */
  receiptTax(r: Row) {
    const itbis = Number(r["impuesto"] || 0);
    return { itbis, base: Number(r["total"] || 0) - itbis };
  }
  taxLabel(rate: any) {
    return rate === null || rate === undefined
      ? "Sin registrar"
      : Number(rate) === 0
        ? "Exento"
        : rate + " %";
  }
  async exportSales() {
    await this.run(async () => {
      const response = await send(
        "/api/ventas/exportar?desde=" + this.exportFrom + "&hasta=" + this.exportTo,
        { headers: { Authorization: "Bearer " + this.token } },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "No se pudo exportar. Revisa las fechas.",
        );
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download =
        "syscol-ventas-" + this.exportFrom + "-" + this.exportTo + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      this.notice.set("Ventas exportadas en CSV.");
    });
  }
}
