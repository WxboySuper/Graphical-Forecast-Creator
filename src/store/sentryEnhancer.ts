import * as Sentry from '@sentry/react';
import type { UnknownAction } from '@reduxjs/toolkit';
import { isSentryEnabled } from '../instrument';
import type { RootState } from './index';

const FORECAST_ACTION_PREFIX = 'forecast/';

/** Redux enhancer for Sentry breadcrumbs and scope tags. No-op when Sentry is disabled. */
export function appendSentryReduxEnhancer<TE extends readonly unknown[]>(
  getDefaultEnhancers: () => TE
): TE | [...TE, ReturnType<typeof Sentry.createReduxEnhancer>] {
  const defaults = getDefaultEnhancers();
  if (!isSentryEnabled()) {
    return defaults;
  }

  return [
    ...defaults,
    Sentry.createReduxEnhancer({
      attachReduxState: false,
      actionTransformer: (action: UnknownAction) => {
        if (typeof action.type === 'string' && action.type.startsWith(FORECAST_ACTION_PREFIX)) {
          return { type: action.type };
        }
        return action;
      },
      configureScopeWithState(scope, state: RootState) {
        scope.setTag('theme.darkMode', String(state.theme.darkMode));
        scope.setTag('app.mode', state.appMode.mode);
      },
    }),
  ];
}
