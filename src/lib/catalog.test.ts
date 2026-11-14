import { describe, expect, test } from "vitest";

import { catalog } from "@/lib/catalog";

describe("generative UI catalog", () => {
  test("defines at least 15 components", () => {
    expect(catalog.componentNames.length).toBeGreaterThanOrEqual(15);
  });

  test("names the main components and the submit action in the prompt", () => {
    const prompt = catalog.prompt();

    for (const name of [
      "Page",
      "Grid",
      "Card",
      "Metric",
      "Table",
      "BarChart",
      "LineChart",
      "PieChart",
      "Timeline",
      "Tabs",
      "Form",
      "Input",
      "Select",
      "Checkbox",
      "Button",
    ]) {
      expect(prompt).toContain(name);
    }

    expect(prompt).toContain("submit_request");
  });
});
