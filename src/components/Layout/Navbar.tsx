import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleDarkMode } from '../../store/themeSlice';
import { RootState } from '../../store';
import { TooltipProvider } from '../ui/tooltip';
import { BrandSection, MainTabs, RightActions } from './NavbarSections';
import './Navbar.css';

interface NavbarProps {
  onToggleDocumentation?: () => void;
  showDocumentation?: boolean;
  onViewTerms?: () => void;
  onViewPrivacyPolicy?: () => void;
}

// The Navbar component provides a consistent navigation interface across the application.
export const Navbar: React.FC<NavbarProps> = ({
  onToggleDocumentation,
  showDocumentation,
  onViewTerms,
  onViewPrivacyPolicy,
}) => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);

  /** Dispatches the toggleDarkMode action to switch between light and dark themes. */
  const handleToggleDarkMode = () => {
    dispatch(toggleDarkMode());
  };

  return (
    <TooltipProvider>
      <header className="app-navbar sticky top-0 z-panel">
        <div className="app-navbar__shine" />
        <nav className="app-navbar__inner">
          <div className="app-navbar__left">
            <BrandSection />
          </div>

          <div className="app-navbar__center">
            <MainTabs />
          </div>

          <div className="app-navbar__right">
            <RightActions
              darkMode={darkMode}
              showDocumentation={showDocumentation}
              onViewTerms={onViewTerms}
              onViewPrivacyPolicy={onViewPrivacyPolicy}
              onToggleDocumentation={onToggleDocumentation}
              onToggleDarkMode={handleToggleDarkMode}
            />
          </div>
        </nav>
      </header>
    </TooltipProvider>
  );
};

export default Navbar;
