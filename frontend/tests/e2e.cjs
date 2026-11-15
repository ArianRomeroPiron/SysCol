// Recorrido completo en navegador: dueño nuevo, inventario, clientes, venta en efectivo
// con devuelta, venta fiao, recarga sin perder sesión ni carrito, abono, anulación y celular.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  require("node:fs").mkdirSync("outputs", { recursive: true });
  page.on("response", async (response) => {
    if (response.status() >= 400)
      console.error("HTTP failure", response.status(), response.url());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const nav = (name) => page.locator(".sidebar").getByRole("button", { name, exact: true });
  const dialog = page.getByRole("dialog");

  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4200");
  await page.screenshot({ path: "outputs/syscol-login.png", fullPage: true });

  // Registro del dueño
  await page.getByRole("button", { name: "Crear una cuenta de dueño" }).click();
  await page.locator("[name=nombre]").fill("Dueño de prueba");
  await page.locator("[name=colmado]").fill("Colmado La Esquina");
  await page.locator("[name=email]").fill("qa" + Date.now() + "@example.com");
  await page.locator("[name=password]").fill("correct-horse-123");
  await page.getByRole("button", { name: "Crear mi colmado" }).click();
  await page.getByRole("heading", { name: "Vender" }).waitFor();
  await page.getByText("Colmado La Esquina").first().waitFor();

  // Inventario: categoría desde el formulario del producto y existencia inicial
  await nav("Inventario").click();
  await page.getByRole("button", { name: "+ Nuevo producto" }).click();
  await dialog.locator("[name=nombre]").fill("Arroz premium");
  await dialog.getByLabel("Nombre de categoría").fill("Alimentos");
  await dialog.getByRole("button", { name: "Agregar categoría" }).click();
  await dialog.getByLabel("Categoría").waitFor();
  await dialog.locator("[name=precio]").fill("35.50");
  await dialog.locator("[name=compra]").fill("20.10");
  await dialog.locator("[name=inicial]").fill("10");
  await dialog.locator("[name=codigo]").fill("7460001");
  await dialog.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("cell", { name: /Arroz premium/ }).waitFor();
  await page.getByRole("cell", { name: "10", exact: true }).waitFor();

  // Entrada de mercancía con motivo rápido
  await page.getByRole("button", { name: "Entrada / salida" }).click();
  await dialog.locator("[name=cantidad]").fill("5");
  await dialog.getByRole("button", { name: "Compra a suplidor" }).click();
  await dialog.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByRole("cell", { name: "15", exact: true }).waitFor();

  // Cliente con teléfono local (se normaliza a +1)
  await nav("Clientes").click();
  await page.getByRole("button", { name: "+ Nuevo cliente" }).click();
  await dialog.locator("[name=nombre]").fill("Ana Pérez");
  await dialog.locator("[name=telefono]").fill("809-555-1234");
  await dialog.locator("[name=limite]").fill("200");
  await dialog.locator("[name=consentimiento]").check();
  await dialog.getByRole("button", { name: "Guardar cliente" }).click();
  await page.getByRole("cell", { name: /Ana Pérez/ }).waitFor();
  await page.getByText("809-555-1234").waitFor();

  // Venta en efectivo: escaneo por código, cantidad y devuelta
  await nav("Vender").click();
  const search = page.getByLabel("Buscar producto");
  await search.fill("7460001");
  await search.press("Enter");
  await page.getByLabel("Cantidad de Arroz premium").waitFor();
  await page.getByRole("button", { name: "Agregar uno de Arroz premium" }).click();
  await page.getByLabel("¿Con cuánto paga?").fill("100");
  await page.getByText("Devuelta").waitFor();
  assert.match(await page.locator(".changebox").innerText(), /29[.,]00/);
  await page.getByRole("button", { name: /Cobrar/ }).click();
  await dialog.getByText("Recibo #").waitFor();
  assert.match(await dialog.locator(".changehero").innerText(), /29[.,]00/);
  await page.getByRole("button", { name: "Nueva venta" }).click();

  // Venta fiao que se conserva al recargar la página
  await page.getByRole("button", { name: /Agregar Arroz premium/ }).click();
  await page.getByRole("button", { name: /Agregar Arroz premium/ }).click();
  await page.getByLabel("Cliente").fill("Ana");
  await page.getByRole("option", { name: /Ana Pérez/ }).click();
  await page.locator(".segmented label", { hasText: "Fiao" }).click();
  assert(await page.getByLabel("Fiao", { exact: true }).isChecked());
  await page.screenshot({ path: "outputs/syscol-pos.png", fullPage: true });
  await page.reload();
  await page.getByRole("heading", { name: "Vender" }).waitFor();
  await page.getByLabel("Cantidad de Arroz premium").waitFor();
  assert.equal(await page.getByLabel("Cantidad de Arroz premium").inputValue(), "2");
  await page.getByText("Puede fiar").waitFor();
  await page.getByRole("button", { name: /Cobrar/ }).click();
  await dialog.getByText("Cliente: Ana Pérez").waitFor();
  await page.getByRole("button", { name: "Nueva venta" }).click();

  // Abono parcial desde Fiao
  await nav("Fiao").click();
  await page.getByRole("button", { name: "Registrar abono de Ana Pérez" }).click();
  await dialog.getByRole("spinbutton", { name: /Monto a abonar/ }).fill("21");
  await dialog.getByRole("button", { name: "Abonar", exact: true }).click();
  await page.getByRole("status").getByText(/Abono de RD\$21/).waitFor();
  await dialog.getByRole("button", { name: "Abonar", exact: true }).and(page.locator(":enabled")).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.getByText("RD$50.00").first().waitFor();
  await page.screenshot({ path: "outputs/syscol-fiao.png", fullPage: true });

  // Anulación de la venta en efectivo: el stock vuelve
  await nav("Ventas").click();
  await page.getByRole("button", { name: "Anular" }).last().click();
  await dialog.getByRole("button", { name: "Error al cobrar" }).click();
  await dialog.getByRole("button", { name: "Anular venta" }).click();
  await page.getByText("Anulada", { exact: true }).waitFor();
  await nav("Inventario").click();
  await page.getByRole("cell", { name: "13", exact: true }).waitFor();

  // Celular: navegación inferior sin desbordes
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".bottomnav").getByRole("button", { name: "Fiao" }).click();
  await page.getByRole("heading", { name: "Fiao y abonos" }).waitFor();
  await page.screenshot({ path: "outputs/syscol-mobile.png", fullPage: true });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Horizontal page overflow",
  );
  await page.locator(".bottomnav").getByRole("button", { name: "Más" }).click();
  await dialog.getByRole("button", { name: /Reportes/ }).click();
  await page.getByText("Total vendido", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: registration, product with category and stock, stock entry, customer, cash sale with change, credit sale kept after reload, payment, void, mobile navigation.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
