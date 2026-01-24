/**
 * Safely creates DOM elements for tooltip content to prevent XSS.
 *
 * @param outlookType The type of outlook (e.g., 'tornado', 'wind', 'hail')
 * @param probability The probability string (e.g., '5%', '10#')
 * @returns An HTMLElement containing the tooltip content
 */
export const createTooltipContent = (outlookType: string, probability: string): HTMLElement => {
  const container = document.createElement('div');

  // Format outlook name (capitalize first letter)
  const outlookName = outlookType.charAt(0).toUpperCase() + outlookType.slice(1);

  // Create title text
  container.appendChild(document.createTextNode(`${outlookName} Outlook`));
  container.appendChild(document.createElement('br'));

  // Create risk level text
  const isSignificant = probability.includes('#');
  const riskText = `Risk Level: ${probability}${isSignificant ? ' (Significant)' : ''}`;
  container.appendChild(document.createTextNode(riskText));
  container.appendChild(document.createElement('br'));

  // Create instruction text
  container.appendChild(document.createTextNode('Click to delete'));

  return container;
};

/**
 * Strips HTML tags from a string to ensure it is safe for display in dialogs.
 *
 * @param html The input string potentially containing HTML
 * @returns A string with HTML tags removed
 */
export const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};
