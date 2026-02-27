import React from 'react';
import { NavLink } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Map, 
  MessageSquare, 
  CheckCircle, 
  Moon, 
  Sun, 
  HelpCircle,
  Cloud,
  Home
} from 'lucide-react';
import { toggleDarkMode } from '../../store/themeSlice';
import { RootState } from '../../store';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '../../lib/utils';

interface NavbarProps {
  onToggleDocumentation?: () => void;
  showDocumentation?: boolean;
}

const navItems = [
  { to: '/', label: 'Home', icon: Home, shortcut: '⌃H' },
  { to: '/forecast', label: 'Forecast', icon: Map, shortcut: '⌃1' },
  { to: '/discussion', label: 'Discussion', icon: MessageSquare, shortcut: '⌃2' },
  { to: '/verification', label: 'Verification', icon: CheckCircle, shortcut: '⌃3' },
];

export const Navbar: React.FC<NavbarProps> = ({ 
  onToggleDocumentation, 
  showDocumentation 
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
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-foreground">
              <Cloud className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg hidden sm:inline">
                Graphical Forecast Creator
              </span>
              <span className="font-semibold text-lg sm:hidden">GFC</span>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex items-center">
            <div className="flex items-center bg-muted rounded-lg p-1">
              {navItems.map(({ to, label, icon: Icon, shortcut }) => (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                          'hover:bg-background/50',
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground'
                        )
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden md:inline">{label}</span>
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{label} <span className="text-muted-foreground ml-2">{shortcut}</span></p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground px-2 hidden sm:inline select-none">
              v1.0.0-beta.2
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleDarkMode}
                  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{darkMode ? 'Light Mode' : 'Dark Mode'}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showDocumentation ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={onToggleDocumentation}
                  aria-label="Toggle documentation"
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Documentation</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </nav>
      </header>
    </TooltipProvider>
  );
};

export default Navbar;
