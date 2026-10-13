import React from 'react';

/** Renders one compact label and value pair used by account summary cards. */
export const AccountSummaryTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="account-summary-tile">
    <p>{label}</p>
    <strong>{value}</strong>
  </div>
);
