import { RequestsTable } from "@/components/requests-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusSchema, type WorkRequest } from "@/lib/request-model";

const statusLabels = {
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
} satisfies Record<WorkRequest["status"], string>;

// listRequests supplies records in newest-first order.
export function AdminOverview({ requests }: { requests: WorkRequest[] }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="status-summary-heading" className="space-y-4">
        <h2 id="status-summary-heading" className="font-semibold">
          Requests by status
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {statusSchema.options.map((status) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle>
                  <h3>{statusLabels[status]}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {
                    requests.filter((request) => request.status === status)
                      .length
                  }
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section aria-labelledby="latest-requests-heading" className="space-y-4">
        <h2 id="latest-requests-heading" className="font-semibold">
          Latest requests
        </h2>
        <RequestsTable requests={requests.slice(0, 5)} />
      </section>
    </div>
  );
}
