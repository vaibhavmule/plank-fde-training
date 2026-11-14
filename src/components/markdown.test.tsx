import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Markdown } from "@/components/markdown";

describe("Markdown", () => {
  test("renders GFM tables and highlighted code with a copy button", () => {
    const html = renderToStaticMarkup(
      <Markdown>
        {[
          "## Result",
          "",
          "| Item | Value |",
          "| --- | --- |",
          "| Total | 7006652 |",
          "",
          "```js",
          "const total = 7006652;",
          "```",
        ].join("\n")}
      </Markdown>,
    );

    expect(html).toContain("<h2");
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("hljs");
    expect(html).toContain("language-js");
    expect(html).toContain('aria-label="Copy code"');
  });

  test("escapes raw HTML in model output", () => {
    const html = renderToStaticMarkup(
      <Markdown>{"<script>alert('x')</script>"}</Markdown>,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
