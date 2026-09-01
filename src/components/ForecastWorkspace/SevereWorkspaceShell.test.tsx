import { render, screen, fireEvent } from "@testing-library/react";
import { SevereWorkspaceShell, getDiscussionRedirect } from "./SevereWorkspaceShell";

describe("SevereWorkspaceShell #916", () => {
  test("renders Map, Discussion, Review surfaces", () => {
    render(<SevereWorkspaceShell mapView={{ center: [0, 0], zoom: 4 }} discussionMode="guided" onSave={() => {}} />);
    expect(screen.getByTestId("severe-map")).toBeInTheDocument();
    expect(screen.getByTestId("severe-discussion")).toBeInTheDocument();
    expect(screen.getByTestId("severe-review")).toBeInTheDocument();
  });

  test("discussion modes", () => {
    const { rerender } = render(<SevereWorkspaceShell mapView={{ center: [0, 0], zoom: 4 }} discussionMode="guided" onSave={() => {}} />);
    expect(screen.getByTestId("severe-discussion")).toHaveAttribute("data-mode", "guided");
    rerender(<SevereWorkspaceShell mapView={{ center: [0, 0], zoom: 4 }} discussionMode="diy" onSave={() => {}} />);
    expect(screen.getByTestId("severe-discussion")).toHaveAttribute("data-mode", "diy");
  });

  test("save button calls onSave and redirect helper", () => {
    const onSave = jest.fn();
    render(<SevereWorkspaceShell mapView={{ center: [0, 0], zoom: 4 }} discussionMode="guided" onSave={onSave} />);
    fireEvent.click(screen.getByTestId("severe-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(getDiscussionRedirect("/discussion")).toBe("/forecast/severe");
    expect(getDiscussionRedirect("/forecast/severe")).toBeNull();
  });
});
