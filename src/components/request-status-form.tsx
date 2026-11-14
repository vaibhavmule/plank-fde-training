import { setStatus } from "@/app/requests/[id]/actions";
import { requestLabel } from "@/components/request-badges";
import { Button } from "@/components/ui/button";
import { statusSchema, type WorkRequest } from "@/lib/request-model";

// One button per status the request can move to, so the current status is never
// offered as a no-op action.
export function RequestStatusForm({ request }: { request: WorkRequest }) {
  const otherStatuses = statusSchema.options.filter(
    (status) => status !== request.status,
  );

  return (
    <section aria-labelledby="request-status-heading" className="space-y-3">
      <h2 id="request-status-heading" className="font-semibold">
        Change status
      </h2>
      <form className="flex flex-wrap gap-2">
        {otherStatuses.map((status) => (
          <Button
            key={status}
            type="submit"
            variant="outline"
            formAction={setStatus.bind(null, request.id, status)}
          >
            {requestLabel(status)}
          </Button>
        ))}
      </form>
    </section>
  );
}
