/** Areas tab: the list of drawn areas with an editor for the selected one. */
import React from 'react';
import { hazardHue } from './areaModel';
import { AreaEditor } from './AreaEditor';
import { MAX_MESOSCALE_AREAS } from '../../../utils/mesoscaleValidationLimits';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import type { MesoscaleAreasController } from './useMesoscaleAreas';

const short = (iso: string): string => `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z`;

const EmptyAreas: React.FC<{ onDraw: () => void }> = ({ onDraw }) => (
  <div className="mesoscale-empty">
    <p>No areas yet. Draw one around the feature you want to call out, then name it and set when it is valid.</p>
    <button type="button" className="mesoscale-state__action" onClick={onDraw}>Draw an area</button>
  </div>
);

const AreaRow: React.FC<{ area: MesoscaleArea; selected: boolean; onSelect: () => void }> = ({ area, selected, onSelect }) => (
  <li>
    <button type="button" className="mesoscale-area" aria-pressed={selected} onClick={onSelect}>
      <span className="mesoscale-area__swatch" style={{ background: `hsl(${hazardHue(area.hazard)} 80% 45%)` }} aria-hidden="true" />
      <span className="mesoscale-area__text">
        <span className="mesoscale-area__title">{area.title}</span>
        <span className="mesoscale-area__meta">{area.hazard} · {short(area.validStart)} to {short(area.validEnd)}</span>
      </span>
    </button>
  </li>
);

const AreaNotices: React.FC<{ areas: MesoscaleAreasController }> = ({ areas }) => (
  <>
    {areas.atLimit ? <p className="mesoscale-notice" role="status">You have reached the limit of {MAX_MESOSCALE_AREAS} areas. Delete one to add another.</p> : null}
    {areas.tool === 'draw' ? <p className="mesoscale-notice" role="status">Click to place points, double-click to finish. Backspace removes the last point and Escape cancels.</p> : null}
  </>
);

export const AreasPanel: React.FC<{ areas: MesoscaleAreasController }> = ({ areas }) => {
  const selected = areas.areas.find(area => area.id === areas.selectedId);
  return (
    <section className="mesoscale-section" aria-label="Areas">
      <h2 className="mesoscale-section__title">Areas ({areas.areas.length}/{MAX_MESOSCALE_AREAS})</h2>
      {areas.areas.length === 0 ? <EmptyAreas onDraw={() => areas.setTool('draw')} /> : (
        <ul className="mesoscale-area-list">
          {areas.areas.map(area => (
            <AreaRow key={area.id} area={area} selected={area.id === areas.selectedId} onSelect={() => areas.select(area.id)} />
          ))}
        </ul>
      )}
      <AreaNotices areas={areas} />
      {selected ? <AreaEditor area={selected} onChange={changes => areas.updateArea(selected.id, changes)} onDelete={() => areas.removeArea(selected.id)} /> : null}
    </section>
  );
};
