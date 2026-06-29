import { render, screen, waitFor } from '@testing-library/react';
import {
  fetchServerCapabilityStatus,
  isServerCapabilityAvailable,
  markServerCapabilityUnavailable,
  resetServerCapabilityStatusState,
  useServerCapabilityAvailable,
} from './serverCapabilityStatus';

const CapabilityProbe = () => {
  const available = useServerCapabilityAvailable('autoTstm');
  return <div>{available ? 'available' : 'unavailable'}</div>;
};

describe('serverCapabilityStatus', () => {
  afterEach(() => {
    resetServerCapabilityStatusState();
    jest.restoreAllMocks();
  });

  test('fails closed before status is loaded', () => {
    expect(isServerCapabilityAvailable('TSTM_GENERATION_ENABLED')).toBe(false);
  });

  test('treats unavailable server status as disabled', () => {
    expect(
      isServerCapabilityAvailable('TSTM_GENERATION_ENABLED', {
        loaded: true,
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      })
    ).toBe(false);
  });

  test('marks a capability unavailable after a disabled API response', () => {
    markServerCapabilityUnavailable('TSTM_GENERATION_ENABLED');
    expect(
      isServerCapabilityAvailable('TSTM_GENERATION_ENABLED', {
        loaded: true,
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      })
    ).toBe(false);
  });

  test('fetchServerCapabilityStatus validates the response shape', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      }),
    }) as jest.Mock;

    try {
      await expect(fetchServerCapabilityStatus()).resolves.toMatchObject({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('useServerCapabilityAvailable fails closed when status fetch fails', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as jest.Mock;

    try {
      render(<CapabilityProbe />);
      await waitFor(() => {
        expect(screen.getByText('unavailable')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('useServerCapabilityAvailable reflects emergency-disabled server status', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: false,
            reason: 'emergency_disabled',
          },
        },
      }),
    }) as jest.Mock;

    try {
      render(<CapabilityProbe />);
      await waitFor(() => {
        expect(screen.getByText('unavailable')).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
