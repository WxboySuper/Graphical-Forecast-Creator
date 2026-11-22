/**
 * Discussion form state tests. Verify draft editing, validation, and submission state transitions.
 */
import { act, renderHook } from '@testing-library/react';
import useDiscussionFormState, { getDiscussionFormDefaults } from './useDiscussionFormState';
import type { DiscussionData } from '../types/outlooks';

const loadedDiscussion: DiscussionData = {
  mode: 'diy',
  validStart: '2026-07-13T00:00',
  validEnd: '2026-07-14T00:00',
  forecasterName: 'Loaded forecaster',
  diyContent: 'Loaded discussion text',
  lastModified: '2026-07-13T00:00:00.000Z',
};

describe('useDiscussionFormState', () => {
  test('does not arm autosave when a discussion scope is loaded, but does after an edit', () => {
    jest.useFakeTimers();
    const dispatch = jest.fn();
    const { result, rerender } = renderHook(
      ({ discussionKey, existingDiscussion }: { discussionKey: string; existingDiscussion?: DiscussionData }) =>
        useDiscussionFormState({
          discussionKey,
          existingDiscussion,
          defaultForecasterName: 'Default forecaster',
          dispatch,
        }),
      { initialProps: { discussionKey: 'group-a', existingDiscussion: undefined } },
    );

    rerender({ discussionKey: 'group-b', existingDiscussion: loadedDiscussion });

    expect(result.current.hasUnsavedChanges).toBe(false);
    jest.advanceTimersByTime(6000);
    expect(dispatch).not.toHaveBeenCalled();

    act(() => result.current.handleDiy('Edited discussion text'));

    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('reloads imported discussion data without remounting the editor', () => {
    const importedDiscussion = { ...loadedDiscussion, diyContent: 'Imported discussion text' };
    const { result, rerender } = renderHook(
      ({ existingDiscussion, resetToken }: { existingDiscussion?: DiscussionData; resetToken: number }) =>
        useDiscussionFormState({
          discussionKey: 'group-a',
          existingDiscussion,
          defaultForecasterName: 'Default forecaster',
          dispatch: jest.fn(),
          resetToken,
        }),
      { initialProps: { existingDiscussion: loadedDiscussion, resetToken: 0 } },
    );

    act(() => result.current.handleDiy('Unsaved discussion text'));
    rerender({ existingDiscussion: importedDiscussion, resetToken: 1 });

    expect(result.current.diyContent).toBe('Imported discussion text');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  test('discards unsaved drafts for every scope when an import also changes discussion scope', () => {
    const importedDiscussion = { ...loadedDiscussion, diyContent: 'Imported scope text' };
    const initialProps: { discussionKey: string; existingDiscussion?: DiscussionData; resetToken: number } = {
      discussionKey: 'group-a',
      existingDiscussion: undefined,
      resetToken: 0,
    };
    const { result, rerender } = renderHook(
      ({ discussionKey, existingDiscussion, resetToken }: { discussionKey: string; existingDiscussion?: DiscussionData; resetToken: number }) =>
        useDiscussionFormState({
          discussionKey,
          existingDiscussion,
          defaultForecasterName: 'Default forecaster',
          dispatch: jest.fn(),
          resetToken,
        }),
      { initialProps },
    );

    act(() => result.current.handleDiy('Unsaved original scope text'));
    rerender({ discussionKey: 'group-b', existingDiscussion: importedDiscussion, resetToken: 1 });
    expect(result.current.diyContent).toBe('Imported scope text');

    act(() => result.current.handleDiy('Edited imported scope text'));
    rerender({ discussionKey: 'group-a', existingDiscussion: undefined, resetToken: 1 });
    // The import replaced the cycle, so the old scope's unsaved text must not resurface.
    expect(result.current.diyContent).not.toBe('Unsaved original scope text');
  });

  test('new discussions default to local wall-clock times with a 24-hour window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 13, 9, 5));

    const defaults = getDiscussionFormDefaults();

    expect(defaults.validStart).toBe('2026-07-13T09:05');
    // 24 hours later in local wall-clock.
    expect(defaults.validEnd).toBe('2026-07-14T09:05');
    jest.useRealTimers();
  });

  test('existing discussions load with preserved local wall-clock times', () => {
    const defaults = getDiscussionFormDefaults(loadedDiscussion);
    expect(defaults.validStart).toBe('2026-07-13T00:00');
    expect(defaults.validEnd).toBe('2026-07-14T00:00');
  });

  test('existing discussions stored as UTC timestamps convert to local wall-clock', () => {
    const utcDiscussion: DiscussionData = {
      ...loadedDiscussion,
      validStart: '2026-07-13T12:00:00.000Z',
      validEnd: '2026-07-14T12:00:00.000Z',
    };
    const defaults = getDiscussionFormDefaults(utcDiscussion);
    const expectedStart = new Date('2026-07-13T12:00:00.000Z');
    const expectedEnd = new Date('2026-07-14T12:00:00.000Z');
    expect(defaults.validStart).toBe(
      `${expectedStart.getFullYear()}-${String(expectedStart.getMonth() + 1).padStart(2, '0')}-${String(expectedStart.getDate()).padStart(2, '0')}T${String(expectedStart.getHours()).padStart(2, '0')}:${String(expectedStart.getMinutes()).padStart(2, '0')}`
    );
    expect(defaults.validEnd).toBe(
      `${expectedEnd.getFullYear()}-${String(expectedEnd.getMonth() + 1).padStart(2, '0')}-${String(expectedEnd.getDate()).padStart(2, '0')}T${String(expectedEnd.getHours()).padStart(2, '0')}:${String(expectedEnd.getMinutes()).padStart(2, '0')}`
    );
  });
});
