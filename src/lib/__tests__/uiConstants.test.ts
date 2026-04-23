import {
  NAVBAR_HEIGHT_PX,
  NAVBAR_HEIGHT,
} from '../uiConstants';

describe('uiConstants', () => {
  describe('NAVBAR_HEIGHT_PX', () => {
    it('is a positive integer', () => {
      expect(NAVBAR_HEIGHT_PX).toBeGreaterThan(0);
      expect(Number.isInteger(NAVBAR_HEIGHT_PX)).toBe(true);
      expect(NAVBAR_HEIGHT_PX).toBe(64);
    });
  });

  describe('NAVBAR_HEIGHT', () => {
    it('is a pixel string derived from NAVBAR_HEIGHT_PX', () => {
      expect(NAVBAR_HEIGHT).toBe(`${NAVBAR_HEIGHT_PX}px`);
      expect(NAVBAR_HEIGHT).toBe('64px');
    });
  });
});
