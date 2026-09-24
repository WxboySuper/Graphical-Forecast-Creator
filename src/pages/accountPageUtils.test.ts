import { PRICING_COPY } from "../billing/pricingCopy";
import {
  formatLastActiveDate,
  getBillingSupportCopy,
  getCurrentPlanPrice,
  getPlanLabel,
  getPricingButtonVariant,
  getProviderLabel,
  getSyncStatusMeta,
} from "./accountPageUtils";

describe("accountPageUtils", () => {
  test("maps every sync status variant with an unknown fallback", () => {
    expect(getSyncStatusMeta("synced")).toEqual({ label: "Synced", variant: "success" });
    expect(getSyncStatusMeta("syncing")).toEqual({ label: "Syncing", variant: "secondary" });
    expect(getSyncStatusMeta("error")).toEqual({ label: "Needs Attention", variant: "warning" });
    expect(getSyncStatusMeta("disabled")).toEqual({ label: "Local Only", variant: "outline" });
    expect(getSyncStatusMeta("idle")).toEqual({ label: "Ready", variant: "secondary" });
    expect(getSyncStatusMeta("unknown-status" as never)).toEqual({
      label: "Ready",
      variant: "secondary",
    });
  });

  test("labels free, interval, beta override, and plain premium plans", () => {
    expect(getPlanLabel(false, null, "none")).toBe("Free Plan");
    expect(getPlanLabel(true, "annual", "stripe")).toBe("Premium Annual");
    expect(getPlanLabel(true, "monthly", "stripe")).toBe("Premium Monthly");
    expect(getPlanLabel(true, null, "beta_override")).toBe("Premium Beta Access");
    expect(getPlanLabel(true, null, "stripe")).toBe("Premium");
  });

  test("returns interval prices with free and included fallbacks", () => {
    expect(getCurrentPlanPrice(false, null, "$3/month", "$30/year")).toBe("$0");
    expect(getCurrentPlanPrice(true, "annual", "$3/month", "$30/year")).toBe("$30/year");
    expect(getCurrentPlanPrice(true, "monthly", "$3/month", "$30/year")).toBe("$3/month");
    expect(getCurrentPlanPrice(true, null, "$3/month", "$30/year")).toBe("Included");
  });

  test("covers beta override, downgrade, promo, and null billing copy", () => {
    expect(getBillingSupportCopy("beta_override", true, false)).toContain("beta override path");
    expect(getBillingSupportCopy("stripe", false, false)).toBe(PRICING_COPY.downgradeSummary);
    expect(getBillingSupportCopy("stripe", true, true)).toContain("Annual intro pricing");
    expect(getBillingSupportCopy("stripe", true, false)).toBeNull();
  });

  test("returns fallbacks for empty and invalid activity dates", () => {
    expect(formatLastActiveDate(null)).toBe("No activity yet");
    expect(formatLastActiveDate("")).toBe("No activity yet");
    expect(formatLastActiveDate("not-a-date")).toBe("not-a-date");
  });

  test("formats date-only keys as local midnight with browser locale", () => {
    const spy = jest
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockImplementation(function (this: Date) {
        expect(this.getFullYear()).toBe(2026);
        expect(this.getMonth()).toBe(2);
        expect(this.getDate()).toBe(30);
        expect(this.getHours()).toBe(0);
        expect(this.getMinutes()).toBe(0);
        return "Mar 30, 2026";
      });
    try {
      expect(formatLastActiveDate("2026-03-30")).toBe("Mar 30, 2026");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } finally {
      spy.mockRestore();
    }
  });

  test("does not invoke locale formatter for invalid dates", () => {
    const spy = jest.spyOn(Date.prototype, "toLocaleDateString");
    try {
      expect(formatLastActiveDate("not-a-date")).toBe("not-a-date");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("maps provider ids and pricing variants", () => {
    expect(getProviderLabel("google.com")).toBe("Google");
    expect(getProviderLabel("password")).toBe("Email / Password");
    expect(getProviderLabel("github.com")).toBe("github.com");
    expect(getPricingButtonVariant(true)).toBe("outline");
    expect(getPricingButtonVariant(false)).toBe("default");
  });
});
