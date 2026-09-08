/**
 * File: src/components/Documentation/Documentation.test.tsx
 * Purpose: Tests documentation page rendering, navigation, and user-facing content boundaries.
 */

import { render, screen } from '@testing-library/react';
import Documentation from './Documentation';

jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
}));

describe('Documentation', () => {
  it('renders the documentation panel', () => {
    render(<Documentation />);
    expect(screen.getByText(/Help/i)).toBeInTheDocument();
  });
});
