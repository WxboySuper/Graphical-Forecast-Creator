import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Map,
  MessageSquare,
  CheckCircle,
  Moon,
  Sun,
  HelpCircle,
  ExternalLink,
  Cloud,
  Home,
  Github,
  Twitter,
  FileText,
  Shield,
  CircleUserRound,
  MoreHorizontal,
  Crown,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { useAuth } from '../../auth/AuthProvider';

interface ExternalActionLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface RightActionsProps {
  darkMode: boolean;
  showDocumentation?: boolean;
  onViewTerms?: () => void;
  onViewPrivacyPolicy?: () => void;
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
    label: 'GitHub Repository',
    icon: <Github className="h-5 w-5" />,
  },
  {
    href: 'https://discord.gg/SGk37rg8sz',
    label: 'GFC Discord Server',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
      </svg>
    ),
  },
  {
    href: 'https://x.com/WeatherboySuper',
    label: 'X (@WeatherboySuper)',
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
const ExternalLinkButton: React.FC<ExternalActionLink> = ({ href, label, icon }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" asChild aria-label={label}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {icon}
        </a>
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{label}</p>
    </TooltipContent>
  </Tooltip>
);

/** Displays the small signed-in dot without adding more nesting to the account button. */
const AccountIndicator: React.FC<{ showSignedInDot: boolean }> = ({ showSignedInDot }) => {
  if (!showSignedInDot) {
    return null;
  }

  return <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />;
};

/** Keeps account access visually distinct from lower-priority utility links in the navbar. */
const AccountButton: React.FC<{ accountLabel: string; showSignedInDot: boolean; status: string }> = ({
  accountLabel,
  showSignedInDot,
  status,
}) => {
  const buttonVariant = status === 'signed_in' ? 'secondary' : 'outline';

  return (
    <Button variant={buttonVariant} size="sm" asChild aria-label={accountLabel} className="gap-2" title={accountLabel}>
      <NavLink to="/account" className="relative">
        <CircleUserRound className="h-4 w-4" />
        <span className="hidden lg:inline">Account</span>
        <AccountIndicator showSignedInDot={showSignedInDot} />
      </NavLink>
    </Button>
  );
};

/** Groups lower-priority documentation, legal, and social links into a compact overflow menu. */
const MoreActionsMenu: React.FC<{
  onViewTerms?: () => void;
  onViewPrivacyPolicy?: () => void;
  onToggleDocumentation?: () => void;
}> = ({ onViewTerms, onViewPrivacyPolicy, onToggleDocumentation }) => {
  /** Opens a community/resource link from the navbar overflow menu in a new tab. */
  const openExternalLink = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions" title="More">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Resources</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onToggleDocumentation}>
          <HelpCircle className="h-4 w-4" />
          Documentation
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onViewTerms}>
          <FileText className="h-4 w-4" />
          Terms of Service
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onViewPrivacyPolicy}>
          <Shield className="h-4 w-4" />
          Privacy Policy
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/pricing">
            <Crown className="h-4 w-4" />
            Pricing
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Community</DropdownMenuLabel>
        {externalLinks.map((link) => (
          <DropdownMenuItem key={link.href} onSelect={() => openExternalLink(link.href)}>
            {link.icon}
            {link.label}
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// The RightActions component displays the action buttons on the right side of the navbar.
export const RightActions: React.FC<RightActionsProps> = ({
  darkMode,
  onViewTerms,
  onViewPrivacyPolicy,
  onToggleDocumentation,
  onToggleDarkMode,
}) => {
  const { hostedAuthEnabled, status, user } = useAuth();
  const accountLabel = status === 'signed_in' ? `Account (${user?.email ?? 'signed in'})` : 'Account';
  const showSignedInDot = hostedAuthEnabled && status === 'signed_in';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground px-2 hidden sm:inline select-none">
        v1.4.0-beta
      </span>

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      <AccountButton accountLabel={accountLabel} showSignedInDot={showSignedInDot} status={status} />

      {externalLinks.map((link) => (
        <div key={link.href} className="hidden md:block">
          <ExternalLinkButton {...link} />
        </div>
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

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      <MoreActionsMenu
        onViewTerms={onViewTerms}
        onViewPrivacyPolicy={onViewPrivacyPolicy}
        onToggleDocumentation={onToggleDocumentation}
      />
    </div>
  );
};
