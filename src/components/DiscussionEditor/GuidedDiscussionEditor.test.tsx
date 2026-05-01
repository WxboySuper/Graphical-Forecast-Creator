import { fireEvent, render, screen } from '@testing-library/react';
import GuidedDiscussionEditor from './GuidedDiscussionEditor';
import type { GuidedDiscussionData } from '../../types/outlooks';

const content: GuidedDiscussionData = {
  synopsis: 'Initial synopsis',
  meteorologicalSetup: '',
  severeWeatherExpectations: '',
  timing: '',
  regionalBreakdown: '',
  additionalConsiderations: '',
};

describe('GuidedDiscussionEditor', () => {
  test('renders all guided sections and updates the targeted field', () => {
    const onChange = jest.fn();
    render(<GuidedDiscussionEditor content={content} onChange={onChange} />);

    expect(screen.getByText('SUMMARY')).toBeInTheDocument();
    expect(screen.getByText('METEOROLOGICAL SETUP')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);

    fireEvent.change(screen.getByDisplayValue('Initial synopsis'), {
      target: { value: 'Updated synopsis' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...content,
      synopsis: 'Updated synopsis',
    });
  });
});
