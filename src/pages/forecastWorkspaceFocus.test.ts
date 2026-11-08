import { makeSubtreeUntabbable } from './forecastWorkspaceFocus';

describe('makeSubtreeUntabbable', () => {
  test('removes descendants from keyboard order and restores their tabindex values', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button>Action</button><a href="/forecast" tabindex="2">Forecast</a>';
    const button = root.querySelector('button')!;
    const link = root.querySelector('a')!;

    const restore = makeSubtreeUntabbable(root);

    expect(button).toHaveAttribute('tabindex', '-1');
    expect(link).toHaveAttribute('tabindex', '-1');
    restore();
    expect(button).not.toHaveAttribute('tabindex');
    expect(link).toHaveAttribute('tabindex', '2');
  });
});
