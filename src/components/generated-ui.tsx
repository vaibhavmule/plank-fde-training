"use client";

import type { Spec } from "@json-render/core";
import {
  createStateStore,
  defineRegistry,
  JSONUIProvider,
  Renderer,
  useBoundProp,
  type SetState,
} from "@json-render/react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress as ProgressBar } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs as TabsRoot,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { catalog } from "@/lib/catalog";
import { requestInputSchema } from "@/lib/request-model";

type FormResult = { status: "success" | "error"; message: string };

const number = new Intl.NumberFormat("en-US");

const chartTone = {
  default: "bg-primary",
  info: "bg-sky-600",
  success: "bg-emerald-600",
  warning: "bg-amber-500",
} as const;

const toneText = {
  default: "text-foreground",
  info: "text-sky-600",
  success: "text-emerald-600",
  warning: "text-amber-600",
} as const;

const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"];

function formValues(state: Record<string, unknown>) {
  const nested = state.form;
  const form =
    typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : {};

  return {
    title: form.title ?? state.title,
    details: form.details ?? state.details ?? "",
    team: form.team ?? state.team,
    priority: form.priority ?? state.priority ?? "medium",
  };
}

function isFormResult(value: unknown): value is FormResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as FormResult).status === "success" ||
      (value as FormResult).status === "error") &&
    typeof (value as FormResult).message === "string"
  );
}

const graded = defineRegistry(catalog, {
  components: {
    Page: ({ props, children }) => (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {props.title}
          </h1>
          {props.description && (
            <p className="text-muted-foreground mt-1 text-sm">
              {props.description}
            </p>
          )}
        </div>
        {children}
      </div>
    ),
    Stack: ({ props, children }) => (
      <div
        className={
          props.direction === "row"
            ? "flex flex-wrap items-start gap-4"
            : `flex flex-col ${props.gap === "sm" ? "gap-2" : props.gap === "lg" ? "gap-6" : "gap-4"}`
        }
      >
        {children}
      </div>
    ),
    Grid: ({ props, children }) => (
      <div
        className={`grid gap-4 ${props.columns === 2 ? "sm:grid-cols-2" : props.columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}
      >
        {children}
      </div>
    ),
    Card: ({ props, children }) => (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && (
            <CardDescription>{props.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">{children}</CardContent>
      </Card>
    ),
    Heading: ({ props }) => {
      const level = props.level ?? "2";
      const className = "font-semibold tracking-tight";
      if (level === "1") return <h1 className={className}>{props.text}</h1>;
      if (level === "3") return <h3 className={className}>{props.text}</h3>;
      return <h2 className={className}>{props.text}</h2>;
    },
    Text: ({ props }) => (
      <p className={props.muted ? "text-muted-foreground text-sm" : "text-sm"}>
        {props.text}
      </p>
    ),
    Metric: ({ props }) => (
      <Card className="min-w-0">
        <CardContent className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {props.label}
          </p>
          <p
            className={`text-3xl font-semibold tabular-nums ${toneText[props.tone ?? "default"]}`}
          >
            {props.value}
          </p>
          {props.detail && (
            <p className="text-muted-foreground text-xs">{props.detail}</p>
          )}
        </CardContent>
      </Card>
    ),
    Progress: ({ props }) => (
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>{props.label}</span>
          <span className="text-muted-foreground tabular-nums">
            {props.value}%
          </span>
        </div>
        <ProgressBar value={props.value} />
      </div>
    ),
    Badge: ({ props }) => (
      <Badge
        variant={
          props.tone === "danger"
            ? "destructive"
            : props.tone === "neutral"
              ? "secondary"
              : props.tone === "warning"
                ? "outline"
                : "default"
        }
      >
        {props.text}
      </Badge>
    ),
    Alert: ({ props }) => (
      <Alert
        variant={
          props.tone === "danger" || props.tone === "warning"
            ? "destructive"
            : "default"
        }
      >
        <AlertTitle>{props.title}</AlertTitle>
        {props.description && (
          <AlertDescription>{props.description}</AlertDescription>
        )}
      </Alert>
    ),
    Table: ({ props }) => (
      <Table>
        {props.caption && (
          <caption className="text-muted-foreground mb-2 text-left text-sm">
            {props.caption}
          </caption>
        )}
        <TableHeader>
          <tr>
            {props.columns.map((column, index) => (
              <TableHead key={`${column}-${index}`} scope="col">
                {column}
              </TableHead>
            ))}
          </tr>
        </TableHeader>
        <TableBody>
          {props.rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ),
    BarChart: ({ props }) => {
      const max = Math.max(1, ...props.data.map((item) => item.value));
      return (
        <figure className="space-y-3">
          <figcaption className="font-medium">{props.title}</figcaption>
          <div className="space-y-2" role="img" aria-label={props.title}>
            {props.data.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 text-sm"
              >
                <span className="truncate">{item.label}</span>
                <span className="bg-muted h-3 overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${chartTone[props.tone ?? "default"]}`}
                    style={{ width: `${(item.value / max) * 100}%` }}
                  />
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {number.format(item.value)}
                </span>
              </div>
            ))}
          </div>
        </figure>
      );
    },
    LineChart: ({ props }) => {
      const values = props.data.map((item) => item.value);
      const max = Math.max(1, ...values);
      const points = values
        .map((value, index) => {
          const x =
            values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
          const y = 100 - (value / max) * 90;
          return `${x},${y}`;
        })
        .join(" ");
      return (
        <figure className="space-y-3">
          <figcaption className="font-medium">{props.title}</figcaption>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={props.title}
            className="text-primary h-32 w-full"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {props.data.map((item) => (
              <li key={item.label}>
                {item.label}: {number.format(item.value)}
              </li>
            ))}
          </ul>
        </figure>
      );
    },
    PieChart: ({ props }) => {
      const total = props.data.reduce((sum, item) => sum + item.value, 0);
      let cursor = 0;
      const stops = props.data.map((item, index) => {
        const start = total === 0 ? 0 : (cursor / total) * 100;
        cursor += item.value;
        const end = total === 0 ? 0 : (cursor / total) * 100;
        return `${palette[index % palette.length]} ${start}% ${end}%`;
      });
      return (
        <figure className="flex flex-wrap items-center gap-4">
          <div
            role="img"
            aria-label={props.title}
            className="size-32 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(${stops.join(", ") || "#e5e7eb 0% 100%"})`,
            }}
          />
          <div className="space-y-1">
            <figcaption className="font-medium">{props.title}</figcaption>
            <ul className="space-y-1 text-sm">
              {props.data.map((item, index) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: palette[index % palette.length] }}
                  />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {number.format(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </figure>
      );
    },
    Timeline: ({ props }) => (
      <ol className="space-y-4">
        {props.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="flex gap-3">
            <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{item.title}</p>
              {item.detail && (
                <p className="text-muted-foreground text-sm">{item.detail}</p>
              )}
              {item.time && (
                <p className="text-muted-foreground text-xs">{item.time}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    ),
    Tabs: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value ?? undefined,
        bindings?.value,
      );
      const active = value ?? props.tabs[0]?.value;
      return (
        <TabsRoot
          value={active}
          onValueChange={(next) => setValue(String(next))}
        >
          <TabsList>
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {props.tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <p className="text-sm">{tab.content}</p>
            </TabsContent>
          ))}
        </TabsRoot>
      );
    },
    Form: ({ props, children }) => (
      <form
        onSubmit={(event) => event.preventDefault()}
        className="space-y-4 rounded-xl border p-4"
      >
        <div>
          <h2 className="font-semibold">{props.title}</h2>
          {props.description && (
            <p className="text-muted-foreground mt-1 text-sm">
              {props.description}
            </p>
          )}
        </div>
        {children}
      </form>
    ),
    Input: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value ?? undefined,
        bindings?.value,
      );
      return (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{props.label}</span>
          <Input
            type={props.type ?? "text"}
            value={value ?? ""}
            placeholder={props.placeholder ?? ""}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      );
    },
    Textarea: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value ?? undefined,
        bindings?.value,
      );
      return (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{props.label}</span>
          <Textarea
            rows={props.rows ?? 3}
            value={value ?? ""}
            placeholder={props.placeholder ?? ""}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      );
    },
    Select: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        props.value ?? undefined,
        bindings?.value,
      );
      return (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{props.label}</span>
          <NativeSelect
            className="w-full"
            value={value ?? ""}
            onChange={(event) => setValue(event.target.value)}
          >
            <NativeSelectOption value="">Choose…</NativeSelectOption>
            {props.options.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      );
    },
    Checkbox: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(
        props.checked ?? undefined,
        bindings?.checked,
      );
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={checked ?? false}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>{props.label}</span>
        </label>
      );
    },
    Button: ({ props, emit, loading }) => (
      <Button
        type="button"
        variant={props.variant ?? "default"}
        disabled={loading}
        onClick={() => emit("press")}
      >
        {props.label}
      </Button>
    ),
  },
  actions: {
    submit_request: async (_params, setState, state) => {
      const parsed = requestInputSchema.safeParse(formValues(state));

      if (!parsed.success) {
        setState((previous) => ({
          ...previous,
          formResult: {
            status: "error",
            message:
              parsed.error.issues[0]?.message ??
              "Fill in the title and team before filing.",
          },
        }));
        return;
      }

      try {
        const response = await fetch("/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!response.ok) throw new Error("The request could not be filed.");

        const body = (await response.json()) as {
          request: { title: string };
        };
        setState((previous) => ({
          ...previous,
          formResult: {
            status: "success",
            message: `Filed request “${body.request.title}”.`,
          },
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          formResult: {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "The request could not be filed.",
          },
        }));
      }
    },
  },
});

