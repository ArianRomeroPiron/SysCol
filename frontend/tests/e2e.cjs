const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  require("node:fs").mkdirSync("outputs", { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4200");
  await page.screenshot({ path: "outputs/syscol-login.png", fullPage: true });
  await page.getByRole("button", { name: "Crear una cuenta de dueño" }).click();
  await page.locator("[name=nombre]").fill("Dueño de prueba");
  await page.locator("[name=colmado]").fill("Colmado La Esquina");
  await page.locator("[name=email]").fill("qa" + Date.now() + "@example.com");
  await page.locator("[name=password]").fill("correct-horse-123");
  await page.getByRole("button", { name: "Crear mi colmado" }).click();
  await page.getByRole("heading", { name: "Una nueva venta" }).waitFor();
  await page
    .getByRole("button", { name: "📦 Inventario", exact: true })
    .click();
  await page.getByLabel("Nombre de categoría").fill("Alimentos");
  await page
    .getByRole("button", { name: "Agregar categoría", exact: true })
    .click();
  await page
    .getByLabel("Categoría", { exact: true })
    .selectOption({ label: "Alimentos" });
  await page.locator("[name=nombre]").fill("Arroz premium");
  await page.locator("[name=compra]").fill("20.10");
  await page.locator("[name=precio]").fill("35.50");
  await page
    .getByRole("button", { name: "Guardar producto", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Arroz premium", exact: true })
    .waitFor();
  await page.getByLabel("Cantidad de ajuste").fill("10");
  await page.getByLabel("Motivo", { exact: true }).fill("Compra inicial");
  await page
    .getByRole("button", { name: "Registrar ajuste", exact: true })
    .click();
  await page.getByText("10 disponibles", { exact: false }).waitFor();
  await page.getByRole("button", { name: "👥 Clientes", exact: true }).click();
  await page.locator("[name=nombre]").fill("Ana Pérez");
  await page.locator("[name=telefono]").fill("+18095551234");
  await page.locator("[name=limite]").fill("200");
  await page.locator("[name=consentimiento]").check();
  await page
    .getByRole("button", { name: "Guardar cliente", exact: true })
    .click();
  await page.getByRole("cell", { name: "Ana Pérez", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "🧾 Punto de venta", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Agregar", exact: true }).click();
  await page.getByRole("button", { name: "+ Agregar", exact: true }).click();
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption({ label: "Ana Pérez" });
  await page.getByLabel("Método de pago").selectOption("fiao");
  await page.screenshot({ path: "outputs/syscol-pos.png", fullPage: true });
  await page
    .getByRole("button", { name: "Registrar venta", exact: false })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "💳 Fiao y abonos", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: /Abono deuda/ }).fill("21");
  await page.getByRole("button", { name: "Abonar", exact: true }).click();
  await page.getByText("Abono registrado.", { exact: false }).waitFor();
  await page.screenshot({ path: "outputs/syscol-fiao.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "outputs/syscol-mobile.png", fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Horizontal page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: registration, category, product, stock, customer, credit sale, payment, mobile layout.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
