import * as L from 'leaflet';

export type PMMap = L.Map & {
  pm?: {
    disableDraw?: () => void;
    addControls?: (opts: Record<string, unknown>) => void;
    setGlobalOptions?: (opts: Record<string, unknown>) => void;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    globalDrawModeEnabled?: () => boolean;
  };
};
