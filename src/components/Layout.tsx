import type { ReactNode } from "react";

export function Page({
  children,
  title,
  kicker,
}: {
  children?: ReactNode;
  title?: string;
  kicker?: string;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="text-center">
        <a href={import.meta.env.BASE_URL} className="text-lg font-bold text-red-700">
          🎅 Sabsanta
        </a>
        {kicker && (
          <p data-testid="santa-name" className="mt-1 text-sm font-medium text-slate-500">
            {kicker}
          </p>
        )}
        {title && <h1 className="mt-2 text-3xl font-bold text-slate-800">{title}</h1>}
      </header>
      {children}
    </main>
  );
}

export const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
export const btn =
  "rounded-lg bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-600 disabled:opacity-50";
export const btnGhost =
  "rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50";
