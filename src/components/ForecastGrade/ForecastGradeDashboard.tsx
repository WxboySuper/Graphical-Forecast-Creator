import React, { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { VerificationMapHandle } from '../Map/VerificationMap';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';
import { deserializeForecast } from '../../utils/fileUtils';
import { setVisibility } from '../../store/stormReportsSlice';
import type { RootState } from '../../store';
import type { StormReport } from '../../types/stormReports';
import type { GradeCard } from '../../types/forecastGrade';
import type { ComponentKey, ProductKind } from '../../utils/verificationV2';
import { availablePackageSources } from '../../utils/verificationV2/sources';
import { useForecastGrade } from './useForecastGrade';
import CloudSourcePicker from './CloudSourcePicker';
import ForecastGradeMapPane from './ForecastGradeMapPane';
import ForecastGradeResultsPane from './ForecastGradeResultsPane';
import ShareCard from './ShareCard';
import { useCaptureGradeMap } from './useCaptureGradeMap';
import { METHODOLOGY_DOC_PATH } from './methodology';
import './ForecastGradeDashboard.css';

const ForecastGradeDashboard: React.FC = () => {
  const { addToast } = useAppLayout();
  const dispatch = useDispatch();
  const grade = useForecastGrade(addToast);
  const { loadCycle } = useCloudCycles();

  const [activeComponent, setActiveComponent] = useState<ComponentKey | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const mapRef = useRef<VerificationMapHandle>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const cloudLoadSeqRef = useRef(0);
  const reportsVisible = useSelector((state: RootState) => state.stormReports.visible);

  const availableSources = availablePackageSources(grade.tier);
  const activeProductGrade = grade.result?.products.find((product) => product.product === grade.activeProduct);

  const handleCloudLoad = useCallback(
    async (id: string, label: string) => {
      const loadSeq = ++cloudLoadSeqRef.current;
      const payload = await loadCycle(id);
      if (loadSeq !== cloudLoadSeqRef.current) {
        return;
      }
      if (!payload) {
        addToast('That cloud package could not be loaded.', 'error');
        return;
      }
      try {
        grade.setForecastPackage(deserializeForecast(payload), 'cloud', `${label} (cloud)`);
        addToast('Cloud package loaded. Choose a report date and grade.', 'success');
      } catch {
        addToast('That cloud package could not be parsed.', 'error');
      }
    },
    [addToast, grade, loadCycle]
  );

  const handleSelectProduct = useCallback(
    (product: ProductKind) => {
      grade.setActiveProduct(product);
      setActiveComponent(null);
    },
    [grade]
  );

  const handleSelectReport = useCallback((report: StormReport | null) => {
    setSelectedReportId(report?.id ?? null);
  }, []);

  const handleSelectReportId = useCallback((reportId: string | null) => {
    setSelectedReportId(reportId);
  }, []);

  const handleSelectHistoryCard = useCallback(
    (card: GradeCard) => {
      const snapshot = grade.restoreCard(card);
      if (snapshot) {
        grade.applyGradeSnapshot(snapshot);
        addToast('Restored grade package from history.', 'success');
      }
    },
    [addToast, grade]
  );

  const captureMap = useCaptureGradeMap(mapRef);

  const renderCloudSource = availableSources.includes('cloud')
    ? () => <CloudSourcePicker onLoad={handleCloudLoad} />
    : undefined;

  return (
    <div className="fg-dashboard">
      <div className="fg-topbar">
        <div>
          <h2 className="text-lg font-semibold">Forecast Grade</h2>
          <p className="text-xs text-slate-500">
            Map-first verification · formula gfc-ver-1 ·{' '}
            <a className="text-blue-500 hover:underline" href={METHODOLOGY_DOC_PATH} target="_blank" rel="noreferrer">
              Methodology
            </a>
          </p>
        </div>
      </div>

      <div className="fg-workspace">
        <ForecastGradeMapPane
          forecastLoaded={Boolean(grade.forecast)}
          activeProduct={grade.activeProduct}
          selectedDay={grade.selectedDay}
          availableDays={grade.availableDays}
          reports={grade.reports}
          selectedReportId={selectedReportId}
          activeComponent={activeComponent}
          result={grade.result}
          reportsVisible={reportsVisible}
          onSelectProduct={handleSelectProduct}
          onSelectDay={grade.setSelectedDay}
          onToggleEvidence={() => dispatch(setVisibility(!reportsVisible))}
          onSelectReportId={handleSelectReportId}
          mapPaneRef={mapPaneRef}
          mapRef={mapRef}
        />

        <ForecastGradeResultsPane
          grade={grade}
          availableSources={availableSources}
          renderCloudSource={renderCloudSource}
          activeProductGrade={activeProductGrade}
          activeComponent={activeComponent}
          onSelectComponent={setActiveComponent}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
          onSelectProduct={handleSelectProduct}
          onSelectHistoryCard={handleSelectHistoryCard}
          result={grade.result}
          afterResult={
            grade.result ? <ShareCard pkg={grade.result} captureMap={captureMap} addToast={addToast} /> : null
          }
        />
      </div>
    </div>
  );
};

export default ForecastGradeDashboard;
