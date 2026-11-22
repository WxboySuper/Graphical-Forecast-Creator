/**
 * Feedback entry point context. Lets the navbar, beta banner, and floating
 * button open the single feedback dialog owned by the app layout.
 */
import React, { createContext, useContext } from 'react';

interface FeedbackContextValue {
  openFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  openFeedback: () => undefined,
});

export const FeedbackProvider: React.FC<React.PropsWithChildren<{ openFeedback: () => void }>> = ({
  openFeedback,
  children,
}) => {
  const value = React.useMemo(() => ({ openFeedback }), [openFeedback]);
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
};

/** Returns a safe no-op opener when rendered outside the app layout (tests, isolated views). */
export const useFeedback = (): FeedbackContextValue => useContext(FeedbackContext);
