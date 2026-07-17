import { Link } from 'react-router-dom';
import { Palette } from 'lucide-react';
import { isFeatureExposed } from '../../config/featureExposure';
import { Button } from '../ui/button';

/** Local-only link to reusable product management; no hosted build renders this control. */
const CustomProductsEntryButton = () => {
  if (!isFeatureExposed('customProducts')) return null;
  return (
    <Button asChild variant="outline" className="h-10 rounded-xl px-3">
      <Link to="/custom-products"><Palette className="mr-2 h-4 w-4" /> Products</Link>
    </Button>
  );
};

export default CustomProductsEntryButton;
