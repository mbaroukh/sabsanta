import { createFileRoute, Link } from "@tanstack/react-router";
import { btn, Page } from "../components/Layout";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Page>
      <section className="space-y-4 py-10 text-center">
        <div className="text-7xl">🎄</div>
        <h1 className="text-4xl font-bold text-slate-800">
          Le Secret Santa où l'on choisit (un peu)
        </h1>
        <p className="text-slate-600">Sans compte, sans email obligatoire.</p>
        <Link to="/create" className={`${btn} inline-block`}>
          Créer mon Secret Santa
        </Link>
      </section>
    </Page>
  );
}
