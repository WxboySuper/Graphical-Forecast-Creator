import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import forecastReducer from "../store/forecastSlice";
import themeReducer from "../store/themeSlice";
import CloudLibraryPage, { buildCloudSessionPayload, isSupportedCloudLoadWorkspace } from "./CloudLibraryPage";
import { getDefaultForecastWorkspacePath, getForecastWorkspacePath } from "../routing/forecastWorkspaceRoutes";
import { serializeForecastWorkspace } from "../utils/forecastWorkspacePersistenceAdapter";
import { getForecastWorkspace } from "../config/forecastWorkspaces";

const mockNavigate = jest.fn();
jest.mock("react-router", () => ({
  ...jest.requireActual("react-router"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../billing/EntitlementProvider", () => ({
  useEntitlement: jest.fn(),
}));
jest.mock("../hooks/useCloudCycles", () => ({
  useCloudCycles: jest.fn(),
}));

const mockUseAuth = jest.requireMock("../auth/AuthProvider").useAuth as jest.Mock;
const mockUseEntitlement = jest.requireMock("../billing/EntitlementProvider").useEntitlement as jest.Mock;
const mockUseCloudCycles = jest.requireMock("../hooks/useCloudCycles").useCloudCycles as jest.Mock;

const makeStore = () =>
  configureStore({
    reducer: { forecast: forecastReducer, theme: themeReducer },
  });

const cloudCyclesResult = (overrides: Record<string, unknown> = {}) => ({
  cycles: [],
  loading: false,
  error: null as string | null,
  loadCycle: jest.fn(),
  deleteCycle: jest.fn(),
  renameCycle: jest.fn(),
  refreshCycles: jest.fn(),
  ...overrides,
});

const renderPage = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <BrowserRouter>
        <CloudLibraryPage />
      </BrowserRouter>
    </Provider>
  );

