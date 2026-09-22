import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import forecastReducer from "../store/forecastSlice";
import themeReducer from "../store/themeSlice";
import CloudLibraryPage from "./CloudLibraryPage";
import { getDefaultForecastWorkspacePath } from "../routing/forecastWorkspaceRoutes";

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
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult());
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: "local" });
    mockNavigate.mockClear();
    sessionStorage.clear();
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

  it("keeps unsupported Load activatable so the blocked message stays reachable", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    const loadCycle = jest.fn();
    mockUseCloudCycles.mockReturnValue(
      cloudCyclesResult({ cycles: [{ id: "custom-1", workspaceId: "custom", label: "Custom save" }], loadCycle })
    );

    renderPage();
    const loadButton = screen.getByRole("button", { name: /load/i });
    expect(loadButton).not.toBeDisabled();
    expect(loadButton).toHaveAttribute("aria-disabled", "true");
    expect(loadButton).toHaveAttribute("aria-describedby", "cloud-cycle-load-hint-custom-1");

    loadButton.focus();
    expect(loadButton).toHaveFocus();

    const hint = screen.getByText("Custom loading is not supported yet. Only Severe saves can be opened.");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveAttribute("id", "cloud-cycle-load-hint-custom-1");

    fireEvent.click(loadButton);
    expect(loadCycle).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Custom saves can't be opened in the editor yet/);
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
