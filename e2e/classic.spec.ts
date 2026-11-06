import { type Browser, expect, type Page, test } from "@playwright/test";

const NAMES = ["Alice", "Bob", "Chloé", "David"];

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  return ctx.newPage();
}

test("classique : création, 4 participants rejoignent, révèlent, le Santa démarre", async ({
  browser,
}) => {
  const admin = await newPage(browser);
  await admin.goto("/create");

  // Collage d'une liste multi-lignes : saisie rapide.
  const input = admin.getByLabel("Nom du participant");
  await input.focus();
  await input.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData("text", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, NAMES.join("\n"));
  for (const n of NAMES)
    await expect(admin.getByRole("listitem").filter({ hasText: n })).toBeVisible();
  await admin.getByRole("button", { name: "Suivant" }).click();

  // Couple Alice/Bob (exclusion réciproque) et "c'est moi" = Alice.
  const row = admin.locator("div", { hasText: /^Alice ne donne pas à :/ }).first();
  await row.getByRole("button", { name: "Bob" }).click();
  await admin.getByRole("radio", { name: "Alice" }).check();
  await admin.getByRole("button", { name: "Créer" }).click();

  const shareLink = await admin.getByTestId("share-link").innerText();
  const adminLink = await admin.getByTestId("admin-link").innerText();
  expect(shareLink).toContain("/s/");

  // Alice (admin) révèle.
  await admin.goto(adminLink);
  await expect(admin.getByTestId("admin-panel")).toBeVisible();

  const givers: Record<string, string> = {};
  const reveal = async (page: Page, name: string) => {
    await page.getByRole("button", { name: /Lancer le tirage/ }).click();
    await expect(page.getByTestId("child-name")).toBeVisible({ timeout: 15_000 });
    givers[name] = await page.getByTestId("child-name").innerText();
  };

  // Bob, Chloé, David rejoignent chacun dans un contexte séparé.
  const pages: Record<string, Page> = { Alice: admin };
  const at = (n: string) => pages[n] as Page;
  for (const name of NAMES.slice(1)) {
    const p = await newPage(browser);
    await p.goto(shareLink);
    await p.getByRole("button", { name, exact: true }).click();
    await p.getByRole("button", { name: "C'est moi" }).click();
    await expect(p.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
    pages[name] = p;
  }

  // Une place prise n'est plus proposée à un autre navigateur.
  const late = await newPage(browser);
  await late.goto(shareLink);
  await expect(late.getByText("Tout le monde a déjà rejoint")).toBeVisible();

  // Le panneau admin voit tout le monde ; personne n'a encore révélé.
  await admin.reload();
  await expect(admin.getByTestId("admin-panel")).toContainText("Pas encore rejoint : personne");

  for (const name of NAMES.slice(1)) await reveal(at(name), name);
  await expect(at("David").getByText("Le Secret Santa est lancé")).toHaveCount(0); // Alice n'a pas révélé
  await reveal(admin, "Alice");

  // Tirage valide : permutation, pas soi-même, pas Alice↔Bob, pas de réciproque.
  expect(new Set(Object.values(givers)).size).toBe(4);
  for (const [g, r] of Object.entries(givers)) {
    expect(r).not.toBe(g);
    expect(givers[r]).not.toBe(g);
  }
  expect(givers.Alice).not.toBe("Bob");
  expect(givers.Bob).not.toBe("Alice");

  // Tous ont révélé : "démarré".
  await at("David").reload();
  await expect(at("David").getByText("Le Secret Santa est lancé")).toBeVisible();

  // Souhaits de l'enfant visibles par son Santa.
  await at("Bob").getByLabel("Mes souhaits").fill("Un livre de cuisine");
  await at("Bob").getByRole("button", { name: "Enregistrer" }).first().click();
  await expect(at("Bob").getByRole("button", { name: "Enregistré ✓" }).first()).toBeVisible();
  const santaOfBob = Object.entries(givers).find(([, r]) => r === "Bob")?.[0] as string;
  await at(santaOfBob).reload();
  await expect(at(santaOfBob).getByText("Un livre de cuisine")).toBeVisible();
});

test("admin : réinitialisation d'un participant avant démarrage", async ({ browser }) => {
  const admin = await newPage(browser);
  await admin.goto("/create");
  const input = admin.getByLabel("Nom du participant");
  for (const n of ["Zoé", "Yann", "Xavier"]) {
    await input.fill(n);
    await input.press("Enter");
  }
  await admin.getByRole("button", { name: "Suivant" }).click();
  await admin.getByRole("radio", { name: "Zoé" }).check();
  await admin.getByRole("button", { name: "Créer" }).click();
  const shareLink = await admin.getByTestId("share-link").innerText();
  const adminLink = await admin.getByTestId("admin-link").innerText();

  const yann = await newPage(browser);
  await yann.goto(shareLink);
  await yann.getByRole("button", { name: "Yann", exact: true }).click();
  await yann.getByRole("button", { name: "C'est moi" }).click();
  await expect(yann.getByRole("heading", { name: /Yann/ })).toBeVisible();
  const yannUrl = yann.url();

  await admin.goto(adminLink);
  admin.on("dialog", (d) => d.accept());
  const yannRow = admin.getByRole("listitem").filter({ hasText: "Yann" });
  await expect(yannRow).toContainText("✅");
  await yannRow.getByRole("button", { name: "Réinitialiser" }).click();
  await expect(yannRow).toContainText("⏳");

  // Son ancien lien est invalide ; il peut rejoindre à nouveau.
  await yann.goto(yannUrl);
  await expect(yann.getByText("Lien invalide")).toBeVisible();
  const again = await newPage(browser);
  await again.goto(shareLink);
  await expect(again.getByRole("button", { name: "Yann", exact: true })).toBeVisible();
});
