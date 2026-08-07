import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/players", label: "Giocatori" },
  { to: "/shortlist", label: "Obiettivi" },
  { to: "/confronti", label: "Confronti" },
  { to: "/auction", label: "Asta" },
  { to: "/simulatore", label: "Simulatore" },
  { to: "/setup", label: "Setup Lega" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(16,185,129,0.15), transparent 70%)",
        }}
      />
      <header className="relative border-b border-slate-800/80 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="Sedinho"
              className="h-9 w-9 rounded-full ring-1 ring-slate-700 object-cover"
            />
            <span className="text-lg font-semibold tracking-tight">Sedinho</span>
          </NavLink>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition-colors ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`
                }
              >
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
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
