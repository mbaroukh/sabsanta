import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Gift, Snow, Tree } from "../components/Illustrations";
import { btn } from "../components/Layout";

export const Route = createFileRoute("/")({ component: Home });

const FEATURES = [
  {
    emoji: "💝",
    title: "Tu choisis (un peu)",
    text: "Chacun classe ses préférences, puis un tirage optimisé les respecte au mieux.",
  },
  {
    emoji: "🕵️",
    title: "Messagerie anonyme",
    text: "Pose des questions à ton enfant sans te dévoiler, et réponds à ton Santa.",
  },
  {
    emoji: "🔑",
    title: "Zéro inscription",
    text: "Pas de compte ni de mot de passe : un lien personnel suffit. L'email reste facultatif.",
  },
];

function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-950 via-sky-900 to-sky-700 text-white">
      <Snow />
      <main className="relative mx-auto flex max-w-3xl flex-col items-center gap-10 px-4 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 90, damping: 14 }}
        >
          <Tree className="mx-auto h-56 w-44 drop-shadow-lg" />
          <div className="-mt-3 flex items-end justify-center gap-2">
            <Gift className="h-14 w-14" color="#dc2626" />
            <Gift className="h-20 w-20" color="#2563eb" ribbon="#f9fafb" />
            <Gift className="h-12 w-12" color="#9333ea" ribbon="#fde047" />
          </div>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h1 className="text-4xl font-extrabold sm:text-5xl">🎅 Sabsanta</h1>
          <p className="text-xl text-sky-100">
            Le Secret Santa où l'on choisit (un peu) à qui on offre.
          </p>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="inline-block"
          >
            <Link to="/create" className={`${btn} inline-block px-6 py-3 text-lg shadow-lg`}>
              Créer mon Secret Santa
            </Link>
          </motion.div>
        </motion.div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.li
              key={f.title}
              className="rounded-2xl bg-white/10 p-4 text-left backdrop-blur"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i }}
            >
              <div className="text-3xl">{f.emoji}</div>
              <h2 className="mt-1 font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-sky-100">{f.text}</p>
            </motion.li>
          ))}
        </ul>
      </main>
    </div>
  );
}
