import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const tone = z.enum(["neutral", "info", "success", "warning", "danger"]);
const chartTone = z.enum(["default", "info", "success", "warning"]);
const series = z.array(z.object({ label: z.string(), value: z.number() }));

export const catalog = defineCatalog(schema, {
  components: {
    Page: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description:
        "The page shell. Use it once, as the root, with a title, an optional description and the page content as children.",
    },
    Stack: {
      props: z.object({
        direction: z.enum(["column", "row"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description:
        "Stacks children vertically or horizontally. Use it to group related content with consistent spacing.",
    },
    Grid: {
      props: z.object({
        columns: z.number().int().min(2).max(4).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description:
        "A responsive grid for cards and metrics. Columns is 2, 3 or 4.",
    },
    Card: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description:
        "A bordered container with a title and optional description. Use it for one chart, table or group of fields.",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["1", "2", "3"]).nullable(),
      }),
      description: "A section heading. Level 1 is the page title.",
    },
    Text: {
      props: z.object({
        text: z.string(),
        muted: z.boolean().nullable(),
      }),
      description:
        "A short paragraph. Set muted for supporting copy such as a caption.",
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
        tone: chartTone.nullable(),
      }),
      description:
        "A single key figure, such as total requests or open requests, with a label and optional detail.",
    },
    Progress: {
      props: z.object({
        label: z.string(),
        value: z.number().min(0).max(100),
        tone: chartTone.nullable(),
      }),
      description:
        "A labelled progress bar. Value is a percentage from 0 to 100.",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: tone.nullable(),
      }),
      description:
        "A compact status label. Use the tone that matches the meaning.",
    },
    Alert: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
        tone: tone.nullable(),
      }),
      description:
        "A callout for important information, such as an empty result or a successful submission.",
    },
    Table: {
      props: z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        caption: z.string().nullable(),
      }),
      description:
        "A data table. Every row has one cell per column, in the same order.",
    },
    BarChart: {
      props: z.object({
        title: z.string(),
        data: series,
        tone: chartTone.nullable(),
      }),
      description:
        "Horizontal bars for comparing counts across categories, such as requests by team or status.",
    },
    LineChart: {
      props: z.object({
        title: z.string(),
        data: series,
        tone: chartTone.nullable(),
      }),
      description:
        "A line for a small series of values, such as requests by day.",
    },
    PieChart: {
      props: z.object({
        title: z.string(),
        data: series,
      }),
      description:
        "A pie chart for parts of a whole, such as requests by priority.",
    },
    Timeline: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            detail: z.string().nullable(),
            time: z.string().nullable(),
          }),
        ),
      }),
      description:
        "A vertical timeline of events, newest first, each with a title and optional detail and time.",
    },
    Tabs: {
      props: z.object({
        tabs: z.array(
          z.object({
            label: z.string(),
            value: z.string(),
            content: z.string(),
          }),
        ),
        value: z.string().nullable(),
      }),
      description:
        "Switchable sections. Bind value to a state path so a tab stays selected when the page updates.",
    },
    Form: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description:
        "A form container. Put Input, Textarea, Select and Checkbox children inside, followed by a Button.",
    },
    Input: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        type: z.enum(["text", "email", "number"]).nullable(),
      }),
      description:
        "A single-line text field. Bind value to a state path so the entry is stored.",
    },
    Textarea: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        rows: z.number().int().min(2).max(10).nullable(),
      }),
      description:
        "A multi-line text field. Bind value to a state path so the entry is stored.",
    },
    Select: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        options: z.array(z.string()),
      }),
      description:
        "A dropdown with string options. Bind value to a state path so the choice is stored.",
    },
    Checkbox: {
      props: z.object({
        label: z.string(),
        checked: z.boolean().nullable(),
      }),
      description:
        "A single checkbox. Bind checked to a state path so the choice is stored.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["default", "outline", "destructive"]).nullable(),
      }),
      description:
        "A button. Bind its on.press event to an action to make it do something.",
    },
  },
  actions: {
    submit_request: {
      description:
        "Files a new work request from the form state. The form must bind title to /form/title, details to /form/details, team to /form/team (operations, finance or support) and priority to /form/priority (low, medium or high). Bind the submit Button's on.press to this action.",
    },
  },
});

export type Catalog = typeof catalog;
