import {
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getBuildTarget } from '../../config/buildTarget';
import {
  PRECISION_EDIT_PROTOTYPE_STORAGE_KEY,
  PRECISION_EDIT_PROTOTYPES,
  type PrecisionEditPrototype,
} from './precisionPolygonEditing';

interface PrecisionEditPrototypePickerProps {
  value: PrecisionEditPrototype;
  onChange: (prototype: PrecisionEditPrototype) => void;
}

/** Local-only research UI for switching issue #624 prototype behaviors. */
const PrecisionEditPrototypePicker = forwardRef<HTMLSelectElement, PrecisionEditPrototypePickerProps>(
  ({ value, onChange }, ref) => {
    if (getBuildTarget() !== 'local') {
      return null;
    }

    return (
      <label className="precision-edit-prototype-picker">
        <span className="precision-edit-prototype-label">Precision edit prototype</span>
        <select
          ref={ref}
          className="precision-edit-prototype-select"
          value={value}
          onChange={(event) => onChange(event.target.value as PrecisionEditPrototype)}
          aria-label="Precision polygon editing prototype"
        >
          {PRECISION_EDIT_PROTOTYPES.map((prototype) => (
            <option key={prototype} value={prototype}>
              {prototype}
            </option>
          ))}
        </select>
      </label>
    );
  },
);

PrecisionEditPrototypePicker.displayName = 'PrecisionEditPrototypePicker';

export const usePrecisionEditPrototype = (): {
  prototype: PrecisionEditPrototype;
  setPrototype: (prototype: PrecisionEditPrototype) => void;
} => {
  const [prototype, setPrototypeState] = useState<PrecisionEditPrototype>(() => {
    if (typeof window === 'undefined') {
      return 'baseline';
    }
    const stored = localStorage.getItem(PRECISION_EDIT_PROTOTYPE_STORAGE_KEY);
    if (stored && (PRECISION_EDIT_PROTOTYPES as readonly string[]).includes(stored)) {
      return stored as PrecisionEditPrototype;
    }
    return 'baseline';
  });

  const setPrototype = (nextPrototype: PrecisionEditPrototype) => {
    setPrototypeState(nextPrototype);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRECISION_EDIT_PROTOTYPE_STORAGE_KEY, nextPrototype);
    }
  };

  return { prototype, setPrototype };
};

export default PrecisionEditPrototypePicker;
