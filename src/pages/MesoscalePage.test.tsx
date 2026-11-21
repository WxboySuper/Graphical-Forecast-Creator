/**
 * Mesoscale page tests. The route renders this page directly, so it must restore the saved
 * Mesoscale session on mount and write edits back to this device.
 */
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import mesoscaleReducer, {
  createInitialMesoscaleState,
  selectMesoscaleState,
  setMesoscaleDiscussion,
} from '../store/mesoscaleSlice';
import { getMesoscaleAutoSaveKey } from '../hooks/useMesoscaleAutoSave';
import { saveMesoscaleAutosave } from '../utils/mesoscalePersistence';
import { MesoscalePage } from './MesoscalePage';

jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../components/Mesoscale/MesoscaleWorkspace', () => ({ MesoscaleWorkspace: () => <div data-testid="workspace-stub" /> }));
jest.mock('../config/mesoscale', () => ({ getMesoscaleClientConfig: () => ({ enabled: true }) }));

const makeStore = () => configureStore({ reducer: { mesoscale: mesoscaleReducer } });
const renderPage = (store = makeStore()) => {
  render(<Provider store={store}><MesoscalePage /></Provider>);
  return store;
};

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('restores the saved Mesoscale session when the page opens', () => {
  saveMesoscaleAutosave({ ...createInitialMesoscaleState(), discussion: 'Saved before reload.' }, null);
  const store = renderPage();
  expect(selectMesoscaleState(store.getState()).discussion).toBe('Saved before reload.');
});

test('saves Mesoscale edits to this device after the autosave delay', () => {
  const store = renderPage();
  act(() => { store.dispatch(setMesoscaleDiscussion('Written on the page.')); });
  expect(localStorage.getItem(getMesoscaleAutoSaveKey(null))).toBeNull();
  act(() => { jest.advanceTimersByTime(5000); });
  expect(localStorage.getItem(getMesoscaleAutoSaveKey(null))).toContain('Written on the page.');
});
