import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowDown, ArrowUp, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { RootState } from '../../store';
import {
  addCustomCategory,
  addCustomLayer,
  moveCustomCategory,
  moveCustomLayer,
  removeCustomCategory,
  removeCustomLayer,
  selectCurrentCustomLayers,
  selectCustomCategory,
  selectCustomLayer,
  updateCustomCategory,
  updateCustomLayerLabel,
} from '../../store/forecastSlice';
import { CUSTOM_PRODUCT_LIMITS, CUSTOM_PRODUCTS_SCHEMA_VERSION, type CustomCategoryTemplate, type CustomHatchPattern, type OneOffCustomLayer } from '../../types/customProducts';
import { asCustomLayerId } from '../../lib/customProducts';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const colors = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#3b82f6'];

const makeCategory = (order: number): CustomCategoryTemplate => ({
  id: `category-${uuidv4()}` as CustomCategoryTemplate['id'],
  label: `Category ${order + 1}`,
  order,
  style: {
    fillColor: colors[order % colors.length],
    fillOpacity: 0.55,
    strokeColor: '#111827',
    strokeOpacity: 1,
    strokeWidth: 2,
    hatch: 'none',
  },
});

const makeLayer = (order: number): OneOffCustomLayer => {
  const now = new Date().toISOString();
  return {
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    id: asCustomLayerId(`layer-${uuidv4()}`),
    label: `Custom Layer ${order + 1}`,
    order,
    categories: [makeCategory(0)],
    features: [],
    createdAt: now,
    updatedAt: now,
  };
};

const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, children, ...props }) => (
  <button type="button" aria-label={label} title={label} className="custom-draw-panel__icon-button" {...props}>{children}</button>
);

