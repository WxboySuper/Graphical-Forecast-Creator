import {
  getCustomStyleSignature,
  removeDrawInteraction,
} from "./openLayersForecastUtilityHelpers";

describe("openLayersForecastUtilityHelpers", () => {
  test("signature orders style fields with the top-layer flag last", () => {
    const signature = getCustomStyleSignature(
      {
        fillColor: "#112233",
        fillOpacity: 0.5,
        strokeColor: "#445566",
        strokeOpacity: 0.8,
        strokeWidth: 2,
        hatch: "none",
      },
      false,
    );

    expect(signature).toBe("#112233|0.5|#445566|0.8|2|none|false");
    expect(
      getCustomStyleSignature(
        {
          fillColor: "#112233",
          fillOpacity: 0.5,
          strokeColor: "#445566",
          strokeOpacity: 0.8,
          strokeWidth: 2,
          hatch: "none",
        },
        true,
      ),
    ).toBe("#112233|0.5|#445566|0.8|2|none|true");
  });

  test("removeDrawInteraction cancels the pending timeout", () => {
    jest.useFakeTimers();
    try {
      const pendingCallback = jest.fn();
      const timeout = setTimeout(pendingCallback, 250);
      const draw = { downTimeout_: timeout };
      const map = { removeInteraction: jest.fn() };

      removeDrawInteraction(map as never, draw as never);
      jest.advanceTimersByTime(250);

      expect(pendingCallback).not.toHaveBeenCalled();
      expect(draw.downTimeout_).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test("removeDrawInteraction always detaches from the map", () => {
    const draw = {};
    const map = { removeInteraction: jest.fn() };

    removeDrawInteraction(map as never, draw as never);

    expect(map.removeInteraction).toHaveBeenCalledWith(draw);
  });
});
