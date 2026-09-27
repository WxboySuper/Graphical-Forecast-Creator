/** Build the bounded OpenCode CLI invocation. */
export const openCodeRunArguments = (model, prompt) => [
  'run', '--format', 'json', '--model', model, '--auto', prompt,
];

/** Extract the final assistant message from OpenCode's --format json event stream. */
export const extractFinalAssistantText = (stdout, { format = 'text' } = {}) => {
  assertExtractionInput(stdout, format);
  const finalText = readFinalAssistantMessage(stdout);
  return format === 'json' ? extractJsonAssistantResponse(finalText) : finalText;
};

const assertExtractionInput = (stdout, format) => {
  if (typeof stdout !== 'string' || !stdout.trim()) throw new Error('OpenCode returned no output.');
  if (!['text', 'json'].includes(format)) throw new Error('OpenCode response format must be text or json.');
};

const readFinalAssistantMessage = (stdout) => {
  const events = stdout.trim().split(/\r?\n/).map(parseEvent);
  const textEvents = events.filter(isTextEvent);
  if (!textEvents.length) throw new Error('OpenCode returned no assistant text.');
  const finalMessageId = textEvents.at(-1).part.messageID;
  const finalText = collectMessageParts(events, finalMessageId).join('\n').trim();
  if (!finalText) throw new Error('OpenCode returned no assistant text.');
  return finalText;
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
  const directResult = isJsonObject(candidate) ? candidate : findJsonObjectAfterPrefix(candidate);
  if (directResult) return directResult;
  throw new Error('OpenCode final assistant message did not contain a JSON object.');
};

const findJsonObjectAfterPrefix = (text) => {
  let from = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const start = text.indexOf('{', from);
    if (start < 0) return null;
    const end = findObjectEnd(text, start);
    if (end >= 0 && hasOnlyWhitespaceAfter(text, end)) {
      const candidate = text.slice(start, end + 1);
      if (isJsonObject(candidate)) return candidate;
    }
    from = start + 1;
  }
  return null;
};

const hasOnlyWhitespaceAfter = (text, index) => !text.slice(index + 1).trim();

const isJsonObject = (text) => {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
};

const unwrapJsonFence = (text) => {
  const match = text.match(/(?:^|\r?\n)```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return match ? match[1].trim() : text;
};

const findObjectEnd = (text, start) => {
  const state = { depth: 0, inString: false, escaped: false };
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (state.inString) {
      advanceStringState(character, state);
      continue;
    }
    if (character === '"') state.inString = true;
    else if (character === '{') state.depth++;
    else if (character === '}' && closeObject(state)) return index;
  }
  return -1;
};

const advanceStringState = (character, state) => {
  if (state.escaped) state.escaped = false;
  else if (character === '\\') state.escaped = true;
  else if (character === '"') state.inString = false;
};

const closeObject = (state) => {
  state.depth--;
  return state.depth === 0;
};

const parseEvent = (line) => {
  try { return JSON.parse(line); } catch { throw new Error('OpenCode returned an invalid JSON event stream.'); }
};

const isTextEvent = (event) => event?.type === 'text'
  && event.part?.type === 'text'
  && typeof event.part.messageID === 'string'
  && typeof event.part.text === 'string';
