export const GITHUB_PAGE_SIZE = 100;

/**
 * @template T
 * @param {(page: number) => Promise<T[]>} fetchPage
 * @returns {Promise<T[]>}
 */
export async function fetchAllPages(fetchPage) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = await fetchPage(page);
    if (!batch.length) {
      break;
    }
    items.push(...batch);
    if (batch.length < GITHUB_PAGE_SIZE) {
      break;
    }
  }
  return items;
}
