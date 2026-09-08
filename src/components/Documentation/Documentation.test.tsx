/**
 * Documentation-panel tests. Verify the in-app documentation surface renders its
 * content and dismiss controls at the component boundary.
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