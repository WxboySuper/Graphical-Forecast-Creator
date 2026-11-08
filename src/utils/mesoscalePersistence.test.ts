import { createInitialMesoscaleState } from '../store/mesoscaleSlice';
import { classifyMesoscaleSave, createMesoscaleSave, exportMesoscaleJson, getMesoscaleStorageKey, importMesoscaleJson, loadMesoscaleAutosave, saveMesoscaleAutosave } from './mesoscalePersistence';

describe('Mesoscale persistence', () => {
  beforeEach(() => localStorage.clear());
  test('round trips a versioned product through JSON export/import', () => {
    const product = { ...createInitialMesoscaleState(), discussion: 'Scattered storms expected.' };
    const transfer = exportMesoscaleJson(product);
    expect(transfer.filename).toMatch(/^gfc-mesoscale-forecast-/);
    expect(importMesoscaleJson(transfer.json)).toEqual(product);
  });
  test('rejects unknown owner, severe saves, malformed and oversized products', () => {
    expect(classifyMesoscaleSave({ ...createMesoscaleSave(createInitialMesoscaleState()), workspaceId: 'severe' }).ok).toBe(false);
    expect(classifyMesoscaleSave({ workspaceId: 'mesoscale', schemaVersion: 1, product: {} })).toMatchObject({ ok: false });
    expect(() => importMesoscaleJson(JSON.stringify({ workspaceId: 'severe' }))).toThrow(/different forecast workspace/i);
    const tooLong = { ...createInitialMesoscaleState(), discussion: 'x'.repeat(50001) };
    expect(() => createMesoscaleSave(tooLong)).toThrow(/exceeds/i);
    expect(() => createMesoscaleSave({ ...createInitialMesoscaleState(), extra: true } as never)).toThrow(/unsupported fields/i);
    const tooManyAreas = { ...createInitialMesoscaleState(), areas: Array.from({ length: 21 }, (_, i) => ({ id: String(i) })) };
    expect(() => createMesoscaleSave(tooManyAreas as never)).toThrow(/at most 20 areas/i);
    const invalidArea = { id: 'a', title: 'Area', hazard: 'Rain', validStart: '2026-10-01T12:00:00Z', validEnd: '2026-10-01T13:00:00Z', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', geometry: { type: 'Polygon', coordinates: [[[-97, 35], [-96, 35], [-96, 36], [-97, 36]]] } };
    expect(() => createMesoscaleSave({ ...createInitialMesoscaleState(), areas: [invalidArea] })).toThrow(/invalid fields/i);
  });
  test('stores and restores under account and Mesoscale-specific autosave keys', () => {
    const product = { ...createInitialMesoscaleState(), discussion: 'Draft' };
    saveMesoscaleAutosave(product, 'user-1');
    expect(getMesoscaleStorageKey('user-1')).toBe('forecastData:mesoscale:user-user-1');
    expect(loadMesoscaleAutosave('user-1')).toEqual(product);
    expect(localStorage.getItem('forecastData:user-user-1')).toBeNull();
  });
});
