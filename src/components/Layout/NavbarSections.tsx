import React from 'react';
import { NavLink } from 'react-router-dom';
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
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '../../lib/utils';

interface ExternalActionLink {
  href: string;
  ariaLabel: string;
  tooltip: string;
  icon: React.ReactNode;
}

interface RightActionsProps {
  darkMode: boolean;
  showDocumentation?: boolean;
  onViewTerms?: () => void;
  onToggleDocumentation?: () => void;
  onToggleDarkMode: () => void;
}

// Define the navigation items for the main tabs
const navItems = [
  { to: '/', label: 'Home', icon: Home, shortcut: '⌃H' },
  { to: '/forecast', label: 'Forecast', icon: Map, shortcut: '⌃1' },
  { to: '/discussion', label: 'Discussion', icon: MessageSquare, shortcut: '⌃2' },
  { to: '/verification', label: 'Verification', icon: CheckCircle, shortcut: '⌃3' },
];

// Define external links for the right action buttons
const externalLinks: ExternalActionLink[] = [
  {
    href: 'https://github.com/WxboySuper/Graphical-Forecast-Creator',
    ariaLabel: 'GitHub Repository',
    tooltip: 'GitHub Repository',
    icon: <Github className="h-5 w-5" />,
  },
  {
    href: 'https://discord.gg/SGk37rg8sz',
    ariaLabel: 'GFC Discord Server',
    tooltip: 'GFC Discord Server',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
      </svg>
    ),
  },
  {
    href: 'https://x.com/WeatherboySuper',
    ariaLabel: 'X (@WeatherboySuper)',
    tooltip: 'X (@WeatherboySuper)',
    icon: <Twitter className="h-5 w-5" />,
  },
];

// Utility function to generate class names for NavLink based on active state
const getNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
    'hover:bg-background/50',
    isActive
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground'
  );

// The BrandSection component displays the application logo and name in the navbar. It uses the Cloud icon from lucide-react and shows the full name "Graphical Forecast Creator" on larger screens, while displaying "GFC" on smaller screens for better responsiveness.
export const BrandSection: React.FC = () => (
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2 text-foreground">
      <Cloud className="h-6 w-6 text-primary" />
      <span className="font-semibold text-lg hidden sm:inline">
        Graphical Forecast Creator
      </span>
      <span className="font-semibold text-lg sm:hidden">GFC</span>
    </div>
  </div>
);

// The MainTabs component displays the main navigation tabs in the navbar.
export const MainTabs: React.FC = () => (
  <div className="flex items-center">
    <div className="flex items-center bg-muted rounded-lg p-1">
      {navItems.map(({ to, label, icon: Icon, shortcut }) => (
        <Tooltip key={to}>
          <TooltipTrigger asChild>
            <NavLink to={to} className={getNavLinkClassName}>
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
);

// The ExternalLinkButton component displays a button for linking to external resources.
const ExternalLinkButton: React.FC<ExternalActionLink> = ({ href, ariaLabel, tooltip, icon }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" asChild aria-label={ariaLabel}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {icon}
        </a>
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{tooltip}</p>
    </TooltipContent>
  </Tooltip>
);

// The RightActions component displays the action buttons on the right side of the navbar.
export const RightActions: React.FC<RightActionsProps> = ({
  darkMode,
  showDocumentation,
  onViewTerms,
  onToggleDocumentation,
  onToggleDarkMode,
}) => (
  <div className="flex items-center gap-1">
    <span className="text-xs text-muted-foreground px-2 hidden sm:inline select-none">
      v1.0.0
    </span>

    <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

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

    {externalLinks.map((link) => (
      <ExternalLinkButton key={link.href} {...link} />
    ))}

    <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleDarkMode}
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
);
