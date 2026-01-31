import './immerSetup';
// skipcq: JS-W1028
import React from 'react';
// skipcq: JS-C1003
import * as ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { store } from './store';
import { setupCycleHistoryListener } from './utils/cycleHistoryPersistence';

// Setup cycle history persistence
setupCycleHistoryListener(store);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
