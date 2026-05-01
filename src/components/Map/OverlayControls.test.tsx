import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import OverlayControls from './OverlayControls';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({
    overlays: { showStateBorders: false, showCounties: false },
  }),
}));
jest.mock('../../store/overlaysSlice', () => ({
  toggleStateBorders: () => ({ type: 'overlays/toggleStateBorders' }),
  toggleCounties: () => ({ type: 'overlays/toggleCounties' }),
}));

beforeEach(() => mockDispatch.mockClear());

describe('OverlayControls', () => {
  it('renders state borders and counties checkboxes', () => {
    const { getByLabelText } = render(<OverlayControls />);
    expect(getByLabelText(/state borders/i)).toBeInTheDocument();
    expect(getByLabelText(/counties/i)).toBeInTheDocument();
  });

  it('dispatches toggleStateBorders when checkbox is clicked', () => {
    const { getByLabelText } = render(<OverlayControls />);
    fireEvent.click(getByLabelText(/state borders/i));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'overlays/toggleStateBorders' });
  });

  it('dispatches toggleCounties when checkbox is clicked', () => {
    const { getByLabelText } = render(<OverlayControls />);
    fireEvent.click(getByLabelText(/counties/i));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'overlays/toggleCounties' });
  });
});