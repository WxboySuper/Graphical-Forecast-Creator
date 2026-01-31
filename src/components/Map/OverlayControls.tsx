import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  toggleStateBorders,
  toggleCounties,
} from '../../store/overlaysSlice';
import './OverlayControls.css';

const OverlayControls: React.FC = () => {
  const dispatch = useDispatch();
  const overlays = useSelector((state: RootState) => state.overlays);
  
  return (
    <div className="overlay-controls">
      <div className="overlay-controls-header">Boundaries</div>
      
      <label className="overlay-control-item">
        <input
          type="checkbox"
          checked={overlays.stateBorders}
          onChange={() => dispatch(toggleStateBorders())}
        />
        <span className="overlay-control-label">State Borders</span>
      </label>
      
      <label className="overlay-control-item">
        <input
          type="checkbox"
          checked={overlays.counties}
          onChange={() => dispatch(toggleCounties())}
        />
        <span className="overlay-control-label">Counties</span>
      </label>
    </div>
  );
};

export default OverlayControls;
