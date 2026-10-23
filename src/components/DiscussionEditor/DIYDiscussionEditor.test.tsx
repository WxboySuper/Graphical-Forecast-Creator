import { fireEvent, render, screen } from '@testing-library/react';
import DIYDiscussionEditor from './DIYDiscussionEditor';

const setSelection = (textarea: HTMLTextAreaElement, start: number, end = start) => {
  textarea.focus();
  textarea.setSelectionRange(start, end);
};

describe('DIYDiscussionEditor', () => {
  test('edits text, reports character count, and wraps selected text with markdown', () => {
    const onChange = jest.fn();
    render(<DIYDiscussionEditor content="Storm mode" onChange={onChange} />);

    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/i) as HTMLTextAreaElement;
    expect(screen.getByText('10 characters')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Updated discussion' } });
    expect(onChange).toHaveBeenCalledWith('Updated discussion');

    setSelection(textarea, 0, 5);
    fireEvent.click(screen.getByTitle(/Bold/i));
    expect(onChange).toHaveBeenLastCalledWith('**Storm** mode');

    setSelection(textarea, 6, 10);
    fireEvent.click(screen.getByTitle(/Italic/i));
    expect(onChange).toHaveBeenLastCalledWith('Storm *mode*');
  });

  test('inserts heading prefixes at the start of the current line', () => {
    const onChange = jest.fn();
    render(<DIYDiscussionEditor content="Discussion" onChange={onChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/i) as HTMLTextAreaElement;

    setSelection(textarea, 0);
    fireEvent.click(screen.getByTitle('Heading 1'));
    expect(onChange).toHaveBeenLastCalledWith('# Discussion');

    fireEvent.click(screen.getByTitle('Heading 2'));
    expect(onChange).toHaveBeenLastCalledWith('## Discussion');

    fireEvent.click(screen.getByTitle('Heading 3'));
    expect(onChange).toHaveBeenLastCalledWith('### Discussion');
  });

  test('heading buttons convert a mid-line cursor without splitting the line', () => {
    const onChange = jest.fn();
    render(<DIYDiscussionEditor content="some text" onChange={onChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/i) as HTMLTextAreaElement;

    setSelection(textarea, 2);
    fireEvent.click(screen.getByTitle('Heading 1'));
    expect(onChange).toHaveBeenLastCalledWith('# some text');
  });

  test('heading buttons prefix the current line in multiline content', () => {
    const onChange = jest.fn();
    render(<DIYDiscussionEditor content={'line1\nline2 text'} onChange={onChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/i) as HTMLTextAreaElement;

    setSelection(textarea, 8);
    fireEvent.click(screen.getByTitle('Heading 2'));
    expect(onChange).toHaveBeenLastCalledWith('line1\n## line2 text');
  });

  test('heading at position 0 prefixes the first line even when content starts with a newline', () => {
    const onChange = jest.fn();
    render(<DIYDiscussionEditor content={'\nDiscussion'} onChange={onChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/i) as HTMLTextAreaElement;

    setSelection(textarea, 0);
    fireEvent.click(screen.getByTitle('Heading 1'));
    expect(onChange).toHaveBeenLastCalledWith('# \nDiscussion');
  });
});
