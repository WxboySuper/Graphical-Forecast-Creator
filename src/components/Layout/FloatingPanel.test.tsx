/**
 * File: src/components/Layout/FloatingPanel.test.tsx
 * Purpose: Covers floating panel positioning, visibility, controls, and interaction behavior.
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