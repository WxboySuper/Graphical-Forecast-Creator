export interface UpdateScreenshot {
  src: string;
  alt: string;
  caption?: string;
}

export interface UpdateSection {
  title: string;
  body: string;
  screenshots?: UpdateScreenshot[];
}

export interface ReleaseUpdate {
  version: string;
  title: string;
  summary: string;
  sections: UpdateSection[];
  improvements: string[];
}

/** Builds a screenshot descriptor under public/updates/v1.6/. */
function buildUpdateImage(fileName: string, alt: string, caption?: string): UpdateScreenshot {
  return {
  src: `/updates/v1.6/${fileName}`,
  alt,
  caption,
  };
}

export const v16Update: ReleaseUpdate = {
  version: '1.6',
  title: 'Monitor — live weather at a glance',
  summary:
    'Version 1.6 introduces Monitor: a dedicated workspace for live radar, satellite, your forecast outlook, NWS alerts, and storm reports — built for quick situational awareness while you work.',
  sections: [
    {
      title: 'Monitor workspace',
      body:
        'Open Monitor from the main navigation to see radar and satellite imagery, animate recent frames, and keep your active or saved outlook on the map for context. Premium users can also pull outlooks from the cloud library.',
      screenshots: [
        buildUpdateImage(
          'monitor-overview.png',
          'Monitor page showing the map and control sidebar',
          'Monitor layout with map and controls',
        ),
        buildUpdateImage(
          'monitor-radar-outlook.png',
          'Radar imagery with a semi-transparent outlook overlay',
          'Radar plus your outlook overlay',
        ),
      ],
    },
    {
      title: 'Alerts and storm reports',
      body:
        'Toggle NWS watches, warnings, and advisories with adjustable opacity. Layer storm reports and filter by hazard type, optionally matching your outlook type for faster verification.',
      screenshots: [
        buildUpdateImage('monitor-alerts.png', 'NWS alerts displayed on the Monitor map'),
        buildUpdateImage('monitor-storm-reports.png', 'Storm reports plotted on the Monitor map'),
      ],
    },
  ],
  improvements: [
    'Hosted accounts on Safari and macOS are less likely to lose connection after the computer sleeps overnight.',
    'Forecast keyboard shortcuts no longer break when the browser sends an unusual key event.',
    'Map layer transparency controls behave consistently again on the forecast editor.',
    'Saving, loading, and exporting forecasts is more resilient when outlook data was stored in an unexpected shape.',
    'Signed-in home page primary buttons are easier to read in light mode.',
  ],
};
