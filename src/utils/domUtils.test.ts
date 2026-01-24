import { createTooltipContent, stripHtml } from './domUtils';

describe('createTooltipContent', () => {
  test('creates tooltip content with correct text for standard inputs', () => {
    const element = createTooltipContent('tornado', '5%');

    expect(element.tagName).toBe('DIV');
    expect(element.innerHTML).toContain('Tornado Outlook');
    expect(element.innerHTML).toContain('Risk Level: 5%');
    expect(element.innerHTML).toContain('Click to delete');
    expect(element.innerHTML).not.toContain('(Significant)');
  });

  test('creates tooltip content with significant threat label', () => {
    const element = createTooltipContent('wind', '10#');

    expect(element.innerHTML).toContain('Wind Outlook');
    expect(element.innerHTML).toContain('Risk Level: 10# (Significant)');
  });

  test('safely handles malicious input (XSS check)', () => {
    const maliciousType = '<img src=x onerror=alert(1)>';
    const maliciousProb = '<script>alert("XSS")</script>';

    const element = createTooltipContent(maliciousType, maliciousProb);

    // The innerHTML should contain the ESCAPED version of the input, not the raw HTML
    expect(element.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(element.innerHTML).toContain('&lt;script&gt;alert("XSS")&lt;/script&gt;');

    // It should NOT contain the raw tags
    expect(element.innerHTML).not.toContain('<img src=x onerror=alert(1)>');
    expect(element.innerHTML).not.toContain('<script>alert("XSS")</script>');
  });
});

describe('stripHtml', () => {
  test('strips HTML tags from string', () => {
    // In JSDOM, script tags might be stripped completely or their content ignored in textContent
    // We use a simple tag to verify stripping
    const input = '<b>Bold</b> and <i>Italic</i>';
    const result = stripHtml(input);
    expect(result).toBe('Bold and Italic');
  });

  test('handles script tags by stripping them (safe behavior)', () => {
     // Verify behavior seen in previous failure - JSDOM strips script content in textContent for this parser usage
     const input = '<script>alert("XSS")</script>Hello';
     const result = stripHtml(input);
     expect(result).toBe('Hello');
  });

  test('returns standard text unchanged', () => {
    const input = '5%';
    const result = stripHtml(input);
    expect(result).toBe('5%');
  });

  test('handles empty strings', () => {
    const result = stripHtml('');
    expect(result).toBe('');
  });
});
