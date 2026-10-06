import React from 'react';
import { Link } from 'react-router';
import { getForecastWorkspace, type ForecastWorkspaceId } from '../config/forecastWorkspaces';
import { getDefaultForecastWorkspacePath } from '../routing/forecastWorkspaceRoutes';

/** Explains a direct visit to a known forecast workspace that this build does not expose. */
export const UnavailableForecastWorkspacePage: React.FC<{ workspaceId: ForecastWorkspaceId }> = ({
  workspaceId,
}) => {
  const label = getForecastWorkspace(workspaceId)?.label ?? workspaceId;

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h1 className="text-xl font-semibold">{label} forecast is not available yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The {label} workspace exists but is not enabled in this build. Nothing was opened,
        and your current forecast was left alone.
      </p>
      <p className="mt-4 text-sm">
        <Link className="underline" to={getDefaultForecastWorkspacePath()}>
          Back to the Severe forecast
        </Link>
        <span aria-hidden="true"> · </span>
        <Link className="underline" to="/">
          Home
        </Link>
      </p>
    </div>
  );
};

export default UnavailableForecastWorkspacePage;
