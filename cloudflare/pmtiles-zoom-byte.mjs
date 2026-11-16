export const assertZoomByte = (zoom, label) => {
  if (!Number.isInteger(zoom)) throw new TypeError(`${label} must be an integer`);
  if (zoom < 0) throw new RangeError(`${label} must be a byte value`);
  if (zoom > 255) throw new RangeError(`${label} must be a byte value`);
};
