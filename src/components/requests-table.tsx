import { Badge } from "@/components/ui/badge";
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

function label(value: string) {
  return value[0].toUpperCase() + value.slice(1).replaceAll("_", " ");
}

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
              {request.title}
            </TableCell>
            <TableCell>{label(request.team)}</TableCell>
            <TableCell>
              <Badge
                variant={
                  request.priority === "high" ? "destructive" : "secondary"
                }
              >
                {label(request.priority)}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={request.status === "open" ? "default" : "outline"}
              >
                {label(request.status)}
              </Badge>
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
