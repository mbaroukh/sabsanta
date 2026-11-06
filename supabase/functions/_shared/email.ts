// Emails : interface de fournisseur + construction des messages (pure, testable).
// Le contenu des messages n'est JAMAIS inclus : la messagerie est anonyme, on invite à ouvrir sa page.

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(email: Email): Promise<void>;
}

/** Driver de développement : écrit l'email dans les logs. Brevo/Resend viendront s'ajouter ici. */
export class ConsoleProvider implements EmailProvider {
  send(email: Email): Promise<void> {
    console.log(`[email:console] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return Promise.resolve();
  }
}

export function providerFromEnv(driver: string | undefined): EmailProvider {
  switch (driver ?? "console") {
    case "console":
      return new ConsoleProvider();
    default:
      throw new Error(`EMAIL_DRIVER inconnu : ${driver}`);
  }
}

export interface OutboxRow {
  to_email: string;
  kind: string;
  payload: { from_role?: "santa" | "child" };
}

export function buildEmail(row: OutboxRow, link: string, name: string): Email | null {
  switch (row.kind) {
    case "started":
      return {
        to: row.to_email,
        subject: "🎅 Le Secret Santa est lancé !",
        text: `Salut ${name},\n\nLe tirage est fait ! Découvre à qui tu offres un cadeau :\n${link}\n\nGarde ce lien, c'est ta clé.`,
      };
    case "new_message": {
      const who =
        row.payload.from_role === "santa" ? "ton Santa" : "la personne à qui tu offres un cadeau";
      return {
        to: row.to_email,
        subject: "🎁 Nouveau message sur ton Secret Santa",
        text: `Salut ${name},\n\nTu as un nouveau message de ${who}. Lis-le ici :\n${link}`,
      };
    }
    default:
      return null;
  }
}
