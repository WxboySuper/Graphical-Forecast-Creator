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
  test("maps sync status to badge metadata with idle/unknown defaults", () => {
    expect(getSyncStatusMeta("synced")).toEqual({ label: "Synced", variant: "success" });
    expect(getSyncStatusMeta("idle")).toEqual({ label: "Ready", variant: "secondary" });
    expect(getSyncStatusMeta("unknown-status" as never)).toEqual({
      label: "Ready",
      variant: "secondary",
    });
  });

  test("labels beta override access separately from plain premium", () => {
    expect(getPlanLabel(true, null, "beta_override")).toBe("Premium Beta Access");
    expect(getPlanLabel(true, null, "stripe")).toBe("Premium");
    expect(getPlanLabel(false, null, "none")).toBe("Free Plan");
  });

  test("falls back to included pricing when premium has no interval", () => {
    expect(getCurrentPlanPrice(false, null, "$3/month", "$30/year")).toBe("$0");
    expect(getCurrentPlanPrice(true, "monthly", "$3/month", "$30/year")).toBe("$3/month");
    expect(getCurrentPlanPrice(true, null, "$3/month", "$30/year")).toBe("Included");
  });

  test("returns null billing copy for standard premium without promo", () => {
    expect(getBillingSupportCopy("stripe", true, false)).toBeNull();
    expect(getBillingSupportCopy("stripe", false, false)).toBe(PRICING_COPY.downgradeSummary);
  });

  test("formats empty, invalid, and valid activity dates", () => {
    expect(formatLastActiveDate(null)).toBe("No activity yet");
    expect(formatLastActiveDate("not-a-date")).toBe("not-a-date");
    expect(formatLastActiveDate("2026-03-30")).toContain("2026");
  });

  test("maps provider ids and pricing variants", () => {
    expect(getProviderLabel("google.com")).toBe("Google");
    expect(getPricingButtonVariant(true)).toBe("outline");
    expect(getPricingButtonVariant(false)).toBe("default");
  });
});
