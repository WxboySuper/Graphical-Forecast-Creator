/**
 * Mesoscale state message: a calm, explicit screen for loading and failure states
 * of model data. It names what is missing and offers a retry; it never fabricates
 * or substitutes data.
 */
import React from 'react';
import type { MesoscaleRequestResult } from '../../mesoscale';

interface StateMessageProps {
  result: MesoscaleRequestResult<unknown>;
  subject: string;
  onRetry: () => void;
}

const describe = (result: MesoscaleRequestResult<unknown>, subject: string): { title: string; body: string; retry: boolean } => {
  if (result.state === 'loading') return { title: `Loading ${subject}…`, body: 'Fetching the newest published model data.', retry: false };
  if (result.state === 'malformed') return { title: `${capitalize(subject)} could not be read`, body: 'The data source returned something this app does not understand. Nothing was shown.', retry: true };
  return { title: `${capitalize(subject)} is unavailable`, body: 'The model data source did not respond. No older data is being shown in its place.', retry: true };
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const StateMessage: React.FC<StateMessageProps> = ({ result, subject, onRetry }) => {
  const { title, body, retry } = describe(result, subject);
  return (
    <div className="mesoscale-state" role={result.state === 'loading' ? 'status' : 'alert'}>
      <h1 className="mesoscale-state__title">{title}</h1>
      <p className="mesoscale-state__body">{body}</p>
      {retry ? <button type="button" className="mesoscale-state__action" onClick={onRetry}>Try again</button> : null}
    </div>
  );
};
