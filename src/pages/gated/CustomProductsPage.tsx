import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useCustomProducts } from '../../hooks/useCustomProducts';
import type { CustomProductDraft } from '../../lib/customProductsRepository';
import {
  CUSTOM_PRODUCT_LIMITS,
  type CustomCategoryId,
  type CustomCategoryTemplate,
  type CustomHatchPattern,
  type HostedCustomProduct,
} from '../../types/customProducts';
import './CustomProductsPage.css';

const DEFAULT_STYLE = {
  fillColor: '#f97316',
  fillOpacity: 0.45,
  strokeColor: '#c2410c',
  strokeOpacity: 1,
  strokeWidth: 2,
  hatch: 'none' as CustomHatchPattern,
};

const asCategoryId = (value: string): CustomCategoryId => value as CustomCategoryId;

const hexToRgba = (hex: string, alpha: number): string => {
  const numeric = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}, ${alpha})`;
};

const previewStyle = (category: CustomCategoryTemplate): React.CSSProperties => {
  const stroke = hexToRgba(category.style.strokeColor, category.style.strokeOpacity);
  const diagonal = `repeating-linear-gradient(45deg, transparent 0 5px, ${stroke} 5px 7px)`;
  const reverse = `repeating-linear-gradient(-45deg, transparent 0 5px, ${stroke} 5px 7px)`;
  return {
    backgroundColor: hexToRgba(category.style.fillColor, category.style.fillOpacity),
    backgroundImage: category.style.hatch === 'none'
      ? undefined
      : category.style.hatch === 'crosshatch'
        ? `${diagonal}, ${reverse}`
        : category.style.hatch === 'reverse-diagonal' ? reverse : diagonal,
    borderColor: stroke,
    borderWidth: category.style.strokeWidth,
  };
};

const newCategory = (order: number): CustomCategoryTemplate => ({
  id: asCategoryId(`category-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${order}`}`),
  label: `Category ${order + 1}`,
  order,
  style: { ...DEFAULT_STYLE },
});

const emptyDraft = (): CustomProductDraft => ({
  label: '',
  description: '',
  categories: [newCategory(0)],
});

const draftFromProduct = (product: HostedCustomProduct): CustomProductDraft => ({
  label: product.label,
  description: product.description ?? '',
  categories: product.categories.map((category) => ({ ...category, style: { ...category.style } })),
});

const CategoryPreview = ({ categories }: { categories: CustomCategoryTemplate[] }) => (
  <div className="custom-product-preview" aria-label="Product preview">
    {categories.map((category) => (
      <div className="custom-product-preview__item" key={category.id}>
        <span
          className={`custom-product-preview__swatch hatch-${category.style.hatch}`}
          style={previewStyle(category)}
        />
        <span>{category.label || 'Untitled category'}</span>
      </div>
    ))}
  </div>
);

