// skipcq: JS-W1028
import React from 'react';

export const UsageSection: React.FC = () => (
  <div className="doc-section">
    <h3>How to Use the Graphical Forecast Creator</h3>
    <ol>
      <li>
        <span className="item-title">Select an Outlook Type:</span> Choose from Tornado, Wind, Hail, or Categorical using the buttons in the Outlook Configuration panel.
      </li>
      <li>
        <span className="item-title">Select a Probability/Risk Level:</span> Click on the desired probability (for probabilistic outlooks) or risk level (for categorical outlook).
      </li>
      <li>
        <span className="item-title">Enable Significant Threat (if applicable):</span> For probabilities that support it, toggle the &quot;Significant Threat&quot; switch to add a hatched pattern.
      </li>
      <li>
        <span className="item-title">Draw on the Map:</span> Use the polygon or rectangle tools in the upper right corner of the map to draw your forecast area.
      </li>
      <li>
        <span className="item-title">Delete Areas:</span> Click on any drawn area to delete it if needed.
      </li>
      <li>
        <span className="item-title">Save Your Work:</span> Click the &quot;Save Forecast&quot; button to save your work to your browser&apos;s local storage.
      </li>
      <li>
        <span className="item-title">Load Previous Work:</span> Click the &quot;Load Forecast&quot; button to retrieve your previously saved forecast.
      </li>
    </ol>

    <h4>Tips</h4>
    <ul>
      <li>Draw the highest risk areas first, then work outward to lower risks</li>
      <li>The map will warn you if you try to create intersecting shapes</li>
      <li>Save your work frequently to avoid losing your forecast</li>
    </ul>

    <h4>Keyboard Shortcuts</h4>
    <ul>
      <li><kbd>T</kbd> - Switch to Tornado outlook</li>
      <li><kbd>W</kbd> - Switch to Wind outlook</li>
      <li><kbd>L</kbd> - Switch to Hail outlook</li>
      <li><kbd>C</kbd> - Switch to Categorical outlook</li>
      <li><kbd>G</kbd> - Add General Thunderstorm risk (only in Categorical mode)</li>
      <li><kbd>S</kbd> - Toggle significant threat (when applicable)</li>
      <li><kbd>↑</kbd> or <kbd>→</kbd> - Increase risk level/probability</li>
      <li><kbd>↓</kbd> or <kbd>←</kbd> - Decrease risk level/probability</li>
      <li><kbd>H</kbd> - Toggle this documentation</li>
      <li><kbd>Ctrl/Cmd + S</kbd> - Save forecast</li>
      <li><kbd>Esc</kbd> - Cancel current drawing</li>
      <li><kbd>Delete</kbd> - Delete selected area</li>
    </ul>
  </div>
);

export const OverviewSection: React.FC = () => (
  <div className="doc-section">
    <h3>Graphical Forecast Creator Overview</h3>
    <p>
      The Graphical Forecast Creator is a tool designed to create Storm Prediction Center (SPC) style
      severe weather outlook graphics. It allows meteorologists and weather enthusiasts to draw forecast
      areas on a map of the continental United States (CONUS) and apply appropriate colors and patterns
      based on the SPC&apos;s outlook system.
    </p>
    <p>
      This application supports the creation of three probabilistic outlooks (Tornado, Wind, and Hail)
      that feed into a categorical outlook, just like the official SPC products.
    </p>
    <div>
      <p><strong>Key Features:</strong></p>
      <ul>
        <li>Draw forecast areas using polygon and rectangle tools</li>
        <li>Select from the full range of SPC probability levels</li>
        <li>Mark areas as significant risk using the hatched pattern overlay</li>
        <li>Save and load your forecasts</li>
        <li>Export your forecasts as images (coming soon)</li>
      </ul>
    </div>
  </div>
);

