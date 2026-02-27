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
  Home,
  Github,
  Twitter,
  FileText,
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
  onViewTerms?: () => void;
}

const navItems = [
  { to: '/', label: 'Home', icon: Home, shortcut: '⌃H' },
  { to: '/forecast', label: 'Forecast', icon: Map, shortcut: '⌃1' },
  { to: '/discussion', label: 'Discussion', icon: MessageSquare, shortcut: '⌃2' },
  { to: '/verification', label: 'Verification', icon: CheckCircle, shortcut: '⌃3' },
];

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
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground px-2 hidden sm:inline select-none">
              v1.0.0
            </span>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

            {/* Terms of Service */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onViewTerms}
                  aria-label="Terms of Service"
                >
                  <FileText className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Terms of Service</p>
              </TooltipContent>
            </Tooltip>

            {/* GitHub */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild aria-label="GitHub Repository">
                  <a
                    href="https://github.com/WxboySuper/Graphical-Forecast-Creator"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="h-5 w-5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>GitHub Repository</p>
              </TooltipContent>
            </Tooltip>

            {/* Discord */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild aria-label="GFC Discord Server">
                  <a
                    href="https://discord.gg/SGk37rg8sz"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
                    </svg>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>GFC Discord Server</p>
              </TooltipContent>
            </Tooltip>

            {/* X */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild aria-label="X (@WeatherboySuper)">
                  <a
                    href="https://x.com/WeatherboySuper"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Twitter className="h-5 w-5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>X (@WeatherboySuper)</p>
              </TooltipContent>
            </Tooltip>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

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
