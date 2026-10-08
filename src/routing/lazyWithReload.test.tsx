import { Component, Suspense, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { isChunkLoadError, lazyWithReload } from './lazyWithReload';

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const renderSuspended = (ui: ReactNode) =>
  render(
    <Boundary fallback={<div>Something went wrong</div>}>
      <Suspense fallback={<div>Loading</div>}>{ui}</Suspense>
    </Boundary>
  );

describe('isChunkLoadError', () => {
  test('matches the GFC-WEB-16 CSS preload failure', () => {
    expect(
      isChunkLoadError(new Error('Unable to preload CSS for https://gfc.weatherboysuper.com/assets/ForecastMap-2yPt00pt.css'))
    ).toBe(true);
  });

  test.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/ForecastPage-abc.js',
    'Importing a module script failed.',
    'Loading chunk 42 failed.',
  ])('matches bundler chunk failure: %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  test('matches ChunkLoadError by name', () => {
    const error = new Error('chunk missing');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  test.each([[null], [undefined], [new Error('boom')], ['plain string']])('rejects non-chunk failures: %p', (value) => {
    expect(isChunkLoadError(value)).toBe(false);
  });
});

describe('lazyWithReload', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('renders the route when the chunk loads', async () => {
    const reload = jest.fn();
    const Page = lazyWithReload('forecast', () => Promise.resolve({ default: () => <div>Forecast page</div> }), reload);

    renderSuspended(<Page />);

    expect(await screen.findByText('Forecast page')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  test('reloads once on a chunk failure and stays on the fallback', async () => {
    const reload = jest.fn();
    const Page = lazyWithReload(
      'forecast',
      () => Promise.reject(new Error('Unable to preload CSS for https://gfc.weatherboysuper.com/assets/ForecastMap-abc.css')),
      reload
    );

    renderSuspended(<Page />);

    expect(await screen.findByText('Loading')).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('gfc-chunk-reload:forecast')).toBe('1');
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  test('throws to the boundary instead of reloading twice', async () => {
    sessionStorage.setItem('gfc-chunk-reload:forecast', '1');
    const reload = jest.fn();
    const Page = lazyWithReload(
      'forecast',
      () => Promise.reject(new Error('Unable to preload CSS for https://gfc.weatherboysuper.com/assets/ForecastMap-abc.css')),
      reload
    );

    renderSuspended(<Page />);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  test('does not reload on ordinary component errors', async () => {
    const reload = jest.fn();
    const Page = lazyWithReload('forecast', () => Promise.reject(new Error('render bug')), reload);

    renderSuspended(<Page />);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