export const { registry } = graded;

export function GeneratedUI({
  spec,
  loading = false,
}: {
  spec: Spec | null;
  loading?: boolean;
}) {
  const store = useMemo(() => createStateStore({}), []);

  useEffect(() => {
    const state = spec?.state;
    if (!state) return;
    for (const [key, value] of Object.entries(state)) {
      store.set(`/${key}`, value);
    }
  }, [spec?.state, store]);

  const setState = useMemo<SetState>(
    () => (updater) => {
      const before = store.getSnapshot();
      const after = updater(before);
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          store.set(`/${key}`, after[key]);
        }
      }
    },
    [store],
  );

  const handlers = useMemo(
    () =>
      graded.handlers(
        () => setState,
        () => store.getSnapshot(),
      ),
    [setState, store],
  );

  const [result, setResult] = useState<FormResult | null>(null);

  useEffect(() => {
    const read = () => {
      const value = store.get("/formResult");
      setResult(isFormResult(value) ? value : null);
    };
    read();
    return store.subscribe(read);
  }, [store]);

  if (!spec) return null;

  return (
    <div className="space-y-4">
      {result && (
        <Alert variant={result.status === "error" ? "destructive" : "default"}>
          <AlertTitle>
            {result.status === "success" ? "Request filed" : "Not filed"}
          </AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      <JSONUIProvider registry={registry} store={store} handlers={handlers}>
        <Renderer spec={spec} registry={registry} loading={loading} />
      </JSONUIProvider>
    </div>
  );
}
