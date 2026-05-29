import { describe, expect, it } from "vitest";
import { useAppStore } from "./app-store";

describe("app store run snapshots", () => {
  it("returns a stable default snapshot for an unknown run", () => {
    const first = useAppStore.getState().getRun("missing-run");
    const second = useAppStore.getState().getRun("missing-run");

    expect(second).toBe(first);
  });
});
