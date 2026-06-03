import { useEffect, useState } from 'react';
import { useCloudCycles } from '../hooks/useCloudCycles';
import type { AddToastFn } from '../components/Layout';
import type { MonitorOutlookSourceOption } from '../monitor/outlookSources';
import { deserializeForecast } from '../utils/fileUtils';

const loadCloudOutlookOption = async (
  loadCycle: ReturnType<typeof useCloudCycles>['loadCycle'],
  selectedOption: MonitorOutlookSourceOption,
  today: string,
): Promise<MonitorOutlookSourceOption> => {
  const payload = await loadCycle(selectedOption.id);
  if (!payload) {
    return selectedOption;
  }

  const cycle = deserializeForecast(payload);
  const dayOne = cycle.cycleDate === today ? cycle.days[1]?.data : undefined;
  return {
    ...selectedOption,
    data: dayOne,
    status: dayOne ? undefined : 'Cloud cycle does not contain a Day 1 outlook for today.',
  };
};

export const useMonitorCloudOutlook = ({
  selectedOption,
  today,
  addToast,
}: {
  selectedOption: MonitorOutlookSourceOption;
  today: string;
  addToast: AddToastFn;
}) => {
  const { loadCycle } = useCloudCycles();
  const [cloudOption, setCloudOption] = useState<MonitorOutlookSourceOption | null>(null);

  useEffect(() => {
    if (selectedOption.kind !== 'cloud-cycle') {
      setCloudOption(null);
      return undefined;
    }

    let active = true;

    loadCloudOutlookOption(loadCycle, selectedOption, today)
      .then((option) => {
        if (active) {
          setCloudOption(option);
        }
      })
      .catch(() => {
        if (!active) {
          return undefined;
        }

        addToast('Cloud outlook could not be loaded.', 'error');
        setCloudOption({
          ...selectedOption,
          status: 'Cloud outlook could not be loaded.',
        });
      });

    return () => {
      active = false;
    };
  }, [addToast, loadCycle, selectedOption, today]);

  return selectedOption.kind === 'cloud-cycle' ? cloudOption ?? selectedOption : selectedOption;
};
