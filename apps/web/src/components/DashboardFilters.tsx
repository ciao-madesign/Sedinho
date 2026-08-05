import type { HierarchyLevel, PlayerListItem, PlayerRole } from "@sedinho/shared";
import { computeAge } from "../lib/playerFormat.js";

export interface DashboardFiltersState {
  role: PlayerRole | "ALL";
  team: string;
  priceMin: string;
  priceMax: string;
  ageMin: string;
  ageMax: string;
  risk: "ALL" | "AVAILABLE" | "RISK";
  hierarchy: HierarchyLevel | "ALL";
}

export const defaultDashboardFilters: DashboardFiltersState = {
  role: "ALL",
  team: "ALL",
  priceMin: "",
  priceMax: "",
  ageMin: "",
  ageMax: "",
  risk: "ALL",
  hierarchy: "ALL",
};

const roleOptions: (PlayerRole | "ALL")[] = ["ALL", "P", "D", "C", "A"];

const hierarchyOptions: { value: HierarchyLevel | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tutti" },
  { value: "starter", label: "Titolari" },
  { value: "first-alternate", label: "Prima alternativa" },
  { value: "second-alternate", label: "Seconda alternativa" },
];

const riskOptions: { value: DashboardFiltersState["risk"]; label: string }[] = [
  { value: "ALL", label: "Tutti" },
  { value: "AVAILABLE", label: "Solo disponibili" },
  { value: "RISK", label: "Solo a rischio" },
];

function isFilterActive(filters: DashboardFiltersState): boolean {
  return JSON.stringify(filters) !== JSON.stringify(defaultDashboardFilters);
}

/** Applica i filtri (sez. 9: "ogni pannello sarà filtrabile per ruolo, squadra, fascia
 * prezzo, età, rischio, titolarità") al pool di giocatori prima che ogni sezione della
 * Dashboard ne estragga la propria top-N. Un'unica barra condivisa invece di controlli
 * duplicati per pannello: coerente con la direzione UX "interfaccia semplice, pochi input"
 * (CLAUDE.md sez. 9) e ogni sezione resta comunque "filtrabile" perché riflette la barra. */
export function applyDashboardFilters(
  players: PlayerListItem[],
  filters: DashboardFiltersState,
): PlayerListItem[] {
  const priceMin = filters.priceMin ? Number(filters.priceMin) : null;
  const priceMax = filters.priceMax ? Number(filters.priceMax) : null;
  const ageMin = filters.ageMin ? Number(filters.ageMin) : null;
  const ageMax = filters.ageMax ? Number(filters.ageMax) : null;

  return players.filter((p) => {
    if (filters.role !== "ALL" && p.role !== filters.role) return false;
    if (filters.team !== "ALL" && p.team !== filters.team) return false;

    if (priceMin !== null || priceMax !== null) {
      if (p.initialQuotation === null) return false;
      if (priceMin !== null && p.initialQuotation < priceMin) return false;
      if (priceMax !== null && p.initialQuotation > priceMax) return false;
    }

    if (ageMin !== null || ageMax !== null) {
      const age = computeAge(p.birthDate);
      if (age === null) return false;
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
    }

    if (filters.risk === "AVAILABLE" && p.availability !== "available") return false;
    if (filters.risk === "RISK" && p.availability === "available") return false;

    if (filters.hierarchy !== "ALL" && p.hierarchyLevel !== filters.hierarchy) return false;

    return true;
  });
}

interface DashboardFiltersBarProps {
  filters: DashboardFiltersState;
  onChange: (filters: DashboardFiltersState) => void;
  teams: string[];
}

export function DashboardFiltersBar({ filters, onChange, teams }: DashboardFiltersBarProps) {
  const set = <K extends keyof DashboardFiltersState>(key: K, value: DashboardFiltersState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Ruolo
        </label>
        <div className="flex gap-1 rounded-md border border-slate-800 bg-slate-950 p-1">
          {roleOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set("role", r)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filters.role === r
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r === "ALL" ? "Tutti" : r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Squadra
        </label>
        <select
          value={filters.team}
          onChange={(e) => set("team", e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="ALL">Tutte</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Prezzo (cr.)
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={filters.priceMin}
            onChange={(e) => set("priceMin", e.target.value)}
            className="w-16 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-slate-600">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={filters.priceMax}
            onChange={(e) => set("priceMax", e.target.value)}
            className="w-16 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Età
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={filters.ageMin}
            onChange={(e) => set("ageMin", e.target.value)}
            className="w-14 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-slate-600">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={filters.ageMax}
            onChange={(e) => set("ageMax", e.target.value)}
            className="w-14 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Rischio
        </label>
        <select
          value={filters.risk}
          onChange={(e) => set("risk", e.target.value as DashboardFiltersState["risk"])}
          className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {riskOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Titolarità
        </label>
        <select
          value={filters.hierarchy}
          onChange={(e) =>
            set("hierarchy", e.target.value as DashboardFiltersState["hierarchy"])
          }
          className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {hierarchyOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isFilterActive(filters) && (
        <button
          type="button"
          onClick={() => onChange(defaultDashboardFilters)}
          className="ml-auto rounded-md px-2.5 py-1.5 text-xs text-slate-400 hover:text-emerald-400"
        >
          Reset filtri
        </button>
      )}
    </div>
  );
}
