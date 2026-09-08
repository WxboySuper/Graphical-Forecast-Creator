/**
 * Layout component barrel. Exports the application shell, floating panel, and
 * shared layout types from one import boundary.
 */
export { Navbar } from './Navbar';
export { AppLayout, useAppLayout, AppLayoutContext } from './AppLayout';
export type { AddToastFn, ToastItem } from './AppLayout';
export { FloatingPanel } from './FloatingPanel';