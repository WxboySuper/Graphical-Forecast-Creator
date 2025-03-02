/// <reference types="react-scripts" />

declare module 'react-leaflet-draw' {
  import { FC } from 'react';
  import * as L from 'leaflet';

  interface EditControlProps {
    position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
    onCreated?: (e: { layerType: string; layer: L.Layer }) => void;
    draw?: {
      polyline?: boolean | L.DrawOptions.PolylineOptions;
      polygon?: boolean | L.DrawOptions.PolygonOptions;
      circle?: boolean | L.DrawOptions.CircleOptions;
      rectangle?: boolean | L.DrawOptions.RectangleOptions;
      marker?: boolean | L.DrawOptions.MarkerOptions;
      circlemarker?: boolean | L.DrawOptions.CircleMarkerOptions;
    };
    edit?: {
      edit?: boolean;
      remove?: boolean;
      featureGroup?: L.FeatureGroup;
    };
  }

  export const EditControl: FC<EditControlProps>;
}
