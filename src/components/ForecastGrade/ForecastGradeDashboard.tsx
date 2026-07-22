import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fromLonLat } from 'ol/proj';
import VerificationMap, { type VerificationMapHandle } from '../Map/VerificationMap';
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
import ForecastGradeMapControls from './ForecastGradeMapControls';
import ForecastGradeResultsPane from './ForecastGradeResultsPane';
import { formatGrade, letterColorClass } from './gradeFormat';
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

  useEffect(() => {
    if (!selectedReportId) {
      return;
    }
    const report = grade.reports.find((entry) => entry.id === selectedReportId);
    const map = mapRef.current?.getMap();
    if (!report || !map) {
      return;
    }
    map.getView().animate({
      center: fromLonLat([report.longitude, report.latitude]),
      duration: 250,
    });
  }, [grade.reports, selectedReportId]);

  const handleSelectHistoryCard = useCallback(
    (card: GradeCard) => {
      const snapshot = grade.restoreCard(card);
      if (snapshot) {
        addToast('Full package restore is available for this grade card.', 'info');
      }
    },
    [addToast, grade]
  );

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
        <div className="fg-map-pane" ref={mapPaneRef} data-emphasis-component={activeComponent ?? undefined}>
          {grade.forecast ? (
            <>
              <VerificationMap
                ref={mapRef}
                activeOutlookType={grade.activeProduct as 'categorical' | 'tornado' | 'wind' | 'hail'}
                selectedDay={grade.selectedDay}
                highlightedReportId={selectedReportId}
                emphasisComponent={activeComponent}
              />
              <ForecastGradeMapControls
                activeProduct={grade.activeProduct}
                onSelectProduct={handleSelectProduct}
                availableDays={grade.availableDays}
                selectedDay={grade.selectedDay}
                onSelectDay={grade.setSelectedDay}
                reportsVisible={reportsVisible}
                onToggleEvidence={() => dispatch(setVisibility(!reportsVisible))}
              />
              {grade.result && (
                <div className="fg-grade-overlay">
                  <span className="text-2xl font-bold tabular-nums">{formatGrade(grade.result.grade)}</span>
                  <span className={`text-xl font-bold ${letterColorClass(grade.result.letter)}`}>
                    {grade.result.letter ?? '—'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              The map becomes the evidence surface once you load a package and grade a date.
            </div>
          )}
        </div>

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
        />
      </div>
    </div>
  );
};

export default ForecastGradeDashboard;
