/** Build the bounded OpenCode CLI invocation. */
export function openCodeRunArguments(model, prompt, files = []) {
  return [
    'run', '--format', 'json', '--model', model, '--auto',
    prompt,
    ...files.flatMap((file) => ['--file', file]),
  ];
}

/** Extract the final assistant message from OpenCode's --format json event stream. */
export function extractFinalAssistantText(stdout, { format = 'text' } = {}) {
  assertExtractionInput(stdout, format);
  const finalText = readFinalAssistantMessage(stdout);
  return format === 'json' ? extractJsonAssistantResponse(finalText) : finalText;
}

/** Validate stdout and response format before parsing OpenCode events. */
function assertExtractionInput(stdout, format) {
  if (typeof stdout !== 'string' || !stdout.trim()) throw new Error('OpenCode returned no output.');
  if (!['text', 'json'].includes(format)) throw new Error('OpenCode response format must be text or json.');
}

/** Reassemble the final assistant message from streamed text parts. */
function readFinalAssistantMessage(stdout) {
  const events = stdout.trim().split(/\r?\n/).map(parseEvent);
  const textEvents = events.filter(isTextEvent);
  if (!textEvents.length) throw new Error('OpenCode returned no assistant text.');
  const finalMessageId = textEvents.at(-1).part.messageID;
  const finalText = collectMessageParts(events, finalMessageId).join('\n').trim();
  if (!finalText) throw new Error('OpenCode returned no assistant text.');
  return finalText;
}

/** Merge incremental text parts that share a message id. */
function collectMessageParts(events, messageId) {
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
}

/** Parse the first JSON object embedded in the assistant message. */
function extractJsonAssistantResponse(text) {
  const candidate = unwrapJsonFence(text.trim());
  const directResult = isJsonObject(candidate) ? candidate : findJsonObjectAfterPrefix(candidate);
  if (directResult) return directResult;
  throw new Error('OpenCode final assistant message did not contain a JSON object.');
}

/** Scan for a JSON object after optional leading prose. */
function findJsonObjectAfterPrefix(text) {
  let from = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const start = text.indexOf('{', from);
    if (start < 0) return null;
    const candidate = readValidObjectAt(text, start);
    if (candidate) return candidate;
    from = start + 1;
  }
  return null;
}

/** Return a JSON object substring when braces balance at `start`. */
function readValidObjectAt(text, start) {
  const end = findObjectEnd(text, start);
  if (end < 0) return null;
  const candidate = text.slice(start, end + 1);
  return isJsonObject(candidate) ? candidate : null;
}

/** Return whether `text` parses to a non-array object. */
function isJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** Strip a trailing Markdown JSON fence when present. */
function unwrapJsonFence(text) {
  const match = text.match(/(?:^|\r?\n)```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return match ? match[1].trim() : text;
}

/** Find the closing brace index for an object starting at `start`. */
function findObjectEnd(text, start) {
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
}

/** Update string-literal scanner state for brace matching. */
function advanceStringState(character, state) {
  if (state.escaped) state.escaped = false;
  else if (character === '\\') state.escaped = true;
  else if (character === '"') state.inString = false;
}

/** Decrement object depth and report when the outer object closes. */
function closeObject(state) {
  state.depth--;
  return state.depth === 0;
}

/** Parse one OpenCode JSON event line. */
function parseEvent(line) {
  try { return JSON.parse(line); } catch { throw new Error('OpenCode returned an invalid JSON event stream.'); }
}

/** Return whether an event carries assistant text payload. */
function isTextEvent(event) {
  return event?.type === 'text'
    && event.part?.type === 'text'
    && typeof event.part.messageID === 'string'
    && typeof event.part.text === 'string';
}