export const OutlooksSection: React.FC = () => (
  <div className="doc-section">
    <h3>Outlook Types and Color Coding</h3>

    <h4>Tornado Outlook</h4>
    <p>The Tornado outlook represents the probability of a tornado within 25 miles of a point.</p>
    <div className="color-examples">
      <div className="color-item" style={{backgroundColor: '#008b02'}}><span>2%</span></div>
      <div className="color-item" style={{backgroundColor: '#89472a'}}><span>5%</span></div>
      <div className="color-item" style={{backgroundColor: '#fdc900'}}><span>10%</span></div>
      <div className="color-item" style={{backgroundColor: '#fe0000'}}><span>15%</span></div>
      <div className="color-item" style={{backgroundColor: '#fe00ff'}}><span>30%</span></div>
      <div className="color-item" style={{backgroundColor: '#952ae7'}}><span>45%</span></div>
      <div className="color-item" style={{backgroundColor: '#114d8c'}}><span>60%</span></div>
    </div>
    <p>Probabilities of 10% and higher have significant variants (marked with #) that are displayed with a black hatched pattern.</p>

    <h4>Wind and Hail Outlooks</h4>
    <p>These outlooks represent the probability of damaging winds or large hail within 25 miles of a point.</p>
    <div className="color-examples">
      <div className="color-item" style={{backgroundColor: '#894826'}}><span>5%</span></div>
      <div className="color-item" style={{backgroundColor: '#ffc703'}}><span>15%</span></div>
      <div className="color-item" style={{backgroundColor: '#fd0100'}}><span>30%</span></div>
      <div className="color-item" style={{backgroundColor: '#fe00fe'}}><span>45%</span></div>
      <div className="color-item" style={{backgroundColor: '#912bee'}}><span>60%</span></div>
    </div>
    <p>Probabilities of 15% and higher have significant variants (marked with #) that are displayed with a black hatched pattern.</p>

    <h4>Categorical Outlook</h4>
    <p>This outlook combines the three probabilistic outlooks into a single risk category.</p>
    <div className="color-examples">
      <div className="color-item" style={{backgroundColor: '#bfe7bc', color: '#000'}}><span>TSTM (0/5)</span></div>
      <div className="color-item" style={{backgroundColor: '#7dc580', color: '#000'}}><span>MRGL (1/5)</span></div>
      <div className="color-item" style={{backgroundColor: '#f3f67d', color: '#000'}}><span>SLGT (2/5)</span></div>
      <div className="color-item" style={{backgroundColor: '#e5c27f', color: '#000'}}><span>ENH (3/5)</span></div>
      <div className="color-item" style={{backgroundColor: '#e67f7e'}}><span>MDT (4/5)</span></div>
      <div className="color-item" style={{backgroundColor: '#fe7ffe'}}><span>HIGH (5/5)</span></div>
    </div>
  </div>
);

export const CategoricalSection: React.FC = () => (
  <div className="doc-section">
    <h3>Probabilistic to Categorical Conversion</h3>
    <p>
      The categorical outlook is derived from the three probabilistic outlooks (Tornado, Wind, and Hail).
      The conversion follows specific rules based on the Storm Prediction Center&apos;s methodology.
    </p>

    <h4>Tornado to Categorical Conversion:</h4>
    <ul className="conversion-list">
      <li><strong>2%</strong> → Marginal (1/5)</li>
      <li><strong>5%</strong> → Slight (2/5)</li>
      <li><strong>10%</strong> → Enhanced (3/5)</li>
      <li><strong>10#</strong> → Enhanced (3/5)</li>
      <li><strong>15%</strong> → Enhanced (3/5)</li>
      <li><strong>15#</strong> → Moderate (4/5)</li>
      <li><strong>30%</strong> → Moderate (4/5)</li>
      <li><strong>30#</strong> → High (5/5)</li>
      <li><strong>45%+</strong> → High (5/5)</li>
    </ul>

    <h4>Wind to Categorical Conversion:</h4>
    <ul className="conversion-list">
      <li><strong>5%</strong> → Marginal (1/5)</li>
      <li><strong>15%</strong> → Slight (2/5)</li>
      <li><strong>15#</strong> → Slight (2/5)</li>
      <li><strong>30%</strong> → Enhanced (3/5)</li>
      <li><strong>30#</strong> → Enhanced (3/5)</li>
      <li><strong>45%</strong> → Enhanced (3/5)</li>
      <li><strong>45#</strong> → Moderate (4/5)</li>
      <li><strong>60%</strong> → Moderate (4/5)</li>
      <li><strong>60#</strong> → High (5/5)</li>
    </ul>

    <h4>Hail to Categorical Conversion:</h4>
    <ul className="conversion-list">
      <li><strong>5%</strong> → Marginal (1/5)</li>
      <li><strong>15%</strong> → Slight (2/5)</li>
      <li><strong>15#</strong> → Slight (2/5)</li>
      <li><strong>30%</strong> → Enhanced (3/5)</li>
      <li><strong>30#</strong> → Enhanced (3/5)</li>
      <li><strong>45%</strong> → Enhanced (3/5)</li>
      <li><strong>45#</strong> → Moderate (4/5)</li>
      <li><strong>60%</strong> → Moderate (4/5)</li>
      <li><strong>60#</strong> → Moderate (4/5)</li>
    </ul>

    <h4>Combined Outlooks:</h4>
    <p>
      When multiple probabilistic outlooks are present for a given area, the highest categorical risk level
      from any individual outlook determines the overall categorical risk for that area.
    </p>
    <div>
      <p><strong>Examples:</strong></p>
      <ul>
        <li>Tornado 2% + Wind 5% → Marginal (1/5)</li>
        <li>Tornado 5% + Wind 15% → Slight (2/5)</li>
        <li>Tornado 10% + Hail 15% → Enhanced (3/5)</li>
        <li>Wind 30% + Hail 30% → Enhanced (3/5)</li>
        <li>Tornado 15# + Wind 45% → Moderate (4/5)</li>
        <li>Wind 60# + Hail 45# → High (5/5)</li>
        <li>Tornado 30# + Wind 30% + Hail 15% → High (5/5)</li>
      </ul>
    </div>
  </div>
);

export default {} as Record<string, never>;
