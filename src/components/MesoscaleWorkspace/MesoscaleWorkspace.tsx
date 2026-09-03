import React from "react";
import type { ProviderPayload } from "../../mesoscale/contract";

export interface MesoscaleWorkspaceProps {
  payload: ProviderPayload | null;
  isStale?: boolean;
}

export const MesoscaleWorkspace: React.FC<MesoscaleWorkspaceProps> = ({ payload, isStale }) => {
  if (!payload) {
    return <div data-testid="mesoscale-empty">No mesoscale data — select model cycle</div>;
  }
  return (
    <div data-testid="mesoscale-workspace">
      <div data-testid="mesoscale-map">Map — radar/satellite context</div>
      <div data-testid="mesoscale-params">
        {payload.parameters.map((p) => (
          <div key={p.id} data-testid={`param-${p.id}`}>
            {p.displayName}: {p.value ?? "unavailable"} {p.units} (valid {p.validTime})
          </div>
        ))}
      </div>
      <div data-testid="mesoscale-forecast-area">Forecast area — draw mesoscale polygon</div>
      <div data-testid="mesoscale-discussion">Discussion — narrate mesoscale forecast</div>
      <div data-testid="mesoscale-attribution">
        {payload.source} — {payload.model} {payload.cycle} {isStale ? "(stale)" : ""}
      </div>
    </div>
  );
};
