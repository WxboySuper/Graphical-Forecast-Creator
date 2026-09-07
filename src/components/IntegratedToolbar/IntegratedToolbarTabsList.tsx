import React from 'react';
import { CalendarDays, Layers, PenTool, Wrench } from 'lucide-react';
import { TabsList, TabsTrigger } from '../ui/tabs';

export type TabbedToolbarTabKey = 'draw' | 'days' | 'layers' | 'tools';

/** Toolbar tabs list (extracted to reduce nesting depth in the header). */
export const TabbedIntegratedToolbarTabsList: React.FC<{
  activeTab: TabbedToolbarTabKey;
  onTabChange: (value: TabbedToolbarTabKey) => void;
}> = ({ activeTab, onTabChange }) => {
  const tabsListRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRefs = React.useRef<Record<TabbedToolbarTabKey, HTMLButtonElement | null>>({
    draw: null,
    days: null,
    layers: null,
    tools: null,
  });
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    /** Re-measure the active trigger and update the sliding indicator position. */
    const measure = () => {
      const tabsList = tabsListRef.current;
      const trigger = triggerRefs.current[activeTab];

      if (!tabsList || !trigger) {
        return;
      }

      const tabsRect = tabsList.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();

      setIndicatorStyle({
        width: triggerRect.width,
        transform: `translateX(${triggerRect.left - tabsRect.left}px)`,
      });
    };

    measure();
  }, [activeTab]);

  React.useEffect(function setupTabIndicatorObserver() {
    const tabsList = tabsListRef.current;
    if (!tabsList || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      const trigger = triggerRefs.current[activeTab];
      if (!tabsList.isConnected || !trigger) {
        return;
      }

      const tabsRect = tabsList.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();

      setIndicatorStyle({
        width: triggerRect.width,
        transform: `translateX(${triggerRect.left - tabsRect.left}px)`,
      });
    });
    observer.observe(tabsList);
    Object.values(triggerRefs.current).forEach((trigger) => {
      if (trigger) observer.observe(trigger);
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanup() {
      observer.disconnect();
    };
  }, [activeTab]);

  return (
    <TabsList
      ref={tabsListRef}
      className="tabbed-integrated-toolbar__tabs-list relative z-10 mb-[-1px] h-auto gap-1 bg-transparent p-0"
      aria-label="Forecast toolbar sections"
    >
      <span
        className="tabbed-integrated-toolbar__tab-indicator pointer-events-none absolute inset-y-0 left-0"
        style={indicatorStyle}
        aria-hidden="true"
      />
      <TabsTrigger
        value="draw"
        ref={(node) => {
          triggerRefs.current.draw = node;
        }}
        onClick={() => onTabChange('draw')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <PenTool className="h-4 w-4" />
        Draw
      </TabsTrigger>
      <TabsTrigger
        value="days"
        ref={(node) => {
          triggerRefs.current.days = node;
        }}
        onClick={() => onTabChange('days')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <CalendarDays className="h-4 w-4" />
        Days
      </TabsTrigger>
      <TabsTrigger
        value="layers"
        ref={(node) => {
          triggerRefs.current.layers = node;
        }}
        onClick={() => onTabChange('layers')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <Layers className="h-4 w-4" />
        Layers
      </TabsTrigger>
      <TabsTrigger
        value="tools"
        ref={(node) => {
          triggerRefs.current.tools = node;
        }}
        onClick={() => onTabChange('tools')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <Wrench className="h-4 w-4" />
        Tools
      </TabsTrigger>
    </TabsList>
  );
};

