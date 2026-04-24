import { render, screen } from '@testing-library/react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './dropdown-menu';

jest.mock('@radix-ui/react-dropdown-menu', () => {
  const React = require('react');
  const forward =
    (tag: keyof JSX.IntrinsicElements) =>
    React.forwardRef(({ children, ...props }: React.HTMLAttributes<HTMLElement>, ref: React.Ref<HTMLElement>) =>
      React.createElement(tag, { ...props, ref }, children)
    );

  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return {
    Root: passthrough,
    Trigger: forward('button'),
    Group: forward('div'),
    Portal: passthrough,
    Sub: passthrough,
    RadioGroup: forward('div'),
    SubTrigger: Object.assign(forward('button'), { displayName: 'SubTrigger' }),
    SubContent: Object.assign(forward('div'), { displayName: 'SubContent' }),
    Content: Object.assign(forward('div'), { displayName: 'Content' }),
    Item: Object.assign(forward('div'), { displayName: 'Item' }),
    CheckboxItem: Object.assign(forward('div'), { displayName: 'CheckboxItem' }),
    RadioItem: Object.assign(forward('div'), { displayName: 'RadioItem' }),
    ItemIndicator: passthrough,
    Label: Object.assign(forward('div'), { displayName: 'Label' }),
    Separator: Object.assign(forward('hr'), { displayName: 'Separator' }),
  };
});

describe('dropdown menu wrappers', () => {
  test('renders item variants with inset and custom classes', () => {
    render(
      <>
        <DropdownMenuItem inset className="custom-item">Open</DropdownMenuItem>
        <DropdownMenuLabel inset className="custom-label">Options</DropdownMenuLabel>
        <DropdownMenuShortcut className="custom-shortcut">⌘K</DropdownMenuShortcut>
        <DropdownMenuSeparator className="custom-separator" />
      </>
    );

    expect(screen.getByText('Open')).toHaveClass('pl-8', 'custom-item');
    expect(screen.getByText('Options')).toHaveClass('pl-8', 'custom-label');
    expect(screen.getByText('⌘K')).toHaveClass('custom-shortcut');
  });

  test('renders checkbox, radio, and submenu wrappers with indicators', () => {
    render(
      <>
        <DropdownMenuCheckboxItem checked>Checked item</DropdownMenuCheckboxItem>
        <DropdownMenuRadioItem value="one">Radio item</DropdownMenuRadioItem>
        <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>Nested</DropdownMenuSubContent>
      </>
    );

    expect(screen.getByText('Checked item')).toBeInTheDocument();
    expect(screen.getByText('Radio item')).toBeInTheDocument();
    expect(screen.getByText('More')).toHaveClass('pl-8');
    expect(screen.getByText('Nested')).toBeInTheDocument();
  });
});