const MenuPicker = ({
  label,
  options,
  value,
  onChange,
  testId,
  compact = false,
}: {
  label: string;
  options: { id: string; label: string }[];
  value?: string;
  onChange(value: string): void;
  testId?: string;
  compact?: boolean;
}) => {
  const selected = options.find((option) => option.id === value);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={`custom-draw-panel__picker${compact ? ' custom-draw-panel__picker--compact' : ''}`} aria-label={label} data-testid={testId}>
          {compact ? null : <span className="truncate">{selected?.label ?? label}</span>}<ChevronDown aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="custom-draw-panel__picker-menu" align="start">
        {options.map((option) => (
          <button key={option.id} type="button" className="custom-draw-panel__picker-option" onClick={() => { onChange(option.id); setOpen(false); }}>
            <span>{option.label}</span>{option.id === value ? <Check aria-hidden="true" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

const CustomLayerTitleInput: React.FC<{ layer: OneOffCustomLayer }> = ({ layer }) => {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(layer.label);
  useEffect(() => setDraft(layer.label), [layer.id, layer.label]);
  return <input aria-label="Layer title" maxLength={64} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => {
    const label = draft.trim();
    if (label) dispatch(updateCustomLayerLabel({ layerId: layer.id, label }));
    setDraft(label || layer.label);
  }} />;
};

const CustomLayerActionRow: React.FC<{
  layers: OneOffCustomLayer[];
  activeLayer?: OneOffCustomLayer;
}> = ({ layers, activeLayer }) => {
  const dispatch = useDispatch();
  const layerOptions = layers.map((layer) => ({ id: layer.id, label: layer.label }));
  return <div className="custom-draw-panel__row custom-draw-panel__layer-row">
    {activeLayer ? <div className="custom-draw-panel__name-control">
      <CustomLayerTitleInput layer={activeLayer} />
      <MenuPicker label="Select custom layer" testId="custom-layer-picker" value={activeLayer.id} options={layerOptions} compact onChange={(id) => dispatch(selectCustomLayer(id))} />
    </div> : <MenuPicker label="Select custom layer" testId="custom-layer-picker" value={activeLayer?.id} options={layerOptions} onChange={(id) => dispatch(selectCustomLayer(id))} />}
    <IconButton label="Add custom layer" disabled={layers.length >= CUSTOM_PRODUCT_LIMITS.layersPerCollection} onClick={() => dispatch(addCustomLayer(makeLayer(layers.length)))}><Plus /></IconButton>
    <IconButton label="Move layer up" disabled={!activeLayer || activeLayer.order === 0} onClick={() => activeLayer && dispatch(moveCustomLayer({ layerId: activeLayer.id, direction: -1 }))}><ArrowUp /></IconButton>
    <IconButton label="Move layer down" disabled={!activeLayer || activeLayer.order === layers.length - 1} onClick={() => activeLayer && dispatch(moveCustomLayer({ layerId: activeLayer.id, direction: 1 }))}><ArrowDown /></IconButton>
    <IconButton label="Delete custom layer" disabled={!activeLayer} onClick={() => activeLayer && dispatch(removeCustomLayer(activeLayer.id))}><Trash2 /></IconButton>
  </div>;
};

const CustomLayerSection: React.FC<{
  layers: OneOffCustomLayer[];
  activeLayer?: OneOffCustomLayer;
}> = ({ layers, activeLayer }) => {
  return (
    <section className="custom-draw-panel__group" aria-label="Custom layers">
      <CustomLayerActionRow layers={layers} activeLayer={activeLayer} />
    </section>
  );
};

const CustomCategorySections: React.FC<{
  layer: OneOffCustomLayer;
  categories: CustomCategoryTemplate[];
  activeCategory: CustomCategoryTemplate;
}> = ({ layer, categories, activeCategory }) => {
  const dispatch = useDispatch();
  const [labelDraft, setLabelDraft] = useState(activeCategory.label);
  useEffect(() => setLabelDraft(activeCategory.label), [activeCategory.id, activeCategory.label]);
  const updateCategory = (changes: Partial<CustomCategoryTemplate> & { style?: Partial<CustomCategoryTemplate['style']> }) => dispatch(updateCustomCategory({
    layerId: layer.id,
    category: { ...activeCategory, ...changes, style: { ...activeCategory.style, ...changes.style } },
  }));

  return <>
    <section className="custom-draw-panel__group" aria-label="Custom categories">
      <div className="custom-draw-panel__row">
        <div className="custom-draw-panel__name-control">
          <input className="custom-draw-panel__category-name" aria-label="Category label" data-testid="custom-label-input" maxLength={64} value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} onBlur={() => {
            const label = labelDraft.trim() || 'Category'; updateCategory({ label }); setLabelDraft(label);
          }} />
          <MenuPicker label="Select custom category" testId="custom-category-list" value={activeCategory.id} options={categories.map((category) => ({ id: category.id, label: category.label }))} compact onChange={(id) => dispatch(selectCustomCategory(id))} />
        </div>
        <IconButton label="Add custom category" disabled={categories.length >= CUSTOM_PRODUCT_LIMITS.categoriesPerProduct} onClick={() => dispatch(addCustomCategory({ layerId: layer.id, category: makeCategory(categories.length) }))}><Plus /></IconButton>
        <IconButton label="Move category up" disabled={activeCategory.order === 0} onClick={() => dispatch(moveCustomCategory({ layerId: layer.id, categoryId: activeCategory.id, direction: -1 }))}><ArrowUp /></IconButton>
        <IconButton label="Move category down" disabled={activeCategory.order === categories.length - 1} onClick={() => dispatch(moveCustomCategory({ layerId: layer.id, categoryId: activeCategory.id, direction: 1 }))}><ArrowDown /></IconButton>
        <IconButton label="Delete custom category" disabled={categories.length === 1} onClick={() => dispatch(removeCustomCategory({ layerId: layer.id, categoryId: activeCategory.id }))}><Trash2 /></IconButton>
      </div>
    </section>
    <section className="custom-draw-panel__group custom-draw-panel__appearance" aria-label="Category appearance">
      <label className="custom-draw-panel__color-control">Fill <input aria-label="Category color" data-testid="custom-color-input" type="color" value={activeCategory.style.fillColor} style={{ opacity: activeCategory.style.fillOpacity }} onChange={(event) => updateCategory({ style: { fillColor: event.target.value } })} /></label>
      <label className="custom-draw-panel__opacity-control">Opacity <input aria-label="Category opacity" data-testid="custom-opacity-input" type="range" min="0" max="1" step="0.05" value={activeCategory.style.fillOpacity} onChange={(event) => updateCategory({ style: { fillOpacity: Number(event.target.value) } })} /><span>{Math.round(activeCategory.style.fillOpacity * 100)}%</span></label>
      <MenuPicker label="Category hatch" testId="custom-hatch-select" value={activeCategory.style.hatch} options={[
        { id: 'none', label: 'No hatch' }, { id: 'diagonal', label: 'Diagonal' }, { id: 'reverse-diagonal', label: 'Reverse diagonal' }, { id: 'crosshatch', label: 'Crosshatch' },
      ]} onChange={(hatch) => updateCategory({ style: { hatch: hatch as CustomHatchPattern } })} />
      <span className={`custom-style-swatch hatch-${activeCategory.style.hatch}`} style={{ '--custom-fill': activeCategory.style.fillColor, '--custom-opacity': activeCategory.style.fillOpacity } as React.CSSProperties} aria-label={`${activeCategory.label} preview`} />
    </section>
  </>;
};

const CustomDrawPanel: React.FC = () => {
  const collection = useSelector(selectCurrentCustomLayers);
  const editor = useSelector((state: RootState) => state.forecast.customEditor);
  const layers = [...collection.layers].sort((a, b) => a.order - b.order);
  const activeLayer = layers.find(({ id }) => id === editor.activeLayerId) ?? layers[0];
  const categories = activeLayer ? [...activeLayer.categories].sort((a, b) => a.order - b.order) : [];
  const activeCategory = categories.find(({ id }) => id === editor.activeCategoryId) ?? categories[0];
  return <div className="custom-draw-panel" data-testid="custom-draw-panel">
    <CustomLayerSection layers={layers} activeLayer={activeLayer} />
    {activeLayer && activeCategory
      ? <CustomCategorySections layer={activeLayer} categories={categories} activeCategory={activeCategory} />
      : <div className="custom-draw-panel__empty">Create a layer to start drawing custom polygons.</div>}
  </div>;
};

export default CustomDrawPanel;
