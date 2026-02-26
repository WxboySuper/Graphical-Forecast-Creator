import React, { useState, useCallback, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Navbar } from './Navbar';
import Documentation from '../Documentation/Documentation';
import { ToastManager } from '../Toast/Toast';
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

export const AppLayoutContext = React.createContext<AppLayoutContextValue | null>(null);

export const useAppLayout = () => {
  const context = React.useContext(AppLayoutContext);
  if (!context) {
    throw new Error('useAppLayout must be used within AppLayout');
  }
  return context;
};

export const AppLayout: React.FC = () => {
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const navigate = useNavigate();

  // Toast management
  const addToast = useCallback<AddToastFn>((message, type = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const toggleDocumentation = useCallback(() => {
    setShowDocumentation(prev => !prev);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the documentation panel
      if (e.key === 'Escape' && showDocumentation) {
        setShowDocumentation(false);
        return;
      }

      // Check for Ctrl/Cmd + key shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'h':
            e.preventDefault();
            navigate('/');
            break;
          case '1':
            e.preventDefault();
            navigate('/forecast');
            break;
          case '2':
            e.preventDefault();
            navigate('/discussion');
            break;
          case '3':
            e.preventDefault();
            navigate('/verification');
            break;
          case 'd':
            e.preventDefault();
            document.documentElement.classList.toggle('dark-mode');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, showDocumentation]);

  return (
    <AppLayoutContext.Provider value={{ addToast }}>
      <div className={cn('min-h-screen bg-background text-foreground', darkMode && 'dark-mode')}>
        <Navbar 
          onToggleDocumentation={toggleDocumentation}
          showDocumentation={showDocumentation}
        />
        
        {/* Documentation side-panel (right-side drawer) */}
        {showDocumentation && (
          <>
            {/* Backdrop — click to close */}
            <div
              className="fixed inset-0 z-[900] bg-black/25"
              style={{ top: '56px' }}
              onClick={() => setShowDocumentation(false)}
              aria-hidden="true"
            />
            {/* Panel */}
            <div
              className="fixed top-14 right-0 bottom-0 z-[901] w-[440px] max-w-[92vw] bg-background border-l border-border shadow-2xl overflow-y-auto"
              role="dialog"
              aria-label="Documentation"
              aria-modal="true"
            >
              <Documentation onClose={() => setShowDocumentation(false)} />
            </div>
          </>
        )}

        {/* Main content area - below navbar */}
        <main className="pt-14 h-screen">
          
          {/* Page content via router outlet */}
          <Outlet context={{ addToast }} />
        </main>
        
        <ToastManager toasts={toasts} onDismiss={removeToast} />
      </div>
    </AppLayoutContext.Provider>
  );
};

export default AppLayout;
