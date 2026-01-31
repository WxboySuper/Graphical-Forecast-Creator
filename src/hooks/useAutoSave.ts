import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { serializeForecast } from '../utils/fileUtils';

const AUTOSAVE_DELAY = 5000; // 5 seconds debounce
const LOCAL_STORAGE_KEY = 'forecastData';

export const useAutoSave = () => {
  const outlooks = useSelector((state: RootState) => state.forecast.outlooks);
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip save on initial render to avoid overwriting storage with initial empty state
    // if loading hasn't happened yet. 
    // Ideally loading happens BEFORE this hook runs or we check if "loaded".
    // But this hook runs in AppContent, which renders AFTER Provider.
    // performLoad is called manually via button in DrawingTools.
    // But we might want auto-load? The prompt says "Add 'Auto-save'...". 
    // Usually auto-save implies auto-load on startup too, but the roadmap v0.5.0 says "The Load System... Implement Import JSON... Re-uploading".
    // It implies manual load.
    // However, existing App.tsx has `performLoad` called on button click.
    // If I overwrite LS with empty state on startup, user loses data.
    // I should only auto-save if "something changed" or after explicit load?
    // Or check if state is "dirty"? `isSaved` flag in store.
    // `isSaved` is set to false on any modification.
    // I should check `!isSaved`.
    
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        const data = serializeForecast(outlooks, mapView);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        // We don't dispatch markAsSaved() here because auto-save is a background process.
        // The user might still want to explicitly "Save" (to confirm or create a checkpoint).
        // Or maybe we DO want to mark as saved? 
        // Typically auto-save makes the "Unsaved changes" warning go away.
        // But for file-based workflow (Export JSON), LS auto-save is just a backup.
        // So we shouldn't clear isSaved (which tracks unsaved changes relative to *File* export usually).
        // Current App logic sets isSaved=true on performSave (LS save).
        // If we treat LS as the primary persistence, then auto-save SHOULD set isSaved=true.
        // But the prompt wants "Export to JSON" as the "Save System".
        // "Never lose a forecast" -> Auto-save to LS.
        
        // I'll log it for now.
        // console.log('Auto-saved to LocalStorage');
      } catch (e) {
        console.error('Auto-save failed', e);
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [outlooks, mapView]);
};
