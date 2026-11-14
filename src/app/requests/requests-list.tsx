import {
  NoMatchingRequests,
  RequestFilterLinks,
} from "@/components/request-filter-links";
import { RequestsTable } from "@/components/requests-table";
import { requestFiltersSchema } from "@/lib/request-model";
import { listRequests } from "@/lib/requests";

export async function RequestsList({
  searchParams,
}: Pick<PageProps<"/requests">, "searchParams">) {
  const filters = requestFiltersSchema.parse(await searchParams);
  const requests = await listRequests(filters);
  // With nothing stored, the table's "No requests yet" state is the true one,
  // whatever the filters say.
  const noMatches =
    requests.length === 0 &&
    Boolean(filters.team || filters.status) &&
    (await listRequests()).length > 0;

  return (
    <div className="space-y-6">
      <RequestFilterLinks filters={filters} />
      {noMatches ? (
        <NoMatchingRequests />
      ) : (
        <RequestsTable requests={requests} />
      )}
    </div>
  );
}
