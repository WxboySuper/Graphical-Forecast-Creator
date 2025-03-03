// Import enableMapSet directly from immer
import { enableMapSet } from 'immer';

// Enable the MapSet plugin for Immer
// This needs to be called before any Immer functionality is used
enableMapSet();

// Export something to ensure the file is not tree-shaken
export const immerConfigured = true;
