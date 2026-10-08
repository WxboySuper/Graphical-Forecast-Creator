import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import type { CustomProductDraft } from '../../lib/customProductsRepository';
import { CUSTOM_PRODUCT_LIMITS, type CustomCategoryTemplate, type HostedCustomProduct } from '../../types/customProducts';
import CustomProductCategoryEditor from './CustomProductCategoryEditor';
import CustomProductPreview from './CustomProductPreview';
import {
  emptyProductDraft,
  newCategory,
  normalizeDraftOrder,
  prepareProductDraft,
  productDraft,
  validateProductDraft,
} from './customProductEditorModel';

interface Props {
  product?: HostedCustomProduct;
  saveError?: string | null;
  onCancel(): void;
  onSave(draft: CustomProductDraft): Promise<boolean>;
}

const initialDraft = (product?: HostedCustomProduct) =>
  product ? productDraft(product) : emptyProductDraft();

const EditorTitle = ({ product }: { product?: HostedCustomProduct }) => (
  <CardTitle>{product ? `Edit ${product.label}` : 'Create reusable product'}</CardTitle>
);

const PreviewTitle = ({ label }: { label: string }) => <h3>{label || 'Untitled product'}</h3>;

const ValidationMessage = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="custom-product-error">{message}</p> : null;

const SaveLabel = ({ saving, product }: { saving: boolean; product?: HostedCustomProduct }) =>
  saving ? 'Saving…' : product ? 'Save changes' : 'Create product';

const moveCategory = (categories: CustomCategoryTemplate[], index: number, direction: -1 | 1) => {
  const reordered = [...categories];
  [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
  return normalizeDraftOrder(reordered);
};

const CustomProductEditor = ({ product, saveError = null, onCancel, onSave }: Props) => {
  const [draft, setDraft] = useState(() => initialDraft(product));
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const updateCategory = (index: number, next: CustomCategoryTemplate) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category, candidate) => candidate === index ? next : category),
  }));
  const removeCategory = (index: number) => setDraft((current) => ({
    ...current,
    categories: normalizeDraftOrder(current.categories.filter((_, candidate) => candidate !== index)),
  }));
  const addCategory = () => setDraft((current) => {
    const categories = normalizeDraftOrder(current.categories);
    return {
      ...current,
      categories: [...categories, newCategory(categories.length)],
    };
  });
  const submit = async () => {
    const prepared = prepareProductDraft(draft);
    const error = validateProductDraft(prepared);
    if (error) {
      setValidation(error);
      return;
    }
    setSaving(true);
    setValidation(null);
    const saved = await onSave(prepared);
    setSaving(false);
    if (saved) onCancel();
  };
  const feedback = validation ?? saveError;

  return (
    <Card className="custom-product-editor-card" data-testid="custom-product-editor">
      <CardHeader>
        <EditorTitle product={product} />
        <CardDescription>Set the ordered categories that will be snapshotted into each new custom layer.</CardDescription>
      </CardHeader>
      <CardContent className="custom-product-editor-layout">
        <div className="custom-product-editor-fields">
          <label><span>Product name</span><Input aria-label="Product name" maxLength={CUSTOM_PRODUCT_LIMITS.labelLength} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
          <label><span>Description</span><Textarea aria-label="Product description" maxLength={500} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <div className="custom-product-category-list">
            {draft.categories.map((category, index) => (
              <CustomProductCategoryEditor
                key={category.id}
                category={category}
                index={index}
                count={draft.categories.length}
                onChange={(next) => updateCategory(index, next)}
                onMove={(direction) => setDraft((current) => ({ ...current, categories: moveCategory(current.categories, index, direction) }))}
                onRemove={() => removeCategory(index)}
              />
            ))}
          </div>
          <Button type="button" variant="outline" disabled={draft.categories.length >= CUSTOM_PRODUCT_LIMITS.categoriesPerProduct} onClick={addCategory}><Plus className="mr-2 h-4 w-4" /> Add category</Button>
        </div>
        <aside className="custom-product-editor-preview">
          <span className="custom-product-eyebrow">Live preview</span>
          <PreviewTitle label={draft.label} />
          <CustomProductPreview categories={draft.categories} />
        </aside>
        <ValidationMessage message={feedback} />
        <div className="custom-product-editor-footer">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={saving}><SaveLabel saving={saving} product={product} /></Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomProductEditor;
