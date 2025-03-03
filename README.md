# Graphical Forecast Creator

Graphical Forecast Creator is a web application that allows users to create graphical severe weather forecasts on a map. The application uses React, Redux Toolkit, and Leaflet for map rendering and drawing tools.

## Features

- Draw and edit polygons and rectangles on the map to represent different weather outlooks.
- Support for multiple outlook types: Tornado, Wind, Hail, and Categorical.
- Ability to mark significant threats with a hatch pattern.
- Save and load forecast data from local storage.
- Auto-generate categorical outlooks based on probabilistic outlooks.
- Responsive design for use on various devices.

## Getting Started

### Prerequisites

- Node.js (version 14.x or later)
- npm (version 6.x or later)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/your-username/graphical-forecast-creator.git
   cd graphical-forecast-creator
   ```

2. Install the dependencies:
   ```sh
   npm install
   ```

### Available Scripts

In the project directory, you can run:

#### `npm start`

Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

#### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

#### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

#### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

## Project Structure

```
graphical-forecast-creator/
├── public/
├── src/
│   ├── components/
│   │   ├── Documentation/
│   │   ├── DrawingTools/
│   │   ├── Map/
│   │   ├── OutlookPanel/
│   │   ├── Toast/
│   ├── data/
│   ├── hooks/
│   ├── store/
│   ├── types/
│   ├── utils/
│   ├── App.css
│   ├── App.test.tsx
│   ├── App.tsx
│   ├── immerSetup.ts
│   ├── index.css
│   ├── index.tsx
│   ├── logo.svg
│   ├── react-app-env.d.ts
│   ├── reportWebVitals.ts
│   ├── setupTests.ts
├── package.json
├── README.md
├── tsconfig.json
```

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
