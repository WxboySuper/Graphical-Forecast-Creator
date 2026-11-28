import assert from 'node:assert/strict';
import test from 'node:test';
import { renderUsagePage } from './admin-page.mjs';

test('dashboard labels cycle creation and newly tracked events', () => {
  const page = renderUsagePage('abcdefghijklmnop');
  for (const label of [
    "forecast_created:'New cycle started'",
    "first_shape_drawn:'First shape drawn'",
    "mesoscale_workspace_opened:'Mesoscale workspace opened'",
  ]) assert.ok(page.includes(label));
});
