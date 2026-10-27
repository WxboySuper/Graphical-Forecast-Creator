import { cloneJsonValue } from './cloneJsonValue';

describe('cloneJsonValue', () => {
  test('preserves an own __proto__ key without changing the clone prototype', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<string, unknown>;

    const cloned = cloneJsonValue(input) as Record<string, unknown>;

    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(cloned, '__proto__')).toBe(true);
    expect(cloned.__proto__).toEqual({ polluted: true });
    expect(cloned.ok).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('deep-clones nested arrays and objects without sharing references', () => {
    const input = {
      id: 'feature-1',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
      properties: { outlook: 'TSTM', tags: ['a', 'b'], nested: { level: 2 } },
      nullable: null,
      count: 3,
      enabled: true,
    };

    const cloned = cloneJsonValue(input);

    expect(cloned).toEqual(input);
    expect(cloned).not.toBe(input);
    expect(cloned.geometry).not.toBe(input.geometry);
    expect(cloned.geometry.coordinates).not.toBe(input.geometry.coordinates);
    expect(cloned.geometry.coordinates[0]).not.toBe(input.geometry.coordinates[0]);
    expect(cloned.properties).not.toBe(input.properties);
    expect(cloned.properties.tags).not.toBe(input.properties.tags);
    expect(cloned.properties.nested).not.toBe(input.properties.nested);
  });

  test('leaves the source feature untouched when the clone is mutated', () => {
    const source = { properties: { tags: ['a'] }, geometry: { coordinates: [[[0, 0]]] } };

    const cloned = cloneJsonValue(source);
    cloned.properties.tags.push('b');
    cloned.geometry.coordinates[0].push([1, 1]);

    expect(source).toEqual({ properties: { tags: ['a'] }, geometry: { coordinates: [[[0, 0]]] } });
  });

  /**
   * The helper's documented contract is plain JSON-like values only, so the
   * tests below pin the current behavior of the non-plain-object branches: a
   * Map, Set, or Date has no enumerable own keys and therefore clones to an
   * empty plain object. Pinning it here means a refactor that starts feeding
   * richer values through history snapshots fails loudly instead of silently
   * changing what undo restores.
   */
  test('clones Map and Set values to empty plain objects rather than preserving them', () => {
    expect(cloneJsonValue(new Map([['TSTM', []]]))).toEqual({});
    expect(cloneJsonValue(new Set(['TSTM']))).toEqual({});

    const clone = cloneJsonValue({
      dayData: new Map([['TSTM', [{ probability: 30 }]]]),
      lookup: new Set(['1']),
      label: 'day1',
    });

    expect(clone).toEqual({ dayData: {}, lookup: {}, label: 'day1' });
    expect(clone.dayData).not.toBeInstanceOf(Map);
    expect(clone.lookup).not.toBeInstanceOf(Set);
  });

  test('clones Date and class instances to plain objects of their own enumerable keys', () => {
    class OutlookMeta {
      readonly label = 'day1';

      get parsed(): string {
        return this.label.toUpperCase();
      }
    }

    expect(cloneJsonValue(new Date(0))).toEqual({});

    const clonedInstance = cloneJsonValue(new OutlookMeta());
    expect(clonedInstance).toEqual({ label: 'day1' });
    expect(clonedInstance).not.toBeInstanceOf(OutlookMeta);
  });

  test('returns primitives and undefined unchanged', () => {
    expect(cloneJsonValue(undefined)).toBeUndefined();
    expect(cloneJsonValue(null)).toBeNull();
    expect(cloneJsonValue(0)).toBe(0);
    expect(cloneJsonValue('')).toBe('');
    expect(cloneJsonValue(false)).toBe(false);
  });

  test('keeps restored properties writable and enumerable when dangerous keys are preserved', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<string, unknown>;

    const cloned = cloneJsonValue(input, true) as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(cloned, '__proto__');

    expect(descriptor).toEqual({
      configurable: true,
      enumerable: true,
      value: { polluted: true },
      writable: true,
    });
    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
  });
});
