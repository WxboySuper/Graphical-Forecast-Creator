import { FORECAST_WORKSPACES } from '../../config/forecastWorkspaces';
import { buildWorkspaceForecastFilename } from './transferExportUtils';

test.each(FORECAST_WORKSPACES.map(({ id }) => id))(
  'builds an owner-specific native JSON filename for %s',
  (workspaceId) => {
    expect(buildWorkspaceForecastFilename(workspaceId, new Date('2026-09-23T12:34:56.000Z')))
      .toBe(`gfc-${workspaceId}-forecast-2026-09-23T12-34-56.json`);
  },
);
