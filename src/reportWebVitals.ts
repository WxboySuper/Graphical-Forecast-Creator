import { ReportHandler } from 'web-vitals';

/** Registers performance measurement callbacks for Core Web Vitals reporting. Only runs if a valid handler is provided. */
const reportWebVitals = (onPerfEntry?: ReportHandler) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals')
      .then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(onPerfEntry);
        getFID(onPerfEntry);
        getFCP(onPerfEntry);
        getLCP(onPerfEntry);
        getTTFB(onPerfEntry);
      })
      .catch((err) => {
        // Dynamic import failed; log for diagnostics.
        // eslint-disable-next-line no-console
        console.error('Failed to load web-vitals', err);
      });
  }
};

export default reportWebVitals;
