import { DiscussionData, GuidedDiscussionData, DayType } from '../types/outlooks';
import { isRecord } from './forecastWorkspaceEnvelope';

/**
 * Returns the guided sections of a discussion, or undefined when the field is
 * absent or malformed. Guided-mode discussions can be saved with the field
 * missing, so callers must not assume it exists.
 */
const getGuidedContent = (discussion: DiscussionData): GuidedDiscussionData | undefined => {
  if (!isRecord(discussion.guidedContent)) return undefined;
  return discussion.guidedContent as GuidedDiscussionData;
};

/** Appends one guided section when the discussion has text for it. */
const pushGuidedSection = (lines: string[], label: string, value: unknown): void => {
  if (typeof value !== 'string' || value.length === 0) return;
  lines.push(label);
  lines.push('');
  lines.push(value);
  lines.push('');
};

/**
 * Compiles a DiscussionData object into formatted text output
 * for GFC forecast discussions
 */
export const compileDiscussionToText = (
  discussion: DiscussionData,
  day: DayType
): string => {
  const lines: string[] = [];
  
  // Header section
  lines.push('Graphical Forecast Creator');
  lines.push(`Day ${day} Severe Weather Outlook Discussion`);
  lines.push('');
  
  // Issue time
  const now = new Date();
  const issueTime = now.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  lines.push(`Issued: ${issueTime}`);
  
  // Valid time range
  const validStart = new Date(discussion.validStart);
  const validEnd = new Date(discussion.validEnd);
  const formatValidTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };
  lines.push(`Valid: ${formatValidTime(validStart)} to ${formatValidTime(validEnd)}`);
  lines.push('');
  
  // Disclaimer
  lines.push('** UNOFFICIAL OUTLOOK - FOR EDUCATIONAL/DEMONSTRATION PURPOSES ONLY **');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Discussion content
  if (discussion.mode === 'diy') {
    // DIY mode - use the raw content
    lines.push(discussion.diyContent || '');
  } else {
    // Guided mode - format the structured sections. A guided discussion can be
    // saved without guidedContent, in which case there is nothing to format.
    const guided = getGuidedContent(discussion);
    if (guided) {
      pushGuidedSection(lines, 'Synopsis:', guided.synopsis);
      pushGuidedSection(lines, 'Meteorological Setup:', guided.meteorologicalSetup);
      pushGuidedSection(lines, 'Severe Weather Expectations:', guided.severeWeatherExpectations);
      pushGuidedSection(lines, 'Timing:', guided.timing);
      pushGuidedSection(lines, 'Regional Breakdown:', guided.regionalBreakdown);
      pushGuidedSection(lines, 'Additional Considerations:', guided.additionalConsiderations);
    }
  }
  
  // Forecaster attribution at the bottom
  lines.push('');
  lines.push('---');
  lines.push('');
  if (discussion.forecasterName) {
    lines.push(`Forecaster: ${discussion.forecasterName}`);
  }
  
  return lines.join('\n');
};

/**
 * Exports the compiled discussion to a text file
 */
export const exportDiscussionToFile = (
  discussion: DiscussionData,
  day: DayType
) => {
  const text = compileDiscussionToText(discussion, day);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-discussion-day${day}-${timestamp}.txt`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
