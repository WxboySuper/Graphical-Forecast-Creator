import React from 'react';

/** Accessible loading placeholder shown while a lazy route chunk downloads. */
export const RouteFallback: React.FC<{ label?: string }> = ({ label = 'Loading page' }) => (
  <div className="flex h-full items-center justify-center p-6" role="status" aria-label={label}>
    <span className="text-sm text-muted-foreground">Loading…</span>
  </div>
);
