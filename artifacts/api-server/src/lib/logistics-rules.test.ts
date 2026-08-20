import { describe, expect, it } from "vitest";
import { logisticsRulesProblem, normalizeLogisticsRules } from "./settings";

describe("normalizeLogisticsRules", () => {
  it("keeps well-formed rules as they are", () => {
    expect(
      normalizeLogisticsRules([
        { templateId: "logistics-request", daysBefore: 60 },
        { templateId: "logistics-follow-up", daysBefore: 30 },
      ]),
    ).toEqual([
      { templateId: "logistics-request", daysBefore: 60 },
      { templateId: "logistics-follow-up", daysBefore: 30 },
    ]);
  });

  it("drops a second rule that reuses the same template", () => {
    expect(
      normalizeLogisticsRules([
        { templateId: "logistics-request", daysBefore: 60 },
        { templateId: "logistics-request", daysBefore: 30 },
      ]),
    ).toEqual([{ templateId: "logistics-request", daysBefore: 60 }]);
  });

  it("caps the list at two rules", () => {
    expect(
      normalizeLogisticsRules([
        { templateId: "a", daysBefore: 10 },
        { templateId: "b", daysBefore: 20 },
        { templateId: "c", daysBefore: 30 },
      ]),
    ).toHaveLength(2);
  });

  it("drops rules with a missing template or out-of-range days", () => {
    expect(
      normalizeLogisticsRules([
        { templateId: "", daysBefore: 60 },
        { templateId: "ok", daysBefore: 0 },
        { templateId: "ok2", daysBefore: 400 },
        { templateId: "kept", daysBefore: 45 },
        null,
        "junk",
      ]),
    ).toEqual([{ templateId: "kept", daysBefore: 45 }]);
  });

  it("returns an empty list for anything that is not a list", () => {
    expect(normalizeLogisticsRules(undefined)).toEqual([]);
    expect(normalizeLogisticsRules({})).toEqual([]);
  });
});

describe("logisticsRulesProblem", () => {
  it("accepts a follow-up that goes out closer to the workshop than the request", () => {
    expect(
      logisticsRulesProblem([
        { templateId: "logistics-request", daysBefore: 60 },
        { templateId: "logistics-follow-up", daysBefore: 30 },
      ]),
    ).toBeNull();
  });

  it("rejects a follow-up scheduled before the request", () => {
    expect(
      logisticsRulesProblem([
        { templateId: "logistics-request", daysBefore: 30 },
        { templateId: "logistics-follow-up", daysBefore: 60 },
      ]),
    ).toMatch(/closer to the workshop/);
  });

  it("rejects a follow-up on the same day as the request", () => {
    expect(
      logisticsRulesProblem([
        { templateId: "logistics-request", daysBefore: 45 },
        { templateId: "logistics-follow-up", daysBefore: 45 },
      ]),
    ).toMatch(/closer to the workshop/);
  });

  it("accepts a single rule of either kind", () => {
    expect(
      logisticsRulesProblem([{ templateId: "logistics-request", daysBefore: 60 }]),
    ).toBeNull();
    expect(
      logisticsRulesProblem([{ templateId: "logistics-follow-up", daysBefore: 30 }]),
    ).toBeNull();
  });
});
