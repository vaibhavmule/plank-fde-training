import Link from "next/link";

import {
  PriorityBadge,
  requestLabel,
  StatusBadge,
} from "@/components/request-badges";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkRequest } from "@/lib/request-model";

export function RequestsTable({ requests }: { requests: WorkRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <h2 className="font-medium">No requests yet</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Submit your first request using the New request button.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableCaption>
        Requests, newest first. Times are shown in UTC.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Title</TableHead>
          <TableHead scope="col">Team</TableHead>
          <TableHead scope="col">Priority</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell className="min-w-48 max-w-sm font-medium whitespace-normal break-words">
              <Link
                href={`/requests/${request.id}`}
                className="underline-offset-4 hover:underline"
              >
                {request.title}
              </Link>
            </TableCell>
            <TableCell>{requestLabel(request.team)}</TableCell>
            <TableCell>
              <PriorityBadge priority={request.priority} />
            </TableCell>
            <TableCell>
              <StatusBadge status={request.status} />
            </TableCell>
            <TableCell>
              <time dateTime={request.createdAt}>
                {request.createdAt.slice(0, 16).replace("T", " ")}
              </time>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
