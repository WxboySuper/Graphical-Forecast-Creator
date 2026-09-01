import React from "react";

export interface SevereWorkspaceShellProps {
  mapView: { center: [number, number]; zoom: number };
  discussionMode: "guided" | "diy";
  onSave: () => void;
}

export const SevereWorkspaceShell: React.FC<SevereWorkspaceShellProps> = ({ mapView, discussionMode, onSave }) => (
  <div data-testid="severe-workspace-shell">
    <div data-testid="severe-map" data-center={mapView.center.join(",")} data-zoom={mapView.zoom}>
      Map
    </div>
    <div data-testid="severe-discussion" data-mode={discussionMode}>
      Discussion ({discussionMode})
    </div>
    <div data-testid="severe-review">
      <button onClick={onSave} data-testid="severe-save">
        Save
      </button>
    </div>
  </div>
);

export const getDiscussionRedirect = (path: string): string | null => {
  if (path.startsWith("/discussion")) return "/forecast/severe";
  return null;
};
