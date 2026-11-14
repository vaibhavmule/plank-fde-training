export type RequestFormValues = {
  title: string;
  details: string;
  team: string;
  priority: string;
};

export type RequestFormState = {
  values: RequestFormValues;
  errors: Partial<Record<keyof RequestFormValues, string[]>>;
};

export const initialRequestFormState: RequestFormState = {
  values: { title: "", details: "", team: "operations", priority: "medium" },
  errors: {},
};
