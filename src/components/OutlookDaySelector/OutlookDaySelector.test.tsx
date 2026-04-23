/**
 * Unit tests for OutlookDaySelector
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock react-redux
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useSelector: jest.fn((selector) => {
    return {
      cycleDate: '2026-04-22T00:00:00Z',
      currentDay: 1,
      days: {
        1: { data: { tornado: { size: 100 }, wind: { size: 50 } } },
        2: { data: {} },
      },
    };
  }),
  useDispatch: () => mockDispatch,
}));

// Mock store actions
jest.mock('../../store/forecastSlice', () => ({
  selectForecastCycle: jest.fn(),
  setForecastDay: jest.fn(),
  setCycleDate: jest.fn(),
}));

import OutlookDaySelector from './OutlookDaySelector';
import { setForecastDay, setCycleDate } from '../../store/forecastSlice';

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockClear();
});

describe('OutlookDaySelector', () => {
  test('renders day selector container', () => {
    render(<OutlookDaySelector />);
    expect(document.querySelector('.day-selector-container')).toBeTruthy();
  });

  test('renders cycle date label', () => {
    render(<OutlookDaySelector />);
    expect(screen.getByText(/forecast cycle:/i)).toBeTruthy();
  });

  test('renders day tabs 1-8', () => {
    render(<OutlookDaySelector />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`Day ${i}`)).toBeTruthy();
    }
  });

  test('renders day info text', () => {
    render(<OutlookDaySelector />);
    expect(screen.getByText(/tornado, wind, hail, categorical/i)).toBeTruthy();
  });

  test('renders edit button for cycle date', () => {
    render(<OutlookDaySelector />);
    const editBtn = document.querySelector('.cycle-date-edit-btn');
    expect(editBtn).toBeTruthy();
  });

  test('clicking day tab dispatches setForecastDay', () => {
    render(<OutlookDaySelector />);
    const day2Tab = screen.getByText('Day 2');
    fireEvent.click(day2Tab);
    expect(mockDispatch).toHaveBeenCalled();
  });

  test('clicking edit button shows date input', () => {
    render(<OutlookDaySelector />);
    const editBtn = document.querySelector('.cycle-date-edit-btn');
    fireEvent.click(editBtn!);
    // Use querySelector for input type="date" instead of getByRole('textbox')
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });

  test('shows data indicators on days with data', () => {
    render(<OutlookDaySelector />);
    // Day 1 has data indicators since it has tornado (size: 100) and wind (size: 50)
    const day1Tab = screen.getByText('Day 1');
    expect(day1Tab.closest('.day-tab')).toHaveClass('has-data');
  });

  test('day tabs have correct role and aria attributes', () => {
    render(<OutlookDaySelector />);
    const day1Tab = screen.getByText('Day 1');
    const tab = day1Tab.closest('[role="tab"]');
    expect(tab).toBeTruthy();
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});

describe('OutlookDaySelector - Date editing', () => {
  test('save button dispatches setCycleDate', () => {
    render(<OutlookDaySelector />);
    const editBtn = document.querySelector('.cycle-date-edit-btn');
    fireEvent.click(editBtn!);
    const saveBtn = document.querySelector('.cycle-date-btn.save');
    fireEvent.click(saveBtn!);
    expect(mockDispatch).toHaveBeenCalled();
  });

  test('cancel button hides date input', () => {
    render(<OutlookDaySelector />);
    const editBtn = document.querySelector('.cycle-date-edit-btn');
    fireEvent.click(editBtn!);
    const cancelBtn = document.querySelector('.cycle-date-btn.cancel');
    fireEvent.click(cancelBtn!);
    // Date input should be hidden after cancel - use querySelector for input
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeNull();
  });
});