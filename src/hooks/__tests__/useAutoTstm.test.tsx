import { act } from '@testing-library/react';
import { AUTO_TSTM_DISABLED_MESSAGE } from '../../config/autoTstmDisable';
import {
  mockedRequestLatest,
  renderAutoTstm,
} from '../../testing/autoTstmTestHarness';

describe('useAutoTstm (HREF decommission disable)', () => {
  beforeEach(() => {
    mockedRequestLatest.mockReset();
  });

  test('does not fetch when the panel is closed', () => {
    renderAutoTstm();
    expect(mockedRequestLatest).not.toHaveBeenCalled();
  });

  test('blocks panel fetch without hitting the network and surfaces the disabled message', async () => {
    const { result } = renderAutoTstm();

    await act(async () => {
      await result.current.fetchPreview();
    });

    expect(mockedRequestLatest).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe(AUTO_TSTM_DISABLED_MESSAGE);
    expect(result.current.previewResponse).toBeNull();
  });

  test('opening the panel does not trigger a network fetch', async () => {
    const { result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    expect(mockedRequestLatest).not.toHaveBeenCalled();
  });
});
