module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/.pnpm/(?!(react-router|react-router-dom|@remix-run\\+router|uuid|@turf\\+.*|kdbush|geokdbush|tinyqueue|concaveman|point-in-polygon-hao|robust-predicates|rbush|quickselect|skmeans|marchingsquares|sweepline-intersections|d3-array|d3-geo|d3-voronoi|topojson-client|earcut|tslib|ol)@)',
    'node_modules/(?!.pnpm|react-router|react-router-dom|@remix-run/router|uuid|@turf|kdbush|geokdbush|tinyqueue|concaveman|point-in-polygon-hao|robust-predicates|rbush|quickselect|skmeans|marchingsquares|sweepline-intersections|d3-array|d3-geo|d3-voronoi|topojson-client|earcut|tslib|ol)',
  ],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/src/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@turf/turf$': '<rootDir>/node_modules/.pnpm/@turf+turf@7.3.4/node_modules/@turf/turf/dist/cjs/index.cjs',
  },
};
