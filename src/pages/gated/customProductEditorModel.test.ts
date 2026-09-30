import type { CustomCategoryId } from '../../types/customProducts';
import { CUSTOM_PRODUCT_LIMITS } from '../../types/customProducts';
import {
  newCategory,
  prepareProductDraft,
  validateProductDraft,
} from './customProductEditorModel';

const category = (id: string, order: number, label = id) => ({
  id: id as CustomCategoryId,
  label,
  order,
  style: {
    fillColor: '#ffcc00',
    fillOpacity: 0.5,
    strokeColor: '#ffcc00',
    strokeOpacity: 1,
    strokeWidth: 2,
    hatch: 'none' as const,
  },
});

describe('customProductEditorModel', () => {
  test('prepareProductDraft reindexes categories after reorder gaps', () => {
    const prepared = prepareProductDraft({
      label: ' Day 4-8 temps ',
      description: '',
      categories: [
        category('a', 0, 'Below'),
        category('b', 2, 'Above'),
        category('c', 5, 'Near'),
      ],
    });

    expect(prepared.label).toBe('Day 4-8 temps');
    expect(prepared.categories.map(({ order }) => order)).toEqual([0, 1, 2]);
    expect(validateProductDraft(prepared)).toBeNull();
  });

  test('validateProductDraft accepts three or more ordered categories', () => {
    const draft = prepareProductDraft({
      label: 'Test',
      categories: [newCategory(0), newCategory(1), newCategory(2)],
    });
    draft.categories[0].label = 'Test1';
    draft.categories[1].label = 'Test2';
    draft.categories[2].label = 'Test3';

    expect(validateProductDraft(draft)).toBeNull();
  });

  test('prepareProductDraft trims category labels so hosted validation succeeds', () => {
    const raw = {
      label: 'Test',
      categories: [category('a', 0, 'Valid'), category('b', 1, 'Broken label ')],
    };

    expect(validateProductDraft(raw)).toBeNull();
    expect(prepareProductDraft(raw).categories[1].label).toBe('Broken label');
  });

  test('validateProductDraft rejects duplicate category ids', () => {
    const draft = prepareProductDraft({
      label: 'Dupes',
      categories: [category('same-id', 0, 'One'), category('same-id', 1, 'Two')],
    });

    expect(validateProductDraft(draft)).toBe('Fix category labels and styles before saving.');
  });

  test('validateProductDraft enforces the hosted category limit', () => {
    const categories = Array.from({ length: CUSTOM_PRODUCT_LIMITS.categoriesPerProduct + 1 }, (_, order) =>
      category(`cat-${order}`, order, `Category ${order + 1}`));
    const draft = prepareProductDraft({ label: 'Too many', categories });

    expect(validateProductDraft(draft)).toBe(
      `Products can include up to ${CUSTOM_PRODUCT_LIMITS.categoriesPerProduct} categories.`,
    );
  });
});
