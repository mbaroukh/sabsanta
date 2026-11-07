import { type Browser, expect, type Page, test } from "@playwright/test";

const newPage = async (b: Browser): Promise<Page> => (await b.newContext()).newPage();

async function createSanta(page: Page, santaName: string) {
  await page.goto("/create");
  await page.getByLabel("Nom du Secret Santa").fill(santaName);
  const input = page.getByLabel("Nom du participant");
  for (const n of ["Zoé", "Yann", "Xavier"]) {
    await input.fill(n);
    await input.press("Enter");
  }
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("radio", { name: "Zoé" }).check();
  await page.getByRole("button", { name: "Créer" }).click();
  return {
    share: await page.getByTestId("share-link").innerText(),
    admin: await page.getByTestId("admin-link").innerText(),
  };
}

test("le nom du Secret Santa est obligatoire", async ({ page }) => {
  await page.goto("/create");
  const input = page.getByLabel("Nom du participant");
  for (const n of ["A1", "B2", "C3"]) {
    await input.fill(n);
    await input.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();
  await page.getByLabel("Nom du Secret Santa").fill("Noël bureau");
  await expect(page.getByRole("button", { name: "Suivant" })).toBeEnabled();
});

test("accueil : mes Secret Santas mémorisés, retrait, et accès depuis le lien de partage", async ({
  browser,
}) => {
  const admin = await newPage(browser);
  await admin.goto("/");
  await expect(admin.getByTestId("my-spaces")).toHaveCount(0); // rien de mémorisé au départ

  const { share, admin: adminLink } = await createSanta(admin, "Noël en famille");
  // Le texte rassurant remplace l'avertissement, et rien n'oblige à copier le lien.
  await expect(admin.getByText("Ton accès est mémorisé sur ce navigateur")).toBeVisible();
  await expect(admin.getByText("sans lui")).toHaveCount(0);

  // Dès la création, l'organisateur retrouve son Santa sur l'accueil, avec son nom.
  await admin.goto("/");
  const list = admin.getByTestId("my-spaces");
  await expect(list).toContainText("Noël en famille");
  await expect(list).toContainText("organisateur");
  await list.getByRole("link").first().click();
  await expect(admin.getByTestId("santa-name")).toHaveText("Noël en famille");
  await expect(admin.getByTestId("admin-panel")).toBeVisible();

  // Un participant : la liste se remplit après avoir rejoint ; un autre navigateur ne voit rien.
  const yann = await newPage(browser);
  await yann.goto(share);
  await expect(yann.getByText("Noël en famille")).toBeVisible();
  await yann.getByRole("button", { name: "Yann", exact: true }).click();
  await yann.getByRole("button", { name: "C'est moi" }).click();
  await expect(yann.getByRole("heading", { name: /Yann/ })).toBeVisible();
  await yann.goto("/");
  await expect(yann.getByTestId("my-spaces")).toContainText("Noël en famille");
  await expect(yann.getByTestId("my-spaces")).toContainText("Tu es Yann");
  const other = await newPage(browser);
  await other.goto("/");
  await expect(other.getByTestId("my-spaces")).toHaveCount(0);

  // Rouvrir le lien de partage depuis ce navigateur ramène directement à son espace.
  await yann.goto(share);
  await expect(yann.getByRole("heading", { name: /Yann/ })).toBeVisible();

  // Le lien personnel fonctionne depuis un autre navigateur, qui le mémorise à son tour.
  await other.goto(adminLink);
  await expect(other.getByTestId("admin-panel")).toBeVisible();
  await other.goto("/");
  await expect(other.getByTestId("my-spaces")).toContainText("Noël en famille");

  // « Retirer » n'oublie que localement ; le lien reste utilisable.
  await other.getByRole("button", { name: /Retirer Noël en famille/ }).click();
  await expect(other.getByTestId("my-spaces")).toHaveCount(0);
  await other.goto(adminLink);
  await expect(other.getByTestId("admin-panel")).toBeVisible();
});

test("un accès invalidé par l'organisateur disparaît de l'accueil", async ({ browser }) => {
  const admin = await newPage(browser);
  const { share, admin: adminLink } = await createSanta(admin, "Réveillon");
  const yann = await newPage(browser);
  await yann.goto(share);
  await yann.getByRole("button", { name: "Yann", exact: true }).click();
  await yann.getByRole("button", { name: "C'est moi" }).click();
  await expect(yann.getByRole("heading", { name: /Yann/ })).toBeVisible();
  const yannUrl = yann.url();

  await admin.goto(adminLink);
  admin.on("dialog", (d) => d.accept());
  await admin
    .getByRole("listitem")
    .filter({ hasText: "Yann" })
    .getByRole("button", { name: "Réinitialiser" })
    .click();

  await yann.goto(yannUrl);
  await expect(yann.getByText("Lien invalide")).toBeVisible();
  await yann.goto("/");
  await expect(yann.getByTestId("my-spaces")).toHaveCount(0);
});
