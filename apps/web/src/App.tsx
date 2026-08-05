import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SetupWizardPage } from "./pages/SetupWizardPage.js";
import { PlayersPage } from "./pages/PlayersPage.js";
import { PlayerDetailPage } from "./pages/PlayerDetailPage.js";
import { AuctionPage } from "./pages/AuctionPage.js";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/players/:id" element={<PlayerDetailPage />} />
        <Route path="/auction" element={<AuctionPage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
      </Route>
    </Routes>
  );
}