describe("CloudLibraryPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    mockUseAuth.mockReset();
    mockUseEntitlement.mockReset();
    mockUseCloudCycles.mockReset();
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult());
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: "local" });
    mockNavigate.mockClear();
  });

  it("shows the signed-out gate when no user is present", () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderPage();
    expect(screen.getByText(/Sign in to use your cloud library/i)).toBeTruthy();
  });

  it("renders the signed-in library header for a free user", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    renderPage();
    expect(screen.getByText(/No cloud cycles saved yet/i)).toBeTruthy();
  });

  it("shows an expired-premium notice when entitlement lapsed from Stripe", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: "stripe" });
    renderPage();
    expect(screen.getAllByText(/read-only/i).length).toBeGreaterThan(0);
  });

  it("shows a feedback card when an error is present", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult({ error: "Failed to load cloud cycles" }));
    renderPage();
    expect(screen.getByText(/failed to load cloud cycles/i)).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent(/failed to load cloud cycles/i);
  });

  it("separates saved cycles into workspace tabs", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );

    renderPage();
    expect(screen.getByRole("tab", { name: /All 2/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Severe 1/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toBeInTheDocument();
    expect(screen.getByText("Severe save")).toBeInTheDocument();
    expect(screen.getByText("Custom save")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Custom 1/i }));
    expect(screen.getByText("1 cloud cycle")).toBeInTheDocument();
    expect(screen.queryByText("Severe save")).not.toBeInTheDocument();
    expect(screen.getByText("Custom save")).toBeInTheDocument();
  });

  it("uses workspace-specific empty copy for an empty tab", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "severe-1", workspaceId: "severe", label: "Severe save" }] })
    );

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Custom 0/i }));
    expect(screen.getByText("No Custom cloud cycles saved yet")).toBeInTheDocument();
  });

  it.each([
    ["mesoscale", false, "local", "Mesoscale"],
    ["tropical", true, "stripe", "Tropical"],
    ["winter", false, "stripe", "Winter"],
  ] as const)(
    "does not fetch a cloud cycle owned by hidden workspace %s (premium: %s, source: %s)",
    async (workspaceId, premiumActive, effectiveSource, workspaceLabel) => {
      mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
      mockUseEntitlement.mockReturnValue({ premiumActive, effectiveSource });
      const loadCycle = jest.fn();
      mockUseCloudCycles.mockReturnValue(
        cloudCyclesResult({
          cycles: [{ id: `${workspaceId}-1`, workspaceId, label: `${workspaceId} save` }],
          loadCycle,
        })
      );
      window.history.replaceState({}, "", "/cloud");

      renderPage();
      expect(screen.getByRole("tab", { name: "All 1" })).toHaveAttribute("aria-selected", "true");
      fireEvent.click(screen.getByRole("button", { name: "Load" }));

      expect(await screen.findByText(`${workspaceLabel} cloud loading is not available yet. Your save is still stored.`)).toBeInTheDocument();
      expect(loadCycle).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe("/cloud");
    }
  );

  it("loads an exposed Custom cloud cycle into the matching forecast editor", async () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    const cycle = forecastReducer(undefined, { type: "@@cloud-library/custom-load" }).forecastCycle;
    const payload = serializeForecastWorkspace("custom", cycle, { center: [0, 0], zoom: 4 });
    const loadCycle = jest.fn().mockResolvedValue(payload);
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "custom-1", workspaceId: "custom", label: "Custom save" }], loadCycle })
    );

    renderPage();
    const loadButton = screen.getByRole("button", { name: /load/i });
    expect(loadButton).not.toHaveAttribute("aria-disabled");
    expect(loadButton).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/loading is not supported yet/i)).not.toBeInTheDocument();
    fireEvent.click(loadButton);
    await waitFor(() => expect(loadCycle).toHaveBeenCalledWith("custom-1"));
    expect(mockNavigate).toHaveBeenCalledWith(getForecastWorkspacePath("custom"));
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it("keeps Severe Load fully enabled without a support hint", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "severe-1", workspaceId: "severe", label: "Severe save" }] })
    );

    renderPage();
    const loadButton = screen.getByRole("button", { name: /load/i });
    expect(loadButton).not.toBeDisabled();
    expect(loadButton).not.toHaveAttribute("aria-disabled");
    expect(loadButton).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/loading is not supported yet/i)).not.toBeInTheDocument();
  });

  it("navigates to the canonical Severe route when loading a supported cycle", async () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    const loadCycle = jest.fn().mockResolvedValue({ version: 1 });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "severe-1", workspaceId: "severe", label: "Severe save" }], loadCycle })
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /load/i }));

    await waitFor(() => expect(loadCycle).toHaveBeenCalledWith("severe-1"));
    expect(mockNavigate).toHaveBeenCalledWith(getDefaultForecastWorkspacePath());
  });

  it("returns early without calling loadCycle when the selected cycle no longer resolves", async () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    const loadCycle = jest.fn();
    const cycles = [{ id: "severe-1", workspaceId: "severe", label: "Severe save" }];
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult({ cycles, loadCycle }));

    renderPage();
    const loadButton = screen.getByRole("button", { name: /load/i });
    cycles.splice(0, 1);
    fireEvent.click(loadButton);

    await waitFor(() => expect(loadCycle).not.toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("keeps hidden-workspace Load activatable so the blocked message stays reachable", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    const loadCycle = jest.fn();
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "meso-1", workspaceId: "mesoscale", label: "Meso save" }], loadCycle })
    );

    renderPage();
    const loadButton = screen.getByRole("button", { name: /load/i });
    expect(loadButton).not.toBeDisabled();
    expect(loadButton).toHaveAttribute("aria-disabled", "true");
    expect(loadButton).toHaveAttribute("aria-describedby", "cloud-cycle-load-hint-meso-1");
    expect(screen.getByText("Mesoscale cloud loading is not available yet.")).toBeInTheDocument();

    fireEvent.click(loadButton);
    expect(loadCycle).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mesoscale cloud loading is not available yet. Your save is still stored."
    );
  });

  it("shows resolved workspace ownership in All without inventing gated tabs", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "legacy-1", label: "Legacy save" },
          { id: "odd-1", workspaceId: "not-a-workspace", label: "Odd save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
          { id: "meso-1", workspaceId: "mesoscale", label: "Meso save" },
          { id: "trop-1", workspaceId: "tropical", label: "Trop save" },
        ],
      })
    );

    renderPage();
    expect(screen.getByRole("tab", { name: /All 6/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Severe 3/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /mesoscale/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /tropical/i })).not.toBeInTheDocument();

    for (const label of ["Severe save", "Legacy save", "Odd save", "Custom save", "Meso save", "Trop save"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Tab label spans plus one ownership badge per matching row.
    expect(screen.getAllByText("Severe")).toHaveLength(4);
    expect(screen.getAllByText("Custom")).toHaveLength(2);
    expect(screen.getAllByText("Mesoscale")).toHaveLength(1);
    expect(screen.getAllByText("Tropical")).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: /Severe 3/i }));
    expect(screen.getByText("Legacy save")).toBeInTheDocument();
    expect(screen.getByText("Odd save")).toBeInTheDocument();
    expect(screen.queryByText("Meso save")).not.toBeInTheDocument();
    expect(screen.getAllByText("Severe")).toHaveLength(1);
  });

  it("links tabs to their panel for assistive technology", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );

    renderPage();
    const tablist = screen.getByRole("tablist", { name: /cloud library workspaces/i });
    expect(tablist).toBeInTheDocument();

    const allTab = screen.getByRole("tab", { name: /All 2/i });
    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(allTab).toHaveAttribute("aria-controls", "cloud-library-panel");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "cloud-library-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "cloud-library-tab-all");

    fireEvent.click(screen.getByRole("tab", { name: /Custom 1/i }));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "cloud-library-tab-custom");
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("aria-selected", "false");
  });

  it("moves between workspace tabs with arrow keys and moves focus", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );

    renderPage();
    const allTab = screen.getByRole("tab", { name: /All 2/i });
    allTab.focus();
    fireEvent.keyDown(allTab, { key: "ArrowRight" });

    const severeTab = screen.getByRole("tab", { name: /Severe 1/i });
    expect(severeTab).toHaveAttribute("aria-selected", "true");
    expect(severeTab).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "cloud-library-tab-severe");
    expect(screen.getByText("Severe save")).toBeInTheDocument();
    expect(screen.queryByText("Custom save")).not.toBeInTheDocument();

    fireEvent.keyDown(severeTab, { key: "ArrowRight" });
    const customTab = screen.getByRole("tab", { name: /Custom 1/i });
    expect(customTab).toHaveAttribute("aria-selected", "true");
    expect(customTab).toHaveFocus();

    fireEvent.keyDown(customTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: /All 2/i }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: /Custom 1/i }), { key: "Home" });
    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: /All 2/i }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("aria-selected", "true");
  });

  it("uses roving tabindex so only the active tab is in the tab order", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    renderPage();
    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /Severe 1/i })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("tabindex", "-1");

    fireEvent.click(screen.getByRole("tab", { name: /Custom 1/i }));
    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("tabindex", "-1");
  });

  it("ignores non-navigation keys without moving selection or focus", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );

    renderPage();
    const allTab = screen.getByRole("tab", { name: /All 2/i });
    allTab.focus();
    fireEvent.keyDown(allTab, { key: "Enter" });

    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(allTab).toHaveFocus();
    expect(screen.getByRole("tab", { name: /Severe 1/i })).toHaveAttribute("aria-selected", "false");
  });

  it("removes the extra panel tab stop when panel content is interactive", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [{ id: "severe-1", workspaceId: "severe", label: "Severe save" }],
      })
    );

    renderPage();
    expect(screen.getByRole("tabpanel")).not.toHaveAttribute("tabindex");
  });

  it("keeps the panel focusable while loading without interactive content", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult({ cycles: [], loading: true }));

    renderPage();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("tabindex", "0");
  });

  it("does not double-wrap an already-enveloped cloud handoff payload", () => {
    const cycle = forecastReducer(undefined, { type: "@@cloud-library/test-init" }).forecastCycle;
    const envelope = serializeForecastWorkspace("severe", cycle, { center: [0, 0], zoom: 4 });
    expect(buildCloudSessionPayload("severe", envelope)).toBe(envelope);
    const customEnvelope = serializeForecastWorkspace("custom", cycle, { center: [0, 0], zoom: 4 });
    expect(() => buildCloudSessionPayload("severe", customEnvelope)).toThrow(/different forecast workspace/);
    const wrapped = buildCloudSessionPayload('severe', { legacy: true }) as { workspaceId?: string };
    expect(wrapped.workspaceId).toBe('severe');
  });

  it("supports cloud loads only for workspaces with a registered exposed editor route", () => {
    expect(isSupportedCloudLoadWorkspace("severe", getForecastWorkspace("severe"))).toBe(true);
    expect(isSupportedCloudLoadWorkspace("custom", getForecastWorkspace("custom"))).toBe(true);
    expect(isSupportedCloudLoadWorkspace("mesoscale", getForecastWorkspace("mesoscale"))).toBe(false);
    expect(isSupportedCloudLoadWorkspace("tropical", getForecastWorkspace("tropical"))).toBe(false);
    expect(isSupportedCloudLoadWorkspace("winter", getForecastWorkspace("winter"))).toBe(false);
    expect(isSupportedCloudLoadWorkspace("severe", undefined)).toBe(false);
    expect(isSupportedCloudLoadWorkspace("severe", getForecastWorkspace("custom"))).toBe(false);
  });

  it("restores a bookmarked workspace and preserves unrelated query parameters", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    window.history.replaceState({}, "", "/cloud-library?workspace=custom&source=bookmark");

    renderPage();

    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Severe save")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /All 2/i }));
    expect(window.location.search).toBe("?source=bookmark");
  });

  it("normalizes a malformed workspace param to All without losing unrelated params", async () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    window.history.replaceState({}, "", "/cloud-library?workspace=bogus&source=bookmark");
    const entriesBefore = window.history.length;

    renderPage();

    expect(screen.getByRole("tab", { name: /All 2/i })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(window.location.search).toBe("?source=bookmark"));
    expect(window.history.length).toBe(entriesBefore);
    expect(screen.getByText("Severe save")).toBeInTheDocument();
    expect(screen.getByText("Custom save")).toBeInTheDocument();
  });

  it("pushes history for explicit tab clicks so Back returns to the prior tab", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    window.history.replaceState({}, "", "/cloud-library");
    const entriesBefore = window.history.length;

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Custom 1/i }));

    expect(window.location.search).toBe("?workspace=custom");
    expect(window.history.length).toBe(entriesBefore + 1);
  });

  it("replaces history for keyboard walks so Arrow/Home/End do not pollute Back", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    window.history.replaceState({}, "", "/cloud-library");
    const entriesBefore = window.history.length;

    renderPage();
    const allTab = screen.getByRole("tab", { name: /All 2/i });
    allTab.focus();
    fireEvent.keyDown(allTab, { key: "ArrowRight" });

    expect(window.location.search).toBe("?workspace=severe");
    expect(window.history.length).toBe(entriesBefore);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Severe 1/i }), { key: "ArrowRight" });
    expect(window.location.search).toBe("?workspace=custom");
    expect(window.history.length).toBe(entriesBefore);

    fireEvent.keyDown(screen.getByRole("tab", { name: /Custom 1/i }), { key: "Home" });
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(entriesBefore);
  });

  it("does not double-wrap an already-enveloped cloud handoff payload", () => {
    const cycle = forecastReducer(undefined, { type: "@@cloud-library/test-init" }).forecastCycle;
    const envelope = serializeForecastWorkspace("severe", cycle, { center: [0, 0], zoom: 4 });
    expect(buildCloudSessionPayload("severe", envelope)).toBe(envelope);
    const wrapped = buildCloudSessionPayload('severe', { legacy: true }) as { workspaceId?: string };
    expect(wrapped.workspaceId).toBe('severe');
  });

  it("restores a bookmarked workspace and preserves unrelated query parameters", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({
        cycles: [
          { id: "severe-1", workspaceId: "severe", label: "Severe save" },
          { id: "custom-1", workspaceId: "custom", label: "Custom save" },
        ],
      })
    );
    window.history.replaceState({}, "", "/cloud-library?workspace=custom&source=bookmark");

    renderPage();

    expect(screen.getByRole("tab", { name: /Custom 1/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Severe save")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /All 2/i }));
    expect(window.location.search).toBe("?source=bookmark");
  });
});
