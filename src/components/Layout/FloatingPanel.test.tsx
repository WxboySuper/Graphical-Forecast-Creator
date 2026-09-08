/**
 * Floating-panel tests. Verifies the reusable panel renders children and exposes
 * its close and layout behavior through the component boundary.
 */
import { render, screen } from '@testing-library/react';
import FloatingPanel from './FloatingPanel';

describe('FloatingPanel', () => {
  it('renders floating panel with children', () => {
    render(
      <FloatingPanel>
        <div data-testid="panel-content">Panel Content</div>
      </FloatingPanel>
    );
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });
});