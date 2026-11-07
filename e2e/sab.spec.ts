import { type Browser, expect, type Page, test } from "@playwright/test";

const NAMES = ["Alice", "Bob", "Chloé", "David"];
// Cycle : chacun préfère le suivant. Solution optimale unique : tout le monde a son premier choix.
const WANTS: Record<string, string> = {
  Alice: "Bob",
  Bob: "Chloé",
  Chloé: "David",
  David: "Alice",
};

const newPage = async (b: Browser): Promise<Page> => (await b.newContext()).newPage();

/** Remonte `target` en première position avec les flèches. */
async function rankFirst(page: Page, target: string) {
  const up = page.getByRole("button", { name: `Monter ${target}` });
  while (await up.isEnabled()) await up.click();
  await expect(page.getByTestId("rank-name").first()).toHaveText(target);
}

test("Sab : classements, tirage automatique au dernier, premiers choix respectés", async ({
  browser,
}) => {
  const admin = await newPage(browser);
  await admin.goto("/create");
  await admin.getByLabel("Nom du Secret Santa").fill("Noël test");
  const input = admin.getByLabel("Nom du participant");
  for (const n of NAMES) {
    await input.fill(n);
    await input.press("Enter");
  }
  await admin.getByRole("button", { name: "Suivant" }).click();
  await admin.getByRole("radio", { name: "Alice" }).check();
  await admin.getByRole("radio", { name: /Sab/ }).check();
  await admin.getByRole("button", { name: "Créer" }).click();
  const shareLink = await admin.getByTestId("share-link").innerText();
  const adminLink = await admin.getByTestId("admin-link").innerText();

  const pages: Record<string, Page> = {};
  const at = (n: string) => pages[n] as Page;
  await admin.goto(adminLink);
  pages.Alice = admin;
  for (const name of NAMES.slice(1)) {
    const p = await newPage(browser);
    await p.goto(shareLink);
    await p.getByRole("button", { name, exact: true }).click();
    await p.getByRole("button", { name: "C'est moi" }).click();
    pages[name] = p;
  }

  // Le classement est obligatoire avant tout : pas de souhaits ni de tirage, juste le classement.
  for (const n of NAMES) {
    await expect(at(n).getByTestId("ranking")).toBeVisible();
    await expect(at(n).getByLabel("Mes souhaits")).toHaveCount(0);
  }

  // Alice se trompe d'abord (ordre par défaut), puis corrige avant le tirage.
  await at("Alice").getByRole("button", { name: "Valider mon classement" }).click();
  await expect(at("Alice").getByTestId("sab-waiting")).toContainText("1/4");
  await rankFirst(at("Alice"), "David");
  await at("Alice").getByRole("button", { name: "Mettre à jour mon classement" }).click();
  await expect(at("Alice").getByText("Classement enregistré ✓").first()).toBeVisible();
  await rankFirst(at("Alice"), "Bob");
  await at("Alice").getByRole("button", { name: "Mettre à jour mon classement" }).click();
  await expect(at("Alice").getByTestId("sab-waiting")).toContainText("1/4");

  for (const n of ["Bob", "Chloé"]) {
    await rankFirst(at(n), WANTS[n] as string);
    await at(n).getByRole("button", { name: "Valider mon classement" }).click();
    await expect(at(n).getByTestId("sab-waiting")).toBeVisible();
  }
  await expect(at("Chloé").getByTestId("sab-waiting")).toContainText("3/4");
  await expect(at("Chloé").getByRole("button", { name: /Lancer le tirage/ })).toHaveCount(0);

  // Dernier classement : tirage immédiat.
  await rankFirst(at("David"), "Alice");
  await at("David").getByRole("button", { name: "Valider mon classement" }).click();
  await expect(at("David").getByRole("button", { name: /Lancer le tirage/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(at("David").getByText("Le Secret Santa est lancé")).toBeVisible();

  // Chacun découvre son enfant : c'est son premier choix.
  await at("David")
    .getByRole("button", { name: /Lancer le tirage/ })
    .click();
  await expect(at("David").getByTestId("child-name")).toHaveText("Alice", { timeout: 15_000 });
  for (const n of NAMES.slice(0, 3)) {
    await at(n).reload();
    await at(n)
      .getByRole("button", { name: /Lancer le tirage/ })
      .click();
    await expect(at(n).getByTestId("child-name")).toHaveText(WANTS[n] as string, {
      timeout: 15_000,
    });
  }
});

test("Sab : un tirage impossible est refusé dès la création", async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel("Nom du Secret Santa").fill("Noël test");
  const input = page.getByLabel("Nom du participant");
  for (const n of ["Ana", "Ben", "Cam"]) {
    await input.fill(n);
    await input.press("Enter");
  }
  await page.getByRole("button", { name: "Suivant" }).click();
  // Ana et Ben ne peuvent offrir qu'à l'autre => réciproque forcée.
  await page.getByLabel("Interdiction réciproque (couple)").uncheck();
  const row = (n: string) =>
    page.locator("div", { hasText: new RegExp(`^${n} ne donne pas à :`) }).first();
  await row("Ana").getByRole("button", { name: "Cam" }).click();
  await row("Ben").getByRole("button", { name: "Cam" }).click();
  await expect(page.getByRole("alert")).toContainText("aucun tirage n'est possible");
  await expect(page.getByRole("button", { name: "Créer" })).toBeDisabled();
});
