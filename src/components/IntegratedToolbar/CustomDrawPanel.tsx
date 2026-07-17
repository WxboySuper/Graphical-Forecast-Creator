import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
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

const CustomLayerSection: React.FC<{
  layers: OneOffCustomLayer[];
  activeLayer?: OneOffCustomLayer;
}> = ({ layers, activeLayer }) => {
  const dispatch = useDispatch();
  const [layerLabelDraft, setLayerLabelDraft] = useState(activeLayer?.label ?? '');
  useEffect(() => setLayerLabelDraft(activeLayer?.label ?? ''), [activeLayer?.id, activeLayer?.label]);

  return (
    <section className="custom-draw-panel__group" aria-label="Custom layers">
      <span className="custom-draw-panel__label">Layer</span>
      <div className="custom-draw-panel__row">
        <select aria-label="Custom layer" data-testid="custom-layer-picker" value={activeLayer?.id ?? ''} onChange={(event) => dispatch(selectCustomLayer(event.target.value))}>
          {!activeLayer ? <option value="">Create a layer</option> : null}
          {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
        </select>
        <IconButton label="Add custom layer" disabled={layers.length >= CUSTOM_PRODUCT_LIMITS.layersPerCollection} onClick={() => dispatch(addCustomLayer(makeLayer(layers.length)))}><Plus /></IconButton>
        <IconButton label="Move layer up" disabled={!activeLayer || activeLayer.order === 0} onClick={() => activeLayer && dispatch(moveCustomLayer({ layerId: activeLayer.id, direction: -1 }))}><ArrowUp /></IconButton>
        <IconButton label="Move layer down" disabled={!activeLayer || activeLayer.order === layers.length - 1} onClick={() => activeLayer && dispatch(moveCustomLayer({ layerId: activeLayer.id, direction: 1 }))}><ArrowDown /></IconButton>
        <IconButton label="Delete custom layer" disabled={!activeLayer} onClick={() => activeLayer && dispatch(removeCustomLayer(activeLayer.id))}><Trash2 /></IconButton>
      </div>
      {activeLayer ? <input aria-label="Layer title" maxLength={64} value={layerLabelDraft} onChange={(event) => setLayerLabelDraft(event.target.value)} onBlur={() => {
        const label = layerLabelDraft.trim();
        if (label) dispatch(updateCustomLayerLabel({ layerId: activeLayer.id, label }));
        setLayerLabelDraft(label || activeLayer.label);
      }} /> : null}
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
      <span className="custom-draw-panel__label">Category</span>
      <div className="custom-draw-panel__row">
        <select aria-label="Custom category" data-testid="custom-category-list" value={activeCategory.id} onChange={(event) => dispatch(selectCustomCategory(event.target.value))}>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
        <IconButton label="Add custom category" disabled={categories.length >= CUSTOM_PRODUCT_LIMITS.categoriesPerProduct} onClick={() => dispatch(addCustomCategory({ layerId: layer.id, category: makeCategory(categories.length) }))}><Plus /></IconButton>
        <IconButton label="Move category up" disabled={activeCategory.order === 0} onClick={() => dispatch(moveCustomCategory({ layerId: layer.id, categoryId: activeCategory.id, direction: -1 }))}><ArrowUp /></IconButton>
        <IconButton label="Move category down" disabled={activeCategory.order === categories.length - 1} onClick={() => dispatch(moveCustomCategory({ layerId: layer.id, categoryId: activeCategory.id, direction: 1 }))}><ArrowDown /></IconButton>
        <IconButton label="Delete custom category" disabled={categories.length === 1} onClick={() => dispatch(removeCustomCategory({ layerId: layer.id, categoryId: activeCategory.id }))}><Trash2 /></IconButton>
      </div>
    </section>
    <section className="custom-draw-panel__group custom-draw-panel__appearance" aria-label="Category appearance">
      <span className="custom-draw-panel__label">Appearance</span>
      <input aria-label="Category label" data-testid="custom-label-input" maxLength={64} value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} onBlur={() => {
        const label = labelDraft.trim() || 'Category'; updateCategory({ label }); setLabelDraft(label);
      }} />
      <label>Color <input aria-label="Category color" data-testid="custom-color-input" type="color" value={activeCategory.style.fillColor} onChange={(event) => updateCategory({ style: { fillColor: event.target.value } })} /></label>
      <label>Opacity <input aria-label="Category opacity" data-testid="custom-opacity-input" type="range" min="0" max="1" step="0.05" value={activeCategory.style.fillOpacity} onChange={(event) => updateCategory({ style: { fillOpacity: Number(event.target.value) } })} /></label>
      <select aria-label="Category hatch" data-testid="custom-hatch-select" value={activeCategory.style.hatch} onChange={(event) => updateCategory({ style: { hatch: event.target.value as CustomHatchPattern } })}>
        <option value="none">No hatch</option><option value="diagonal">Diagonal</option><option value="reverse-diagonal">Reverse diagonal</option><option value="crosshatch">Crosshatch</option>
      </select>
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
