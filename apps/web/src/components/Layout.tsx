import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/players", label: "Giocatori" },
  { to: "/setup", label: "Setup Lega" },
];

export function Layout() {
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
              src="/logo.png"
              alt="Sedinho"
              className="h-9 w-9 rounded-full ring-1 ring-slate-700 object-cover"
            />
            <span className="text-lg font-semibold tracking-tight">Sedinho</span>
          </NavLink>
          <nav className="flex gap-1 text-sm">
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
          </nav>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
