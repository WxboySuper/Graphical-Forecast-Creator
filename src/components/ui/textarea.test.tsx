import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('forwards props, class names, and refs', async () => {
    const user = userEvent.setup();
    const ref = React.createRef<HTMLTextAreaElement>();
    const onChange = jest.fn();

    render(
      <Textarea
        ref={ref}
        aria-label="forecast note"
        className="custom-class"
        placeholder="Type here"
        onChange={onChange}
      />
    );

    const textarea = screen.getByLabelText('forecast note');
    expect(ref.current).toBe(textarea);
    expect(textarea).toHaveClass('custom-class', 'min-h-[80px]');

    await user.type(textarea, 'hello');
    expect(textarea).toHaveValue('hello');
    expect(onChange).toHaveBeenCalled();
  });
});
