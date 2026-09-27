/** Build the bounded OpenCode CLI invocation. */
export const openCodeRunArguments = (model, prompt) => [
  'run', '--format', 'json', '--model', model, '--auto', prompt,
];

/** Extract the final assistant message from OpenCode's --format json event stream. */
export const extractFinalAssistantText = (stdout, { format = 'text' } = {}) => {
  if (typeof stdout !== 'string' || !stdout.trim()) throw new Error('OpenCode returned no output.');
  if (!['text', 'json'].includes(format)) throw new Error('OpenCode response format must be text or json.');

  const events = stdout.trim().split(/\r?\n/).map(parseEvent);
  const textEvents = events.filter(isTextEvent);
  if (!textEvents.length) throw new Error('OpenCode returned no assistant text.');

  const finalMessageId = textEvents.at(-1).part.messageID;
  const finalText = collectMessageParts(events, finalMessageId).join('\n').trim();
  if (!finalText) throw new Error('OpenCode returned no assistant text.');
  return format === 'json' ? extractJsonAssistantResponse(finalText) : finalText;
};

const collectMessageParts = (events, messageId) => {
  const parts = new Map();
  events.forEach((event, index) => {
    if (event.part.messageID !== messageId) return;
    const partId = event.part.id ?? `event-${index}`;
    const previous = parts.get(partId);
    const current = event.part.text;
    if (previous === undefined || current.startsWith(previous)) parts.set(partId, current);
    else if (!previous.startsWith(current)) parts.set(partId, `${previous}\n${current}`);
  });
  return [...parts.values()];
};

const extractJsonAssistantResponse = (text) => {
  const candidate = unwrapJsonFence(text.trim());
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return candidate;
  } catch { /* Find an object after assistant progress text. */ }

  let start = candidate.indexOf('{');
  let attempts = 0;
  while (start >= 0 && attempts < 100) {
    const end = findObjectEnd(candidate, start);
    if (end >= 0 && !candidate.slice(end + 1).trim()) {
      const json = candidate.slice(start, end + 1);
      try {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return json;
      } catch { /* Continue in case prefatory text contains braces. */ }
    }
    start = candidate.indexOf('{', start + 1);
    attempts++;
  }
  throw new Error('OpenCode final assistant message did not contain a JSON object.');
};

const unwrapJsonFence = (text) => {
  const match = text.match(/(?:^|\r?\n)```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return match ? match[1].trim() : text;
};

const findObjectEnd = (text, start) => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
};

const parseEvent = (line) => {
  try { return JSON.parse(line); } catch { throw new Error('OpenCode returned an invalid JSON event stream.'); }
};

const isTextEvent = (event) => event?.type === 'text'
  && event.part?.type === 'text'
  && typeof event.part.messageID === 'string'
  && typeof event.part.text === 'string';