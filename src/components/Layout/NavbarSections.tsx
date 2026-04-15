import type { FC, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  icon: ReactNode;
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
  { to: '/', label: 'Home', icon: Home, shortcut: '⌃H', end: true },
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

const getNavLinkClassName = (isActive: boolean) =>
  cn('app-navbar__tab', isActive && 'is-active');

// The BrandSection component provides a compact product anchor without competing with the navigation.
export const BrandSection: FC = () => (
  <div className="app-navbar__brand">
    <div className="app-navbar__brandMark">
      <Cloud className="h-4 w-4" />
    </div>
    <div className="app-navbar__brandText">
      <span className="app-navbar__brandName app-navbar__brandName--full">
        Graphical Forecast Creator
      </span>
      <span className="app-navbar__brandName app-navbar__brandName--short">
        GFC
      </span>
    </div>
  </div>
);

// The MainTabs component keeps primary navigation next to the brand so the header reads left-to-right instead of as separate islands.
export const MainTabs: FC = () => {
  const { pathname } = useLocation();

  return (
    <div className="app-navbar__tabs">
      {navItems.map(({ to, label, icon: Icon, shortcut, end }) => {
        const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

        return (
          <Tooltip key={to}>
            <TooltipTrigger asChild>
              <NavLink to={to} end={end} className={getNavLinkClassName(isActive)}>
                <Icon className="app-navbar__tabIcon h-4 w-4" />
                <span className="app-navbar__tabLabel">{label}</span>
              </NavLink>
            </TooltipTrigger>
            <TooltipContent>
              <p>{label} <span className="text-muted-foreground ml-2">{shortcut}</span></p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};

/** Displays the small signed-in dot without adding more nesting to the account button. */
const AccountIndicator: FC<{ showSignedInDot: boolean }> = ({ showSignedInDot }) => {
  if (!showSignedInDot) {
    return null;
  }

  return <span className="app-navbar__accountIndicator" aria-hidden="true" />;
};

/** Keeps account access visually distinct from lower-priority utility links in the navbar. */
const AccountButton: FC<{ accountLabel: string; showSignedInDot: boolean }> = ({
  accountLabel,
  showSignedInDot,
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      asChild
      aria-label={accountLabel}
      className="app-navbar__actionButton app-navbar__actionButton--account"
      title={accountLabel}
    >
      <NavLink to="/account" className="app-navbar__accountLink">
        <span className="app-navbar__accountIconWrap">
          <CircleUserRound className="h-4 w-4" />
          <AccountIndicator showSignedInDot={showSignedInDot} />
        </span>
        <span className="app-navbar__accountLabel">Account</span>
      </NavLink>
    </Button>
  );
};

/** Groups lower-priority documentation, legal, and social links into a compact overflow menu. */
const MoreActionsMenu: FC<{
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="More actions"
          title="More"
          className="app-navbar__actionButton app-navbar__iconButton"
        >
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
export const RightActions: FC<RightActionsProps> = ({
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
    <div className="app-navbar__actions">
      <div className="app-navbar__statusMeta">
        <span className="app-navbar__version">
          v1.4.0
        </span>
        <span className="app-navbar__utilityDivider" aria-hidden="true" />
      </div>

      <div className="app-navbar__utilityCluster">
        <AccountButton accountLabel={accountLabel} showSignedInDot={showSignedInDot} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="app-navbar__actionButton app-navbar__iconButton"
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

        <MoreActionsMenu
          onViewTerms={onViewTerms}
          onViewPrivacyPolicy={onViewPrivacyPolicy}
          onToggleDocumentation={onToggleDocumentation}
        />
      </div>
    </div>
  );
};
