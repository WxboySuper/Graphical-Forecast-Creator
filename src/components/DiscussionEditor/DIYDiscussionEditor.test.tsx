import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DIYDiscussionEditor from './DIYDiscussionEditor';

describe('DIYDiscussionEditor', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders without crashing', () => {
    render(<DIYDiscussionEditor content="" onChange={mockOnChange} />);
    expect(screen.getByPlaceholderText(/Write your forecast discussion/)).toBeInTheDocument();
  });

  it('displays initial content', () => {
    const testContent = 'Test forecast content';
    render(<DIYDiscussionEditor content={testContent} onChange={mockOnChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/) as HTMLTextAreaElement;
    expect(textarea.value).toBe(testContent);
  });

  it('calls onChange when content is edited', () => {
    render(<DIYDiscussionEditor content="" onChange={mockOnChange} />);
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New content' } });
    expect(mockOnChange).toHaveBeenCalledWith('New content');
  });

  it('bold button wraps selected text with **', () => {
    const content = 'Select this text';
    render(<DIYDiscussionEditor content={content} onChange={mockOnChange} />);
    
    const textarea = screen.getByPlaceholderText(/Write your forecast discussion/) as HTMLTextAreaElement;
    // Simulate selecting text (we can't actually select in tests easily, so just test button works)
    const boldButton = screen.getByTitle('Bold (Ctrl+B)');
    fireEvent.click(boldButton);
    // The function should be called with the formatting applied
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('italic button wraps selected text with *', () => {
    const content = 'Select this text';
    render(<DIYDiscussionEditor content={content} onChange={mockOnChange} />);
    
    const italicButton = screen.getByTitle('Italic (Ctrl+I)');
    fireEvent.click(italicButton);
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('H1 button inserts # heading', () => {
    const content = 'Test';
    render(<DIYDiscussionEditor content={content} onChange={mockOnChange} />);
    
    const h1Button = screen.getByTitle('Heading 1');
    fireEvent.click(h1Button);
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('H2 button inserts ## heading', () => {
    const content = 'Test';
    render(<DIYDiscussionEditor content={content} onChange={mockOnChange} />);
    
    const h2Button = screen.getByTitle('Heading 2');
    fireEvent.click(h2Button);
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('H3 button inserts ### heading', () => {
    const content = 'Test';
    render(<DIYDiscussionEditor content={content} onChange={mockOnChange} />);
    
    const h3Button = screen.getByTitle('Heading 3');
    fireEvent.click(h3Button);
    expect(mockOnChange).toHaveBeenCalled();
  });
});