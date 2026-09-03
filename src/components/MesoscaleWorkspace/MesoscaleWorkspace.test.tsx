import { render, screen } from "@testing-library/react";
import { MesoscaleWorkspace } from "./MesoscaleWorkspace";
import { completePayload } from "../../mesoscale/fixtures";

describe("MesoscaleWorkspace #919", () => {
  test("renders empty state when no payload", () => {
    render(<MesoscaleWorkspace payload={null} />);
    expect(screen.getByTestId("mesoscale-empty")).toBeInTheDocument();
  });

  test("renders param display without local calc", () => {
    render(<MesoscaleWorkspace payload={completePayload} />);
    expect(screen.getByTestId("param-CAPE")).toHaveTextContent("1250");
    expect(screen.getByTestId("param-STP")).toHaveTextContent("2.3");
  });

  test("shows stale attribution when isStale", () => {
    render(<MesoscaleWorkspace payload={completePayload} isStale />);
    expect(screen.getByTestId("mesoscale-attribution")).toHaveTextContent("stale");
  });

  test("renders forecast area and discussion surfaces", () => {
    render(<MesoscaleWorkspace payload={completePayload} />);
    expect(screen.getByTestId("mesoscale-forecast-area")).toBeInTheDocument();
    expect(screen.getByTestId("mesoscale-discussion")).toBeInTheDocument();
  });
});
