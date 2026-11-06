import { describe, expect, test } from "bun:test";
import { buildEmail, ConsoleProvider, providerFromEnv } from "./email.ts";

describe("buildEmail", () => {
  const link = "http://x/p/TOKEN";
  const row = (kind: string, payload = {}) => ({ to_email: "a@x.fr", kind, payload });
  test("lancement", () => {
    const e = buildEmail(row("started"), link, "Alice");
    expect(e?.to).toBe("a@x.fr");
    expect(e?.text).toContain(link);
  });
  test("message : indique l'expéditeur sans jamais révéler le contenu", () => {
    const fromSanta = buildEmail(row("new_message", { from_role: "santa" }), link, "A");
    const fromChild = buildEmail(row("new_message", { from_role: "child" }), link, "A");
    expect(fromSanta?.text).toContain("ton Santa");
    expect(fromChild?.text).toContain("à qui tu offres");
    expect(fromSanta?.text).toContain(link);
  });
  test("type inconnu", () => {
    expect(buildEmail(row("???"), link, "A")).toBeNull();
  });
  test("fournisseurs", () => {
    expect(providerFromEnv(undefined)).toBeInstanceOf(ConsoleProvider);
    expect(() => providerFromEnv("nope")).toThrow();
  });
});
