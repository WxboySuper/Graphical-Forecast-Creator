import React from 'react';
import { render, screen } from '@testing-library/react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';

jest.mock('@radix-ui/react-popover', () => {
  const React = require('react');
  return {
    Root: ({ children }: { children: React.ReactNode }) => <div data-testid="root">{children}</div>,
    Trigger: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
      (props, ref) => <button ref={ref} {...props} />
    ),
    Anchor: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      (props, ref) => <div ref={ref} data-testid="anchor" {...props} />
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <div data-testid="portal">{children}</div>,
    Content: Object.assign(
      React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { align?: string; sideOffset?: number }>(
        ({ align, sideOffset, ...props }, ref) => (
          <div ref={ref} data-align={align} data-side-offset={sideOffset} {...props} />
        )
      ),
      { displayName: 'PopoverContentPrimitive' }
    ),
  };
});

describe('Popover components', () => {
  it('renders trigger, anchor, and content with defaults', () => {
    const ref = React.createRef<HTMLDivElement>();

    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverAnchor>Anchor</PopoverAnchor>
        <PopoverContent ref={ref}>Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByTestId('anchor')).toHaveTextContent('Anchor');
    expect(screen.getByText('Content')).toHaveAttribute('data-align', 'center');
    expect(screen.getByText('Content')).toHaveAttribute('data-side-offset', '4');
    expect(screen.getByText('Content')).toHaveClass('z-dropdown', 'w-72');
    expect(ref.current).toBe(screen.getByText('Content'));
  });

  it('allows custom alignment, offset, and classes', () => {
    render(<PopoverContent align="start" sideOffset={12} className="extra">Menu</PopoverContent>);

    expect(screen.getByText('Menu')).toHaveAttribute('data-align', 'start');
    expect(screen.getByText('Menu')).toHaveAttribute('data-side-offset', '12');
    expect(screen.getByText('Menu')).toHaveClass('extra');
  });
});
