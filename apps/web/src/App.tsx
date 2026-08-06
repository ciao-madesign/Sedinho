import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SetupWizardPage } from "./pages/SetupWizardPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { PlayerDetailPage } from "./pages/PlayerDetailPage.js";
import { AuctionPage } from "./pages/AuctionPage.js";
import { ShortlistPage } from "./pages/ShortlistPage.js";
import { ComparePage } from "./pages/ComparePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { useAuth } from "./lib/AuthContext.js";

/** Autenticazione richiesta esplicitamente dall'utente (vedi CLAUDE.md sez. 5): senza sessione
 * valida si vede solo la pagina di login, qualunque sia il percorso richiesto. */
export default function App() {
  const { user } = useAuth();

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Caricamento…</div>;
  }

  if (user === null) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/players/:id" element={<PlayerDetailPage />} />
        <Route path="/shortlist" element={<ShortlistPage />} />
        <Route path="/confronti" element={<ComparePage />} />
        <Route path="/auction" element={<AuctionPage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
      </Route>
    </Routes>
  );
}
