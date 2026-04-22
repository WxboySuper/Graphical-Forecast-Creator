jest.setTimeout(10000);

afterEach(() => {
  jest.resetAllMocks();
});

describe('renderOutlooksToMap', () => {
  test('renders geoJSON features onto map using mocked leaflet.geoJSON', async () => {
    jest.resetModules();

    // Mock leaflet.geoJSON to provide an addTo that records additions
    jest.doMock('leaflet', () => ({
      geoJSON: (feature: any, opts: any) => ({
        addTo: (map: any) => {
          map.added = map.added || [];
          map.added.push({ feature, opts, style: opts && typeof opts.style === 'function' ? opts.style() : null });
          return { };
        }
      })
    }));

    // Mock color mappings to keep getFeatureStyle predictable
    jest.doMock('./outlookUtils', () => ({
      colorMappings: {
        categorical: { '5%': '#00ff00' },
        tornado: {},
        wind: {},
        hail: {},
        totalSevere: {},
        'day4-8': {},
        hatching: {}
      }
    }));

    const { renderOutlooksToMap } = await import('./exportUtils');

    const mapInstance: any = {};

    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]] }
    };

    const outlooks: any = { categorical: new Map([['5%', [feature]]]) };

    renderOutlooksToMap(mapInstance, outlooks);

    expect(mapInstance.added).toBeTruthy();
    expect(mapInstance.added.length).toBeGreaterThan(0);
    expect(mapInstance.added[0].feature).toBe(feature);
  });
});
