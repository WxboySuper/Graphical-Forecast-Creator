/**
 * Forecast header menu: renders the Forecast tab as a dropdown that showcases
 * each forecast workspace (what it is and what it focuses on), marks the current
 * one, previews unreleased workspaces as non-interactive "coming soon" rows, and
 * keeps secondary destinations reachable. Workspace identity, exposure, and copy
 * come from the workspace registry; this module owns presentation only.
 */
import type { CSSProperties, FC } from 'react';
import { NavLink } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  CloudLightning,
  Radar,
  Shapes,
  Snowflake,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';
import type { AppNavigationItemId, AppNavigationItemWithId } from '../../config/featureNavigation';
import {
  FORECAST_WORKSPACES,
  getExposedForecastWorkspaces,
  isForecastWorkspaceExposed,
  type ForecastWorkspaceDefinition,
  type ForecastWorkspaceId,
} from '../../config/forecastWorkspaces';
import './ForecastMenu.css';

type WorkspaceVisual = { icon: LucideIcon; accent: string };

/** Presentation-only identity per workspace: one icon and one accent color. */
const WORKSPACE_VISUALS: Record<ForecastWorkspaceId, WorkspaceVisual> = {
  severe: { icon: CloudLightning, accent: '234, 88, 12' },
  mesoscale: { icon: Radar, accent: '124, 58, 237' },
  tropical: { icon: Waves, accent: '13, 148, 136' },
  winter: { icon: Snowflake, accent: '37, 99, 235' },
  custom: { icon: Shapes, accent: '5, 150, 105' },
};

const accentStyle = (id: ForecastWorkspaceId): CSSProperties =>
  ({ '--forecast-menu-accent': WORKSPACE_VISUALS[id].accent }) as CSSProperties;

const isNavigationItemActive = (pathname: string, to: string, end?: boolean): boolean =>
  end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

const getCurrentForecastWorkspace = (
  pathname: string,
  workspaces: ForecastWorkspaceDefinition[],
): ForecastWorkspaceDefinition | undefined =>
  workspaces.find((workspace) => pathname === workspace.path || pathname.startsWith(`${workspace.path}/`));

const isDiscussionRoute = (pathname: string): boolean =>
  pathname === '/discussion' || pathname.startsWith('/discussion/');

const getOtherDestinationLabel = (item: AppNavigationItemWithId): string =>
  item.id === 'tropical-workspace' ? 'Tropical tools' : item.label;

const WorkspaceIconTile: FC<{ id: ForecastWorkspaceId }> = ({ id }) => {
  const Icon = WORKSPACE_VISUALS[id].icon;
  return (
    <span className="forecast-menu__tile" aria-hidden="true">
      <Icon className="forecast-menu__tileIcon" />
    </span>
  );
};

const WorkspaceCard: FC<{ workspace: ForecastWorkspaceDefinition; isCurrent: boolean }> = ({
  workspace,
  isCurrent,
}) => (
  <DropdownMenuItem asChild className="forecast-menu__item">
    <NavLink
      to={workspace.path}
      style={accentStyle(workspace.id)}
      aria-label={`${workspace.label} forecast workspace`}
      aria-describedby={`forecast-workspace-${workspace.id}-description forecast-workspace-${workspace.id}-focus`}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn('forecast-menu__card', isCurrent && 'is-current')}
    >
      <WorkspaceIconTile id={workspace.id} />
      <span className="forecast-menu__body">
        <span className="forecast-menu__titleRow">
          <span className="forecast-menu__title">{workspace.label}</span>
          {isCurrent ? (
            <span className="forecast-menu__badge forecast-menu__badge--current">Current</span>
          ) : (
            <ChevronRight className="forecast-menu__go" aria-hidden="true" />
          )}
        </span>
        <span id={`forecast-workspace-${workspace.id}-description`} className="forecast-menu__description">
          {workspace.description}
        </span>
        <ul id={`forecast-workspace-${workspace.id}-focus`} className="forecast-menu__chips">
          {workspace.focus.map((point) => (
            <li key={point} className="forecast-menu__chip">{point}</li>
          ))}
        </ul>
      </span>
    </NavLink>
  </DropdownMenuItem>
);

