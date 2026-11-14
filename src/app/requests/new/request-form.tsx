"use client";

import { useActionState } from "react";

import { submitRequest } from "./actions";
import { initialRequestFormState } from "./form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { prioritySchema, teamSchema } from "@/lib/request-model";

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-destructive text-sm">
      {errors.join(" ")}
    </p>
  );
}

export function RequestForm() {
  const [state, action, pending] = useActionState(
    submitRequest,
    initialRequestFormState,
    "/requests/new",
  );

  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <div aria-live="polite" className="sr-only">
        {Object.keys(state.errors).length > 0 &&
          "Please correct the highlighted fields and submit again."}
      </div>
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="title"
            name="title"
            required
            maxLength={120}
            defaultValue={state.values.title}
            aria-invalid={!!state.errors.title}
            aria-describedby={state.errors.title ? "title-error" : undefined}
            placeholder="What do you need help with?"
          />
          <FieldErrors id="title-error" errors={state.errors.title} />
        </div>
        <div className="space-y-2">
          <label htmlFor="details" className="text-sm font-medium">
            Details (optional)
          </label>
          <Textarea
            id="details"
            name="details"
            rows={5}
            maxLength={5000}
            defaultValue={state.values.details}
            aria-invalid={!!state.errors.details}
            aria-describedby={
              state.errors.details ? "details-error" : undefined
            }
            placeholder="Include any context the team will need."
          />
          <FieldErrors id="details-error" errors={state.errors.details} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="team" className="text-sm font-medium">
              Team
            </label>
            <NativeSelect
              id="team"
              name="team"
              required
              className="w-full"
              defaultValue={state.values.team}
              aria-invalid={!!state.errors.team}
              aria-describedby={state.errors.team ? "team-error" : undefined}
            >
              {teamSchema.options.map((team) => (
                <NativeSelectOption key={team} value={team}>
                  {team[0].toUpperCase() + team.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldErrors id="team-error" errors={state.errors.team} />
          </div>
          <div className="space-y-2">
            <label htmlFor="priority" className="text-sm font-medium">
              Priority
            </label>
            <NativeSelect
              id="priority"
              name="priority"
              required
              className="w-full"
              defaultValue={state.values.priority}
              aria-invalid={!!state.errors.priority}
              aria-describedby={
                state.errors.priority ? "priority-error" : undefined
              }
            >
              {prioritySchema.options.map((priority) => (
                <NativeSelectOption key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldErrors id="priority-error" errors={state.errors.priority} />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </fieldset>
    </form>
  );
}
