import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from '../ui/tabs';
import {
  TabbedIntegratedToolbarTabsList,
  type TabbedToolbarTabKey,
} from './IntegratedToolbarTabsList';

type ResizeCallback = () => void;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeCallback;
  observed = new Set<Element>();
  disconnected = false;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  fire() {
    this.callback();
  }
}

const rectFor = (left: number, width: number) =>
  ({
    left,
    width,
    right: left + width,
    top: 0,
    bottom: 32,
    height: 32,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const installGeometry = () => {
  const tabsRect = rectFor(0, 400);
  const triggerRects: Record<TabbedToolbarTabKey, DOMRect> = {
    draw: rectFor(0, 80),
    days: rectFor(80, 90),
    layers: rectFor(170, 100),
    tools: rectFor(270, 110),
  };

  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'tablist') {
      return tabsRect;
    }
    const text = (this.textContent ?? '').trim().toLowerCase();
    if (text.includes('draw')) return triggerRects.draw;
    if (text.includes('days')) return triggerRects.days;
    if (text.includes('layers')) return triggerRects.layers;
    if (text.includes('tools')) return triggerRects.tools;
    const value = this.getAttribute('value') as TabbedToolbarTabKey | null;
    if (value && triggerRects[value]) {
      return triggerRects[value];
    }
    return rectFor(0, 0);
  });

  return { tabsRect, triggerRects };
};

const renderTabsList = (activeTab: TabbedToolbarTabKey, onTabChange = jest.fn()) => {
  const result = render(
    <Tabs value={activeTab}>
      <TabbedIntegratedToolbarTabsList activeTab={activeTab} onTabChange={onTabChange} />
    </Tabs>
  );
  return { ...result, onTabChange };
};

describe('TabbedIntegratedToolbarTabsList', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  test('renders all tabs and forwards tab selection', async () => {
    installGeometry();
    const user = userEvent.setup();
    const { onTabChange } = renderTabsList('draw');

    expect(screen.getByRole('tab', { name: /Draw/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Days/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Layers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tools/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(onTabChange).toHaveBeenCalledWith('layers');
  });

  test('positions the indicator from the active trigger geometry', () => {
    installGeometry();
    const { rerender } = renderTabsList('draw');

    expect(screen.getByTestId('toolbar-tab-indicator')).toHaveStyle({ width: '80px', transform: 'translateX(0px)' });

    rerender(
      <Tabs value="tools">
        <TabbedIntegratedToolbarTabsList activeTab="tools" onTabChange={jest.fn()} />
      </Tabs>
    );
    expect(screen.getByTestId('toolbar-tab-indicator')).toHaveStyle({
      width: '110px',
      transform: 'translateX(270px)',
    });
  });

  test('keeps a single observer across tab changes and re-measures on resize', () => {
    const { triggerRects } = installGeometry();
    const { rerender } = renderTabsList('draw');

    expect(MockResizeObserver.instances).toHaveLength(1);
    const observer = MockResizeObserver.instances[0];
    expect(observer.observed.size).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('toolbar-tab-indicator')).toHaveStyle({ width: '80px', transform: 'translateX(0px)' });

    rerender(
      <Tabs value="days">
        <TabbedIntegratedToolbarTabsList activeTab="days" onTabChange={jest.fn()} />
      </Tabs>
    );

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(observer.disconnected).toBe(false);
    expect(screen.getByTestId('toolbar-tab-indicator')).toHaveStyle({ width: '90px', transform: 'translateX(80px)' });

    triggerRects.days = rectFor(120, 130);
    act(() => {
      observer.fire();
    });
    expect(screen.getByTestId('toolbar-tab-indicator')).toHaveStyle({ width: '130px', transform: 'translateX(120px)' });
  });
});