const ComingSoonRow: FC<{ workspace: ForecastWorkspaceDefinition }> = ({ workspace }) => (
  <DropdownMenuItem
    disabled
    className="forecast-menu__item forecast-menu__soon"
    style={accentStyle(workspace.id)}
    aria-label={`${workspace.label}, coming soon`}
  >
    <WorkspaceIconTile id={workspace.id} />
    <span className="forecast-menu__body">
      <span className="forecast-menu__titleRow">
        <span className="forecast-menu__title">{workspace.label}</span>
      </span>
      <span className="forecast-menu__description">{workspace.description}</span>
    </span>
  </DropdownMenuItem>
);

const OtherDestinationRow: FC<{
  item: AppNavigationItemWithId;
  pathname: string;
  icons: Record<AppNavigationItemId, LucideIcon>;
}> = ({ item, pathname, icons }) => {
  const Icon = icons[item.id];
  return (
    <DropdownMenuItem asChild className="forecast-menu__item">
      <NavLink
        to={item.to}
        end={item.end}
        aria-label={getOtherDestinationLabel(item)}
        aria-current={isNavigationItemActive(pathname, item.to, item.end) ? 'page' : undefined}
        className="forecast-menu__other"
      >
        <Icon className="forecast-menu__otherIcon" aria-hidden="true" />
        <span>{getOtherDestinationLabel(item)}</span>
      </NavLink>
    </DropdownMenuItem>
  );
};

const MenuHeading: FC<{ children: string }> = ({ children }) => (
  <div className="forecast-menu__heading" role="presentation">{children}</div>
);

/** The Forecast tab: a trigger plus a showcase panel of forecast workspaces. */
export const ForecastNavigationMenu: FC<{
  item: AppNavigationItemWithId;
  pathname: string;
  otherItems: AppNavigationItemWithId[];
  icons: Record<AppNavigationItemId, LucideIcon>;
}> = ({ item, pathname, otherItems, icons }) => {
  const workspaces = getExposedForecastWorkspaces();
  const comingSoon = FORECAST_WORKSPACES.filter(
    (workspace) => workspace.status === 'future' && !isForecastWorkspaceExposed(workspace),
  );
  const currentWorkspace = getCurrentForecastWorkspace(pathname, workspaces);
  const currentDiscussion = isDiscussionRoute(pathname);
  const isActive = isNavigationItemActive(pathname, item.to, item.end) || currentDiscussion;
  const TabIcon = icons[item.id];
  const currentPageLabel = currentWorkspace?.label ?? (currentDiscussion ? 'Discussion' : undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('app-navbar__tab app-navbar__forecastTrigger', isActive && 'is-active')}
          aria-label={`Forecast menu${currentPageLabel ? `, current page ${currentPageLabel}` : ''}`}
          aria-current={isNavigationItemActive(pathname, item.to, item.end) ? 'page' : undefined}
          aria-haspopup="menu"
          title={`Forecast workspaces${item.shortcutLabel ? ` (${item.shortcutLabel})` : ''}`}
        >
          <TabIcon className="app-navbar__tabIcon h-4 w-4" aria-hidden="true" />
          <span className="app-navbar__tabLabel">{item.label}</span>
          <ChevronDown className="app-navbar__forecastChevron h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="forecast-menu">
        <MenuHeading>Forecast workspaces</MenuHeading>
        {workspaces.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            isCurrent={currentWorkspace?.id === workspace.id}
          />
        ))}
        {comingSoon.length > 0 ? (
          <>
            <MenuHeading>Coming soon</MenuHeading>
            {comingSoon.map((workspace) => <ComingSoonRow key={workspace.id} workspace={workspace} />)}
          </>
        ) : null}
        {otherItems.length > 0 ? (
          <>
            <DropdownMenuSeparator className="forecast-menu__separator" />
            {otherItems.map((other) => (
              <OtherDestinationRow key={other.id} item={other} pathname={pathname} icons={icons} />
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
