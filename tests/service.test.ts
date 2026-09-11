import { describe, it, expect } from "vitest";
import { isService } from "../src/mindmap/service";

describe("isService", () => {
  it("is the one kind the plugin reads", () => {
    expect(isService("service")).toBe(true);
  });

  it("does not care how it was capitalised", () => {
    expect(isService("Service")).toBe(true);
    expect(isService("SERVICE")).toBe(true);
    expect(isService("sErViCe")).toBe(true);
  });

  it("is the whole kind or nothing", () => {
    // A charter is free to define any of these; none of them is the reserved
    // word, and a note filed under one keeps its box.
    for (const kind of ["services", "service note", "webservice", "self-service", "svc"]) {
      expect(isService(kind), kind).toBe(false);
    }
  });

  it("an unfiled note is not a service node", () => {
    expect(isService(null)).toBe(false);
  });
});
