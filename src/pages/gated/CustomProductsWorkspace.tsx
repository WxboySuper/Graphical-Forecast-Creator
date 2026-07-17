import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers3, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useCustomProducts, type UseCustomProductsResult } from '../../hooks/useCustomProducts';
import { CUSTOM_PRODUCT_LIMITS, type HostedCustomProduct } from '../../types/customProducts';
import CustomProductCard from './CustomProductCard';
import CustomProductEditor from './CustomProductEditor';

const newProductDisabled = (
  customProducts: UseCustomProductsResult,
  editorOpen: boolean,
): boolean => Boolean(customProducts.pendingAction)
  || !customProducts.premiumActive
  || editorOpen
  || customProducts.products.length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount;

const WorkspaceNotices = ({ customProducts }: { customProducts: UseCustomProductsResult }) => (
  <>
    {!customProducts.premiumActive ? <Card className="custom-product-notice"><CardContent>Reusable product editing and use require premium. Existing products remain visible.</CardContent></Card> : null}
    {customProducts.error ? <p role="alert" className="custom-product-error">{customProducts.error}</p> : null}
  </>
);

const WorkspaceEditors = ({
  creating,
  editing,
  customProducts,
  stopCreating,
  stopEditing,
}: {
  creating: boolean;
  editing: HostedCustomProduct | null;
  customProducts: UseCustomProductsResult;
  stopCreating(): void;
  stopEditing(): void;
}) => (
  <>
    {creating ? <CustomProductEditor onCancel={stopCreating} onSave={customProducts.createProduct} /> : null}
    {editing ? <CustomProductEditor product={editing} onCancel={stopEditing} onSave={(draft) => customProducts.updateProduct(editing, draft)} /> : null}
  </>
);

const createProductNavigator = (
  customProducts: UseCustomProductsResult,
  navigate: ReturnType<typeof useNavigate>,
) => (product: HostedCustomProduct) => {
  if (customProducts.useProduct(product)) navigate('/forecast');
};

const SignedOutProducts = () => (
  <div className="custom-products-page">
    <Card><CardHeader><CardTitle>Sign in to manage reusable products</CardTitle></CardHeader><CardContent><Button asChild><Link to="/account">Open Account</Link></Button></CardContent></Card>
  </div>
);

const ProductsHero = ({
  productCount,
  activeCount,
  newDisabled,
  onNew,
}: {
  productCount: number;
  activeCount: number;
  newDisabled: boolean;
  onNew(): void;
}) => (
  <header className="custom-products-hero">
    <div>
      <span className="custom-product-eyebrow">Local preview · Premium workspace</span>
      <h1>Reusable custom products</h1>
      <p>Build a category template once, then snapshot it into any future forecast without changing older maps.</p>
    </div>
    <div className="custom-products-hero__actions">
      <span>{productCount}/{CUSTOM_PRODUCT_LIMITS.productsPerAccount} products · {activeCount} active</span>
      <Button onClick={onNew} disabled={newDisabled}><Plus className="mr-2 h-4 w-4" /> New product</Button>
    </div>
  </header>
);

const ProductsLibrary = ({
  customProducts,
  editorOpen,
  onEdit,
  onUse,
}: {
  customProducts: UseCustomProductsResult;
  editorOpen: boolean;
  onEdit(product: HostedCustomProduct): void;
  onUse(product: HostedCustomProduct): void;
}) => {
  if (customProducts.loading) return <div className="custom-products-empty">Loading reusable products…</div>;
  if (customProducts.products.length === 0 && editorOpen) return null;
  if (customProducts.products.length === 0) {
    return <div className="custom-products-empty"><Layers3 className="h-10 w-10" /><h2>No reusable products yet</h2><p>Create a product with up to 12 ordered categories.</p></div>;
  }
  const pending = Boolean(customProducts.pendingAction) || editorOpen;
  return (
    <section className="custom-products-grid" aria-label="Reusable custom products">
      {customProducts.products.map((product) => (
        <CustomProductCard
          key={product.id}
          product={product}
          premiumActive={customProducts.premiumActive}
          pending={pending}
          onEdit={() => onEdit(product)}
          onDuplicate={() => void customProducts.duplicateProduct(product)}
          onStatus={() => void customProducts.setProductStatus(product, product.status === 'active' ? 'archived' : 'active')}
          onDelete={() => void customProducts.deleteProduct(product)}
          onUse={() => onUse(product)}
        />
      ))}
    </section>
  );
};

const CustomProductsWorkspace = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const customProducts = useCustomProducts();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HostedCustomProduct | null>(null);
  const activeCount = useMemo(
    () => customProducts.products.filter((product) => product.status === 'active').length,
    [customProducts.products],
  );

  if (!user) return <SignedOutProducts />;
  const editorOpen = creating || Boolean(editing);
  const openEditor = (product: HostedCustomProduct) => {
    setCreating(false);
    setEditing(product);
  };
  const useProduct = createProductNavigator(customProducts, navigate);

  return (
    <main className="custom-products-page">
      <ProductsHero
        productCount={customProducts.products.length}
        activeCount={activeCount}
        newDisabled={newProductDisabled(customProducts, editorOpen)}
        onNew={() => { setEditing(null); setCreating(true); }}
      />
      <WorkspaceNotices customProducts={customProducts} />
      <WorkspaceEditors
        creating={creating}
        editing={editing}
        customProducts={customProducts}
        stopCreating={() => setCreating(false)}
        stopEditing={() => setEditing(null)}
      />
      <ProductsLibrary customProducts={customProducts} editorOpen={editorOpen} onEdit={openEditor} onUse={useProduct} />
    </main>
  );
};

export default CustomProductsWorkspace;
