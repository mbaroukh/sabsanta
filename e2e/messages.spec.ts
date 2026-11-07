import { type Browser, expect, type Page, test } from "@playwright/test";

const NAMES = ["Alice", "Bob", "Chloé"];
const newPage = async (b: Browser): Promise<Page> => (await b.newContext()).newPage();

test("messagerie : santa ↔ enfant en direct, anonyme côté enfant", async ({ browser }) => {
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

  // Avant la révélation, le Santa ne peut pas écrire à son enfant.
  await expect(at("Alice").getByTestId("chat-child")).toHaveCount(0);

  const child: Record<string, string> = {};
  for (const n of NAMES) {
    await at(n)
      .getByRole("button", { name: /Lancer le tirage/ })
      .click();
    await expect(at(n).getByTestId("child-name")).toBeVisible({ timeout: 15_000 });
    child[n] = await at(n).getByTestId("child-name").innerText();
  }
  const kid = child.Alice as string;

  // Alice écrit à son enfant ; la page de l'enfant (ouverte, jamais rechargée) le reçoit en direct,
  // bien avant le rafraîchissement périodique de 15 s.
  await at("Alice").getByLabel(`Message — Discuter avec ${kid}`).fill("Tu aimes le chocolat ?");
  await at("Alice").getByTestId("chat-child").getByRole("button", { name: "Envoyer" }).click();
  const kidChat = at(kid).getByTestId("chat-santa");
  await expect(kidChat).toContainText("Tu aimes le chocolat ?", { timeout: 5_000 });
  // Anonymat : l'enfant ne voit ni le nom d'Alice ni de lien vers elle dans ce fil.
  await expect(kidChat).not.toContainText("Alice");
  await expect(kidChat).toContainText("Ton Santa");

  // Réponse de l'enfant, reçue en direct par Alice.
  await at(kid).getByLabel("Message — Discuter avec ton Santa 🎅 (anonyme)").fill("Oui, noir !");
  await kidChat.getByRole("button", { name: "Envoyer" }).click();
  await expect(at("Alice").getByTestId("chat-child")).toContainText("Oui, noir !", {
    timeout: 5_000,
  });
});
