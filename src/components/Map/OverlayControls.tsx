import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  toggleStateBorders,
  toggleCounties,
} from '../../store/overlaysSlice';
import './OverlayControls.css';

// The OverlayControls component provides a user interface for toggling different map overlays.
const OverlayControls: React.FC = () => {
  const dispatch = useDispatch();
  const overlays = useSelector((state: RootState) => state.overlays);

  // Handlers for checkbox changes
  const handleToggleStateBorders = () => {
    dispatch(toggleStateBorders());
  };

  // Note: The county overlay can be quite dense and may impact performance on lower-end devices, especially when zoomed out. Consider adding a warning tooltip or message when enabling this overlay, or implementing a more performant way to render county boundaries (e.g., using vector tiles or simplifying the geometry at lower zoom levels).
  const handleToggleCounties = () => {
    dispatch(toggleCounties());
  };
  
  return (
    <div className="overlay-controls">
      <div className="overlay-controls-header">Boundaries</div>
      
      <label className="overlay-control-item">
        <input
          type="checkbox"
          checked={overlays.stateBorders}
          onChange={handleToggleStateBorders}
        />
        <span className="overlay-control-label">State Borders</span>
      </label>
      
      <label className="overlay-control-item">
        <input
          type="checkbox"
          checked={overlays.counties}
          onChange={handleToggleCounties}
        />
        <span className="overlay-control-label">Counties</span>
      </label>
    </div>
  );
};

export default OverlayControls;
