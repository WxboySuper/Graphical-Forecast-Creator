import React, { useState, useCallback, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Navbar } from './Navbar';
import Documentation from '../Documentation/Documentation';
import { ToastManager } from '../Toast/Toast';
import ToSModal from '../ToS/ToSModal';
import { AlertBanner } from '../AlertBanner';
import { RootState } from '../../store';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../lib/utils';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export type AddToastFn = (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

interface AppLayoutContextValue {
  addToast: AddToastFn;
}

// Context for the app layout, providing a way for child components to add toast notifications without needing to pass down the addToast function through props. This allows for a more flexible and decoupled design, where any component within the AppLayout can trigger toast messages by using the useAppLayout hook to access the addToast function from the context.
export const AppLayoutContext = React.createContext<AppLayoutContextValue | null>(null);

// Custom hook to access the AppLayout context, which provides the addToast function for showing toast notifications. This hook ensures that it is used within the AppLayout component and throws an error if it is used outside of the context provider.
export const useAppLayout = () => {
  const context = React.useContext(AppLayoutContext);
  if (!context) {
    throw new Error('useAppLayout must be used within AppLayout');
  }
  return context;
};

// Main layout component for the app, which includes the navbar, documentation panel, main content area (where different pages are rendered based on routing), and a toast manager for showing notifications. It also manages the state for showing/hiding the documentation panel and the ToS viewer modal, and it applies dark mode styling based on the Redux state. The component uses React Router's Outlet to render child routes and provides the addToast function through context for use in child components.
export const AppLayout: React.FC = () => {
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [showTermsViewer, setShowTermsViewer] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const navigate = useNavigate();

  // Toast management
  const addToast = useCallback<AddToastFn>((message, type = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  // Handler to remove a toast by ID, which is passed to the ToastManager component to allow it to dismiss individual toast notifications when they expire or when the user manually dismisses them.
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Handler to toggle the visibility of the documentation panel, which is triggered by a button in the navbar. It updates the showDocumentation state to show or hide the documentation side-panel when the button is clicked.
  const toggleDocumentation = useCallback(() => {
    setShowDocumentation(prev => !prev);
  }, []);

  // Handlers for ToS modal
  const handleViewTerms = useCallback(() => {
    setShowTermsViewer(true);
  }, []);

  // Note: The ToS modal in "view-only" mode does not have an accept button, so we don't need a handler for acceptance. The user can only close the modal after viewing the terms.
  const handleCloseDocumentation = useCallback(() => {
    setShowDocumentation(false);
  }, []);

  // Handler to close the ToS viewer modal
  const handleCloseTermsViewer = useCallback(() => {
    setShowTermsViewer(false);
  }, []);

  // Example of a file load handler that could be passed down to child components (like the forecast editor)
  const handleViewOnlyToSAccept = useCallback(() => {
    // View-only modal does not need accept behavior.
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Keyboard shortcuts for navigation
  useEffect(() => {
    // Handler for keydown events: Escape closes docs; Ctrl/Cmd+key shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showDocumentation) {
        setShowDocumentation(false);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        // Define Ctrl/Cmd+key shortcuts for navigation and actions
        const key = e.key.toLowerCase();
        // Define shortcuts for navigation and actions
        const shortcuts: Record<string, () => void> = {
          h: () => navigate('/'),
          '1': () => navigate('/forecast'),
          '2': () => navigate('/discussion'),
          '3': () => navigate('/verification'),
          d: () => document.documentElement.classList.toggle('dark-mode'),
        };

        // Example: Ctrl+H for home, Ctrl+1 for forecast, Ctrl+2 for discussion, Ctrl+3 for verification, Ctrl+D to toggle dark mode
        const action = shortcuts[key];
        if (action) {
          e.preventDefault();
          action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, showDocumentation]);

  // Small presentational subcomponent that encapsulates the documentation side-panel
  const DocumentationPanel: React.FC<{ show: boolean; onClose: () => void }> = ({ show, onClose }) => {
    if (!show) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-[900] bg-black/25"
          style={{ top: '56px' }}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          className="fixed top-14 right-0 bottom-0 z-[901] w-[440px] max-w-[92vw] bg-background border-l border-border shadow-2xl overflow-y-auto"
          role="dialog"
          aria-label="Documentation"
          aria-modal="true"
        >
          <Documentation onClose={onClose} />
        </div>
      </>
    );
  };

  // Terms viewer wrapper to keep AppLayout lean
  const TermsViewer: React.FC<{ show: boolean; onClose: () => void; onAccept: () => void }> = ({ show, onClose, onAccept }) => {
    if (!show) return null;
    return <ToSModal viewOnly onClose={onClose} onAccept={onAccept} />;
  };

  return (
    <AppLayoutContext.Provider value={{ addToast }}>
      <div className={cn('min-h-screen bg-background text-foreground', darkMode && 'dark-mode')}>
        <Navbar 
          onToggleDocumentation={toggleDocumentation}
          showDocumentation={showDocumentation}
          onViewTerms={handleViewTerms}
        />

        {/* Documentation side-panel (right-side drawer) */}
        <DocumentationPanel show={showDocumentation} onClose={handleCloseDocumentation} />

        {/* Main content area - below navbar */}
        <main className="pt-14 h-screen">
          <AlertBanner />
          
          {/* Page content via router outlet */}
          <Outlet context={{ addToast }} />
        </main>
        
        <ToastManager toasts={toasts} onDismiss={removeToast} />

        <TermsViewer show={showTermsViewer} onClose={handleCloseTermsViewer} onAccept={handleViewOnlyToSAccept} />
      </div>
    </AppLayoutContext.Provider>
  );
};

export default AppLayout;
