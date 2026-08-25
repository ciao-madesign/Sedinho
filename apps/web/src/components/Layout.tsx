import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/players", label: "Giocatori" },
  { to: "/shortlist", label: "Obiettivi" },
  { to: "/confronti", label: "Confronti" },
  { to: "/auction", label: "Asta" },
  { to: "/simulatore", label: "Simulatore" },
  { to: "/report", label: "Report" },
  { to: "/setup", label: "Setup Lega" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 transition-colors ${
    isActive
      ? "bg-emerald-500/10 text-emerald-400"
      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(16,185,129,0.15), transparent 70%)",
        }}
      />
      <header className="relative border-b border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <img
              src="/logo.jpg"
              alt="Sedinho"
              className="h-9 w-9 rounded-full ring-1 ring-slate-700 object-cover"
            />
            <span className="text-lg font-semibold tracking-tight">Sedinho</span>
          </NavLink>

          {/* Nav desktop: riga unica, visibile solo da sm in su — sotto quella soglia
              gli 8 link + "Esci" non ci stanno mai su una riga sola (causa reale dello
              scroll orizzontale/spazio bianco segnalato dall'utente su mobile). */}
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
            {user && (
              <span className="ml-3 flex items-center gap-2 border-l border-slate-800 pl-3">
                <span className="text-xs text-slate-500">{user.name}</span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                >
                  Esci
                </button>
              </span>
            )}
          </nav>

          {/* Hamburger: solo sotto sm. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Chiudi il menu" : "Apri il menu"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-900 sm:hidden"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Menu mobile: colonna a tendina, sostituisce la riga nav sotto sm. */}
        {menuOpen && (
          <nav className="mx-auto mt-3 flex max-w-6xl flex-col gap-1 text-sm sm:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
            {user && (
              <div className="mt-1 flex items-center justify-between border-t border-slate-800 px-3 pt-2">
                <span className="text-xs text-slate-500">{user.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                >
                  Esci
                </button>
              </div>
            )}
          </nav>
        )}
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
