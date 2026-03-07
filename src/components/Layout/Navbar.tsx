import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleDarkMode } from '../../store/themeSlice';
import { RootState } from '../../store';
import { TooltipProvider } from '../ui/tooltip';
import { BrandSection, MainTabs, RightActions } from './NavbarSections';

interface NavbarProps {
  onToggleDocumentation?: () => void;
  showDocumentation?: boolean;
  onViewTerms?: () => void;
}

// The Navbar component provides a consistent navigation interface across the application.
export const Navbar: React.FC<NavbarProps> = ({
  onToggleDocumentation,
  showDocumentation,
  onViewTerms,
}) => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);

  const handleToggleDarkMode = () => {
    dispatch(toggleDarkMode());
  };

  return (
    <TooltipProvider>
      <header className="fixed top-0 left-0 right-0 z-panel h-14 bg-background border-b border-border">
        <nav className="h-full max-w-full mx-auto px-4 flex items-center justify-between">
          <BrandSection />
          <MainTabs />
          <RightActions
            darkMode={darkMode}
            showDocumentation={showDocumentation}
            onViewTerms={onViewTerms}
            onToggleDocumentation={onToggleDocumentation}
            onToggleDarkMode={handleToggleDarkMode}
          />
        </nav>
      </header>
    </TooltipProvider>
  );
};

export default Navbar;
