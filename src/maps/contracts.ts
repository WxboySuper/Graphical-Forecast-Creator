/**
 * Map contracts. Defines shared types and boundaries for map layers, features, and editing integrations.
 */
export type MapEngine = 'openlayers';

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

export interface MapAdapterHandle<TMap = unknown> {
  getMap: () => TMap | null;
  getEngine: () => MapEngine;
  getView: () => MapViewState;
}

export interface MapFeatureCreateEvent {
  featureId: string;
  outlookType: string;
  probability: string;
}