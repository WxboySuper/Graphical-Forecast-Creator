import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import * as L from 'leaflet';
import { StormReport } from '../../types/stormReports';

// Custom icon definitions for each report type
const createReportIcon = (type: 'tornado' | 'wind' | 'hail'): L.DivIcon => {
  const iconConfig = {
    tornado: {
      html: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L9 9L2 12L9 15L12 22L15 15L22 12L15 9L12 2Z" 
                fill="#FF0000" stroke="#000" stroke-width="1"/>
        </svg>
      `,
      className: 'tornado-marker'
    },
    wind: {
      html: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="8" width="8" height="8" 
                fill="#0000FF" stroke="#000" stroke-width="1"/>
        </svg>
      `,
      className: 'wind-marker'
    },
    hail: {
      html: `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <polygon points="12,2 4,12 12,22 20,12" 
                   fill="#00FF00" stroke="#000" stroke-width="1"/>
        </svg>
      `,
      className: 'hail-marker'
    }
  };

  const config = iconConfig[type];
  
  return L.divIcon({
    html: config.html,
    className: config.className,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

// Icon cache to avoid recreating icons
const icons = {
  tornado: createReportIcon('tornado'),
  wind: createReportIcon('wind'),
  hail: createReportIcon('hail')
};

interface StormReportMarkerProps {
  report: StormReport;
}

const StormReportMarker: React.FC<StormReportMarkerProps> = ({ report }) => {
  const icon = icons[report.type];
  
  return (
    <Marker 
      position={[report.latitude, report.longitude]} 
      icon={icon}
    >
      <Popup>
        <div className="storm-report-popup">
          <h4>{report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report</h4>
          {report.magnitude && <p><strong>Magnitude:</strong> {report.magnitude}</p>}
          {report.time && <p><strong>Time:</strong> {report.time}</p>}
          {report.location && <p><strong>Location:</strong> {report.location}</p>}
          {report.state && <p><strong>State:</strong> {report.state}</p>}
          {report.comments && (
            <details>
              <summary>Details</summary>
              <p>{report.comments}</p>
            </details>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

const StormReportsLayer: React.FC = () => {
  const { reports, visible, filterByType } = useSelector((state: RootState) => state.stormReports);
  
  if (!visible || reports.length === 0) {
    return null;
  }
  
  // Filter reports based on type filters
  const filteredReports = reports.filter(report => filterByType[report.type]);
  
  return (
    <>
      {filteredReports.map(report => (
        <StormReportMarker key={report.id} report={report} />
      ))}
    </>
  );
};

export default StormReportsLayer;
