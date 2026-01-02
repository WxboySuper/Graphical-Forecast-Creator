// skipcq: JS-W1028
import React, { useState, useCallback } from 'react';
import './Documentation.css';
import { UsageSection, OverviewSection, OutlooksSection, CategoricalSection } from './DocumentationContent';
const Documentation: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const handleOverview = useCallback(() => setActiveTab('overview'), [setActiveTab]);
  const handleUsage = useCallback(() => setActiveTab('usage'), [setActiveTab]);
  const handleOutlooks = useCallback(() => setActiveTab('outlooks'), [setActiveTab]);
  const handleCategorical = useCallback(() => setActiveTab('categorical'), [setActiveTab]);

  return (
    <div className="documentation">
      <h2>Documentation</h2>
      
      <div className="doc-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''} 
          onClick={handleOverview}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'usage' ? 'active' : ''} 
          onClick={handleUsage}
        >
          How to Use
        </button>
        <button 
          className={activeTab === 'outlooks' ? 'active' : ''} 
          onClick={handleOutlooks}
        >
          Outlook Types
        </button>
        <button 
          className={activeTab === 'categorical' ? 'active' : ''} 
          onClick={handleCategorical}
        >
          Categorical Conversion
        </button>
      </div>
      
      <div className="doc-content">
        {activeTab === 'overview' && <OverviewSection />}
        
        {activeTab === 'usage' && <UsageSection />}
        
        {activeTab === 'outlooks' && <OutlooksSection />}
        
        {activeTab === 'categorical' && <CategoricalSection />}
      </div>
    </div>
  );
};

export default Documentation;