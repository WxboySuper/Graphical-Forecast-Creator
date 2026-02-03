import React, { useRef } from 'react';
import './DIYDiscussionEditor.css';

interface DIYDiscussionEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const DIYDiscussionEditor: React.FC<DIYDiscussionEditorProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = 
      content.substring(0, start) + 
      before + selectedText + after + 
      content.substring(end);
    
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        end + before.length
      );
    }, 0);
  };

  const handleBold = () => insertFormatting('**', '**');
  const handleItalic = () => insertFormatting('*', '*');
  const handleH1 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n# ', '');
  };
  const handleH2 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n## ', '');
  };
  const handleH3 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n### ', '');
  };

  return (
    <div className="diy-editor">
      <div className="diy-toolbar">
        <button onClick={handleBold} title="Bold (Ctrl+B)" className="toolbar-button">
          <strong>B</strong>
        </button>
        <button onClick={handleItalic} title="Italic (Ctrl+I)" className="toolbar-button">
          <em>I</em>
        </button>
        <div className="toolbar-divider"></div>
        <button onClick={handleH1} title="Heading 1" className="toolbar-button">
          H1
        </button>
        <button onClick={handleH2} title="Heading 2" className="toolbar-button">
          H2
        </button>
        <button onClick={handleH3} title="Heading 3" className="toolbar-button">
          H3
        </button>
      </div>
      
      <textarea
        ref={textareaRef}
        className="diy-textarea"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your forecast discussion here...

You can use basic markdown formatting:
**bold text** for emphasis
*italic text* for nuance
# Large Heading
## Medium Heading
### Small Heading

Example structure:
...SUMMARY...
Brief overview of the severe weather threat.

...METEOROLOGICAL SETUP...
Describe the synoptic pattern.

...SEVERE WEATHER EXPECTATIONS...
Detail the expected hazards and probabilities."
        spellCheck={true}
      />
      
      <div className="character-count">
        {content.length.toLocaleString()} characters
      </div>
    </div>
  );
};

export default DIYDiscussionEditor;
