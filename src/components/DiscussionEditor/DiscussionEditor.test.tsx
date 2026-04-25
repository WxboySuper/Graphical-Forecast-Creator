import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DiscussionEditor from './DiscussionEditor';
import forecastReducer, { updateDiscussion } from '../../store/forecastSlice';
import { exportDiscussionToFile } from '../../utils/discussionUtils';

jest.mock('./DIYDiscussionEditor', () => ({
  __esModule: true,
  default: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
    <textarea aria-label="DIY content" value={content} onChange={(event) => onChange(event.target.value)} />
  ),
}));

jest.mock('./GuidedDiscussionEditor', () => ({
  __esModule: true,
  default: ({ content, onChange }: { content: { synopsis: string }; onChange: (value: unknown) => void }) => (
    <button onClick={() => onChange({ ...content, synopsis: 'Guided synopsis' })}>Update Guided</button>
  ),
}));

jest.mock('../../utils/discussionUtils', () => ({
  compileDiscussionToText: jest.fn((discussion, day) => `Day ${day}: ${discussion.mode}:${discussion.forecasterName}`),
  exportDiscussionToFile: jest.fn(),
}));

const createStore = () =>
  configureStore({
    reducer: { forecast: forecastReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

const renderEditor = (store = createStore(), onClose = jest.fn()) => ({
  store,
  onClose,
  ...render(
    <Provider store={store}>
      <DiscussionEditor onClose={onClose} />
    </Provider>
  ),
});

describe('DiscussionEditor', () => {
  test('edits DIY metadata/content, previews, exports, and saves to Redux', () => {
    const { store, onClose } = renderEditor();

    fireEvent.change(screen.getByLabelText(/Forecaster/i), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('DIY content'), { target: { value: 'Storm discussion' } });
    fireEvent.click(screen.getByText(/Preview Output/i));

    expect(screen.getByText('Day 1: diy:Alex')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Export as Text/i));
    expect(exportDiscussionToFile).toHaveBeenCalledWith(expect.objectContaining({ forecasterName: 'Alex' }), 1);

    fireEvent.click(screen.getByText(/Edit Discussion/i));
    fireEvent.click(screen.getByText(/Save Discussion/i));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.getState().forecast.forecastCycle.days[1]?.discussion).toEqual(
      expect.objectContaining({
        mode: 'diy',
        forecasterName: 'Alex',
        diyContent: 'Storm discussion',
      })
    );
  });

  test('switches to guided mode and preserves guided content in the saved draft', () => {
    const store = createStore();
    store.dispatch(
      updateDiscussion({
        day: 1,
        discussion: {
          mode: 'guided',
          validStart: '2026-04-24T12:00',
          validEnd: '2026-04-25T12:00',
          forecasterName: 'Existing',
          guidedContent: {
            synopsis: 'Existing synopsis',
            meteorologicalSetup: '',
            severeWeatherExpectations: '',
            timing: '',
            regionalBreakdown: '',
            additionalConsiderations: '',
          },
          lastModified: '2026-04-24T12:00:00.000Z',
        },
      })
    );

    renderEditor(store);
    fireEvent.click(screen.getByText('Update Guided'));
    fireEvent.click(screen.getByText(/DIY Editor/i));
    fireEvent.click(screen.getByText(/Guided Builder/i));
    fireEvent.click(screen.getByText(/Save Discussion/i));

    expect(store.getState().forecast.forecastCycle.days[1]?.discussion).toEqual(
      expect.objectContaining({
        mode: 'guided',
        guidedContent: expect.objectContaining({ synopsis: 'Guided synopsis' }),
      })
    );
  });
});
