import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SetupWizardPage } from "./pages/SetupWizardPage.js";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
      </Route>
    </Routes>
  );
}
