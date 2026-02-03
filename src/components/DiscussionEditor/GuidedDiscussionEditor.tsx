import React from 'react';
import { GuidedDiscussionData } from '../../types/outlooks';
import './GuidedDiscussionEditor.css';

interface GuidedDiscussionEditorProps {
  content: GuidedDiscussionData;
  onChange: (content: GuidedDiscussionData) => void;
}

const GuidedDiscussionEditor: React.FC<GuidedDiscussionEditorProps> = ({ content, onChange }) => {
  const updateField = (field: keyof GuidedDiscussionData, value: string) => {
    onChange({ ...content, [field]: value });
  };

  const guidedQuestions = [
    {
      field: 'synopsis' as keyof GuidedDiscussionData,
      header: 'SUMMARY',
      question: 'What is the overall severe weather threat for this outlook period? Describe the areas at risk and primary hazards expected.',
      placeholder: 'Summarize the threat in 2-4 sentences. Include geographic scope, confidence level, and primary hazards. Example: "Isolated to scattered severe storms are possible across the region this afternoon. Damaging wind gusts and large hail will be the main threats, with a tornado or two possible in areas of stronger low-level shear."',
      rows: 4
    },
    {
      field: 'meteorologicalSetup' as keyof GuidedDiscussionData,
      header: 'METEOROLOGICAL SETUP',
      question: 'What synoptic and mesoscale features are driving this event? Describe patterns, boundaries, moisture sources, and forcing mechanisms.',
      placeholder: 'Describe the atmospheric setup. Include: upper-level patterns (troughs, jet streaks), surface features (fronts, drylines, outflow boundaries), moisture characteristics, and lift mechanisms. Example: "A shortwave trough aloft will provide mid-level support while a surface boundary serves as a focus for storm development. Gulf moisture will advect northward ahead of the boundary, supporting moderate instability."',
      rows: 5
    },
    {
      field: 'severeWeatherExpectations' as keyof GuidedDiscussionData,
      header: 'SEVERE WEATHER EXPECTATIONS',
      question: 'What severe hazards are expected and why? Discuss instability, shear profiles, storm modes, and specific threat magnitudes.',
      placeholder: 'Detail each severe threat. Consider: CAPE values and buoyancy, shear profiles (0-6 km bulk shear, 0-1 km SRH), expected storm modes (discrete cells, supercells, linear systems), and magnitude of threats (EF-scale potential, hail size, wind speeds). Example: "Moderate instability will support strong updrafts. Modest deep-layer shear favors organized storms but limited low-level shear reduces tornado potential. Primary threats will be hail up to golf ball size and wind gusts to 60 mph."',
      rows: 6
    },
    {
      field: 'timing' as keyof GuidedDiscussionData,
      header: 'TIMING',
      question: 'When will severe weather occur? Describe initiation, peak activity, and evolution throughout the period.',
      placeholder: 'Outline the temporal evolution. Example: "Storm development is expected during the mid to late afternoon as daytime heating maximizes. Activity should peak during the evening hours before weakening overnight as the boundary stabilizes. Lingering storms may continue into the early morning in eastern areas."',
      rows: 4
    },
    {
      field: 'regionalBreakdown' as keyof GuidedDiscussionData,
      header: 'REGIONAL BREAKDOWN',
      question: 'Are there meaningful regional differences? Describe variations in timing, threat levels, or hazard types across your outlook area.',
      placeholder: 'Differentiate sub-regions if needed. Example: "Northern zones will see earlier development with a more conditional threat dependent on boundary positioning. Southern areas have higher confidence for severe weather with better moisture and instability. Western sections may remain too capped for significant development."',
      rows: 5
    },
    {
      field: 'additionalConsiderations' as keyof GuidedDiscussionData,
      header: 'ADDITIONAL CONSIDERATIONS',
      question: 'What uncertainties or conditional factors exist? Mention model disagreements, potential upgrades/downgrades, or alternative scenarios.',
      placeholder: 'Discuss uncertainties and wildcards. Example: "Timing of boundary movement remains uncertain, which could shift the threat corridor. If the cap weakens more than expected, threat could increase. Morning convection may stabilize the atmosphere and reduce afternoon potential. Monitor for possible upgrade to higher risk category if confidence increases."',
      rows: 4
    }
  ];

  return (
    <div className="guided-editor">
      <div className="guided-help">
        <p>Answer each question below. When you save, your responses will be formatted into a professional forecast discussion with section headers.</p>
      </div>
      
      {guidedQuestions.map((item, index) => (
        <div key={item.field} className="guided-question-section">
          <div className="question-header">
            <span className="question-number">{index + 1}</span>
            <h4>{item.header}</h4>
          </div>
          <p className="question-text">{item.question}</p>
          <textarea
            className="guided-textarea"
            value={content[item.field]}
            onChange={(e) => updateField(item.field, e.target.value)}
            placeholder={item.placeholder}
            rows={item.rows}
            spellCheck={true}
          />
        </div>
      ))}
    </div>
  );
};

export default GuidedDiscussionEditor;
