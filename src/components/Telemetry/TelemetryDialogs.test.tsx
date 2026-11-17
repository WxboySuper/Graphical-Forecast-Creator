import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TelemetryConsentPrompt, TelemetrySettingsDialog } from './TelemetryDialogs';
import { getTelemetryConsent, setTelemetryConsent } from '../../lib/telemetry';

describe('TelemetryConsentPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    setTelemetryConsent('unset');
  });

  it('asks once with equal, unselected choices', () => {
    render(<TelemetryConsentPrompt />);
    expect(screen.getByText(/anonymous counts of which features get used/i)).toBeInTheDocument();
    const allow = screen.getByRole('button', { name: 'Allow' });
    const decline = screen.getByRole('button', { name: 'No thanks' });
    expect(allow.className).toBe(decline.className);
    expect(getTelemetryConsent()).toBe('unset');
  });

  it('records Allow and stops asking', () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(getTelemetryConsent()).toBe('granted');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('records No thanks and stops asking', () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(getTelemetryConsent()).toBe('denied');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('treats closing the prompt as No thanks', () => {
    render(<TelemetryConsentPrompt />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(getTelemetryConsent()).toBe('denied');
  });

  it('stays closed when a choice was already made', () => {
    setTelemetryConsent('granted');
    render(<TelemetryConsentPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('TelemetrySettingsDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    setTelemetryConsent('granted');
  });

  it('lets people turn sharing off and on again', () => {
    render(<TelemetrySettingsDialog open onOpenChange={() => undefined} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(getTelemetryConsent()).toBe('denied');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('switch'));
    expect(getTelemetryConsent()).toBe('granted');
  });
});
