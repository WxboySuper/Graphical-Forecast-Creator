import { produce } from 'immer';
import type { ThunkAction } from '@reduxjs/toolkit';
import type { UnknownAction } from 'redux';
import type { OutlookData, DayType } from '../types/outlooks';
import type { TrimOutlookDataResult } from '../utils/outlookPolygonMasking/trimOutlookData';
import type { LandMaskStrategy } from '../utils/outlookPolygonMasking/types';
import type { RootState } from './index';
import { applyTrimmedCurrentDayOutlooks } from './forecastSlice';

/** Trims the active day after loading the geometry code on demand. */
export const trimCurrentDayOutlooksToLand = ({
  strategy,
  day,
}: {
  strategy: LandMaskStrategy;
  day?: DayType;
}): ThunkAction<Promise<void>, RootState, unknown, UnknownAction> => async (dispatch, getState) => {
  const targetDay = day ?? getState().forecast.forecastCycle.currentDay;
  const dayData = getState().forecast.forecastCycle.days[targetDay];
  if (!dayData) {
    return;
  }

  const [{ getCachedLandMask }, { trimOutlookDataInPlace }] = await Promise.all([
    import('../utils/outlookPolygonMasking/landMaskRuntime'),
    import('../utils/outlookPolygonMasking/trimOutlookData'),
  ]);
  const landMask = getCachedLandMask(strategy);
  if (!landMask) {
    return;
  }

  let result: TrimOutlookDataResult | null = null;
  const data = produce(dayData.data, (draft) => {
    result = trimOutlookDataInPlace(draft as unknown as OutlookData, landMask, strategy);
  });

  if (result) {
    dispatch(applyTrimmedCurrentDayOutlooks({ day: targetDay, data, result }));
  }
};
