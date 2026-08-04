import type { DataSourceMeta } from "./common.js";

/** Un trasferimento e il suo impatto stimato (sez. 6, Transfer Engine). */
export interface Transfer {
  id: string;
  playerId: string;
  fromTeam: string | null;
  toTeam: string;
  date: string;
  startingRoleImpact: number; // delta -1..1
  minutesImpact: number; // delta -1..1
  bonusImpact: number; // delta -1..1
  riskDelta: number; // delta -1..1
  fantasyValueDelta: number; // delta -1..1
  newStarterProbability: number; // 0..1
  isHighlighted: boolean; // true se newStarterProbability > 0.55 (sez. 6)
  meta: DataSourceMeta;
}
