import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import OutlookDaySelector from './OutlookDaySelector';
import forecastReducer from '../../store/forecastSlice';

const buildStore = () => configureStore({
  reducer: { forecast: forecastReducer },
  middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
});

describe('OutlookDaySelector', () => {
  it('renders without crashing', () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <OutlookDaySelector />
      </Provider>
    );
  });
});
