import { fireEvent, render, screen } from '@testing-library/react';
import ToSModal, { hasAcceptedToS } from './ToSModal';

describe('ToSModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('tracks current ToS acceptance and gates the accept button behind the checkbox', () => {
    const onAccept = jest.fn();
    render(<ToSModal onAccept={onAccept} />);

    const acceptButton = screen.getByRole('button', { name: /Accept & Continue/i });
    expect(hasAcceptedToS()).toBe(false);
    expect(acceptButton).toBeDisabled();

    fireEvent.click(acceptButton);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(acceptButton).toBeEnabled();
    fireEvent.click(acceptButton);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(hasAcceptedToS()).toBe(true);
  });

  test('supports view-only close controls', () => {
    const onClose = jest.fn();
    render(<ToSModal onAccept={jest.fn()} viewOnly onClose={onClose} />);

    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]);
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
