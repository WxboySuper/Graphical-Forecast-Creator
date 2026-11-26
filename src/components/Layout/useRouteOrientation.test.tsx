import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { useRouteOrientation } from './useRouteOrientation';

let navigateTo: (path: string) => void = () => undefined;

const Harness = () => {
  const mainRef = useRef<HTMLElement>(null);
  navigateTo = useNavigate();
  useRouteOrientation(mainRef);
  return (
    <>
      <button type="button">Nav link</button>
      <main ref={mainRef} tabIndex={-1}>content</main>
    </>
  );
};

describe('useRouteOrientation', () => {
  it('titles the page and moves focus to main only after a pathname change', () => {
    render(<MemoryRouter initialEntries={['/forecast/severe']}><Harness /></MemoryRouter>);
    const link = screen.getByRole('button', { name: 'Nav link' });
    link.focus();

    expect(document.title).toBe('Severe Forecast | Graphical Forecast Creator');
    expect(link).toHaveFocus();

    act(() => navigateTo('/forecast/severe?surface=discussion'));
    expect(document.title).toBe('Severe Discussion | Graphical Forecast Creator');
    expect(link).toHaveFocus();

    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    act(() => navigateTo('/verification'));
    expect(document.title).toBe('Verification | Graphical Forecast Creator');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
  });

  it('leaves focus inside an open modal when the route changes', () => {
    render(<MemoryRouter initialEntries={['/']}><Harness /></MemoryRouter>);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const dialogButton = document.createElement('button');
    dialog.appendChild(dialogButton);
    document.body.appendChild(dialog);
    dialogButton.focus();

    act(() => navigateTo('/verification'));
    expect(dialogButton).toHaveFocus();
    dialog.remove();
  });
});
