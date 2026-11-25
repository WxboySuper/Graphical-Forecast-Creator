import { isBetaClerkD1Mode } from './clerkAuthBackend';

/** Returns the hosted identity backend chosen by the current build configuration. */
export const getSelectedAuthBackend = (): 'firebase' | 'clerk' =>
  isBetaClerkD1Mode() ? 'clerk' : 'firebase';