const CategoryEditor = ({
  category,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  category: CustomCategoryTemplate;
  index: number;
  count: number;
  onChange: (category: CustomCategoryTemplate) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) => (
  <div className="custom-product-category-editor">
    <div className="custom-product-category-editor__topline">
      <strong>Category {index + 1}</strong>
      <div className="custom-product-category-editor__actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${category.label}`} disabled={count === 1} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
    <Input
      aria-label={`Category ${index + 1} label`}
      maxLength={CUSTOM_PRODUCT_LIMITS.labelLength}
      value={category.label}
      onChange={(event) => onChange({ ...category, label: event.target.value })}
    />
    <div className="custom-product-category-editor__style-grid">
      <label>
        <span>Fill</span>
        <input type="color" aria-label={`Category ${index + 1} fill color`} value={category.style.fillColor} onChange={(event) => onChange({ ...category, style: { ...category.style, fillColor: event.target.value } })} />
      </label>
      <label>
        <span>Opacity</span>
        <input type="range" aria-label={`Category ${index + 1} opacity`} min="0" max="1" step="0.05" value={category.style.fillOpacity} onChange={(event) => onChange({ ...category, style: { ...category.style, fillOpacity: Number(event.target.value) } })} />
      </label>
      <label>
        <span>Stroke</span>
        <input type="color" aria-label={`Category ${index + 1} stroke color`} value={category.style.strokeColor} onChange={(event) => onChange({ ...category, style: { ...category.style, strokeColor: event.target.value } })} />
      </label>
      <label>
        <span>Stroke opacity</span>
        <input type="range" aria-label={`Category ${index + 1} stroke opacity`} min="0" max="1" step="0.05" value={category.style.strokeOpacity} onChange={(event) => onChange({ ...category, style: { ...category.style, strokeOpacity: Number(event.target.value) } })} />
      </label>
      <label>
        <span>Stroke width</span>
        <input type="range" aria-label={`Category ${index + 1} stroke width`} min="0" max="8" step="0.5" value={category.style.strokeWidth} onChange={(event) => onChange({ ...category, style: { ...category.style, strokeWidth: Number(event.target.value) } })} />
      </label>
      <label>
        <span>Hatch</span>
        <select aria-label={`Category ${index + 1} hatch`} value={category.style.hatch} onChange={(event) => onChange({ ...category, style: { ...category.style, hatch: event.target.value as CustomHatchPattern } })}>
          <option value="none">None</option>
          <option value="diagonal">Diagonal</option>
          <option value="reverse-diagonal">Reverse diagonal</option>
          <option value="crosshatch">Crosshatch</option>
        </select>
      </label>
    </div>
  </div>
);

const ProductEditor = ({
  product,
  onCancel,
  onSave,
}: {
  product?: HostedCustomProduct;
  onCancel: () => void;
  onSave: (draft: CustomProductDraft) => Promise<boolean>;
}) => {
  const [draft, setDraft] = useState(() => product ? draftFromProduct(product) : emptyDraft());
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const updateCategory = (index: number, next: CustomCategoryTemplate) => setDraft((current) => ({
    ...current,
    categories: current.categories.map((category, candidate) => candidate === index ? next : category),
  }));

  const moveCategory = (index: number, direction: -1 | 1) => setDraft((current) => {
    const categories = [...current.categories];
    [categories[index], categories[index + direction]] = [categories[index + direction], categories[index]];
    return { ...current, categories: categories.map((category, order) => ({ ...category, order })) };
  });

  const submit = async () => {
    if (!draft.label.trim()) {
      setValidation('Enter a product name.');
      return;
    }
    if (draft.categories.some((category) => !category.label.trim())) {
      setValidation('Every category needs a label.');
      return;
    }
    setSaving(true);
    setValidation(null);
    const saved = await onSave(draft);
    setSaving(false);
    if (saved) onCancel();
  };

  return (
    <Card className="custom-product-editor-card">
      <CardHeader>
        <CardTitle>{product ? `Edit ${product.label}` : 'Create reusable product'}</CardTitle>
        <CardDescription>Set the ordered categories that will be snapshotted into each new custom layer.</CardDescription>
      </CardHeader>
      <CardContent className="custom-product-editor-layout">
        <div className="custom-product-editor-fields">
          <label>
            <span>Product name</span>
            <Input aria-label="Product name" maxLength={CUSTOM_PRODUCT_LIMITS.labelLength} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          </label>
          <label>
            <span>Description</span>
            <Textarea aria-label="Product description" maxLength={500} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <div className="custom-product-category-list">
            {draft.categories.map((category, index) => (
              <CategoryEditor
                key={category.id}
                category={category}
                index={index}
                count={draft.categories.length}
                onChange={(next) => updateCategory(index, next)}
                onMove={(direction) => moveCategory(index, direction)}
                onRemove={() => setDraft({ ...draft, categories: draft.categories.filter((_, candidate) => candidate !== index).map((item, order) => ({ ...item, order })) })}
              />
            ))}
          </div>
          <Button type="button" variant="outline" disabled={draft.categories.length >= CUSTOM_PRODUCT_LIMITS.categoriesPerProduct} onClick={() => setDraft({ ...draft, categories: [...draft.categories, newCategory(draft.categories.length)] })}>
            <Plus className="mr-2 h-4 w-4" /> Add category
          </Button>
        </div>
        <aside className="custom-product-editor-preview">
          <span className="custom-product-eyebrow">Live preview</span>
          <h3>{draft.label || 'Untitled product'}</h3>
          <CategoryPreview categories={draft.categories} />
        </aside>
        {validation ? <p className="custom-product-error">{validation}</p> : null}
        <div className="custom-product-editor-footer">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}</Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ProductCard = ({
  product,
  premiumActive,
  onEdit,
  onDuplicate,
  onStatus,
  onDelete,
  onUse,
  pending,
}: {
  product: HostedCustomProduct;
  premiumActive: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onStatus: () => void;
  onDelete: () => void;
  onUse: () => void;
  pending: boolean;
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = product.status === 'active';
  return (
    <Card className="custom-product-card">
      <CardHeader>
        <div className="custom-product-card__heading">
          <div>
            <CardTitle>{product.label}</CardTitle>
            <CardDescription>{product.description || `${product.categories.length} ordered categories`}</CardDescription>
          </div>
          <span className={`custom-product-status is-${product.status}`}>{product.status}</span>
        </div>
      </CardHeader>
      <CardContent>
        <CategoryPreview categories={product.categories} />
        <div className="custom-product-card__meta">Version {product.version} · Updated {new Date(product.updatedAt).toLocaleDateString()}</div>
        <div className="custom-product-card__actions">
          <Button onClick={onUse} disabled={pending || !premiumActive || !active}>Use in Forecast</Button>
          <Button variant="outline" onClick={onEdit} disabled={pending || !premiumActive || !active}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
          <Button variant="outline" onClick={onDuplicate} disabled={pending || !premiumActive}><Copy className="mr-2 h-4 w-4" /> Duplicate</Button>
          <Button variant="outline" onClick={onStatus} disabled={pending || !premiumActive}>
            {active ? <Archive className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            {active ? 'Archive' : 'Restore'}
          </Button>
          {confirmingDelete ? (
            <div className="custom-product-delete-confirm">
              <span>Delete permanently?</span>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Keep</Button>
              <Button variant="destructive" onClick={onDelete} disabled={pending}>Delete</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={pending || !premiumActive}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/** Local-only reusable custom-product management surface. */
const CustomProductsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const customProducts = useCustomProducts();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HostedCustomProduct | null>(null);
  const activeCount = useMemo(() => customProducts.products.filter((product) => product.status === 'active').length, [customProducts.products]);

  if (!user) {
    return (
      <div className="custom-products-page"><Card><CardHeader><CardTitle>Sign in to manage reusable products</CardTitle></CardHeader><CardContent><Button asChild><Link to="/account">Open Account</Link></Button></CardContent></Card></div>
    );
  }

  return (
    <main className="custom-products-page">
      <header className="custom-products-hero">
        <div>
          <span className="custom-product-eyebrow">Local preview · Premium workspace</span>
          <h1>Reusable custom products</h1>
          <p>Build a category template once, then snapshot it into any future forecast without changing older maps.</p>
        </div>
        <div className="custom-products-hero__actions">
          <span>{customProducts.products.length}/{CUSTOM_PRODUCT_LIMITS.productsPerAccount} products · {activeCount} active</span>
          <Button
            onClick={() => { setEditing(null); setCreating(true); }}
            disabled={Boolean(customProducts.pendingAction) || !customProducts.premiumActive || creating || Boolean(editing) || customProducts.products.length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount}
          >
            <Plus className="mr-2 h-4 w-4" /> New product
          </Button>
        </div>
      </header>

      {!customProducts.premiumActive ? (
        <Card className="custom-product-notice"><CardContent>Reusable product editing and use require premium. Existing products remain visible.</CardContent></Card>
      ) : null}
      {customProducts.error ? <p role="alert" className="custom-product-error">{customProducts.error}</p> : null}

      {creating ? <ProductEditor onCancel={() => setCreating(false)} onSave={customProducts.createProduct} /> : null}
      {editing ? <ProductEditor product={editing} onCancel={() => setEditing(null)} onSave={(draft) => customProducts.updateProduct(editing, draft)} /> : null}

      {customProducts.loading ? (
        <div className="custom-products-empty">Loading reusable products…</div>
      ) : customProducts.products.length === 0 && !creating ? (
        <div className="custom-products-empty"><Layers3 className="h-10 w-10" /><h2>No reusable products yet</h2><p>Create a product with up to 12 ordered categories.</p></div>
      ) : (
        <section className="custom-products-grid" aria-label="Reusable custom products">
          {customProducts.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              premiumActive={customProducts.premiumActive}
              pending={Boolean(customProducts.pendingAction) || creating || Boolean(editing)}
              onEdit={() => { setCreating(false); setEditing(product); }}
              onDuplicate={() => void customProducts.duplicateProduct(product)}
              onStatus={() => void customProducts.setProductStatus(product, product.status === 'active' ? 'archived' : 'active')}
              onDelete={() => void customProducts.deleteProduct(product)}
              onUse={() => {
                if (customProducts.useProduct(product)) navigate('/forecast');
              }}
            />
          ))}
        </section>
      )}
    </main>
  );
};

export default CustomProductsPage;
