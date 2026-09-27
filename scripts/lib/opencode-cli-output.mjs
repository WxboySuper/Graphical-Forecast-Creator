/** Extract the final assistant message from OpenCode's --format json event stream. */
export const extractFinalAssistantText = (stdout) => {
  if (typeof stdout !== 'string' || !stdout.trim()) throw new Error('OpenCode returned no output.');

  const events = stdout.trim().split(/\r?\n/).map(parseEvent);
  const textEvents = events.filter(isTextEvent);
  if (!textEvents.length) throw new Error('OpenCode returned no assistant text.');

  const finalMessageId = textEvents.at(-1).part.messageID;
  const finalText = textEvents
    .filter((event) => event.part.messageID === finalMessageId)
    .map((event) => event.part.text)
    .join('')
    .trim();

  if (!finalText) throw new Error('OpenCode returned no assistant text.');
  return extractJsonObject(finalText);
};

const extractJsonObject = (text) => {
  if (isJsonObject(text)) return text;

  const finalJsonLine = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  if (!finalJsonLine || !isJsonObject(finalJsonLine)) {
    throw new Error('OpenCode final assistant message did not end with a JSON object.');
  }
  return finalJsonLine;
};

const isJsonObject = (text) => {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  } catch {
    return false;
  }
};

const parseEvent = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error('OpenCode returned an invalid JSON event stream.');
  }
};

const isTextEvent = (event) => event?.type === 'text'
  && event.part?.type === 'text'
  && typeof event.part.messageID === 'string'
  && typeof event.part.text === 'string';
