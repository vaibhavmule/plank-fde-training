import { Badge } from "@/components/ui/badge";
import type { WorkRequest } from "@/lib/request-model";

// Turns a stored enum value such as "in_progress" into "In progress".
export function requestLabel(value: string) {
  return value[0].toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function TeamBadge({ team }: { team: WorkRequest["team"] }) {
  return <Badge variant="outline">{requestLabel(team)}</Badge>;
}

export function PriorityBadge({
  priority,
}: {
  priority: WorkRequest["priority"];
}) {
  return (
    <Badge variant={priority === "high" ? "destructive" : "secondary"}>
      {requestLabel(priority)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: WorkRequest["status"] }) {
  return (
    <Badge variant={status === "open" ? "default" : "outline"}>
      {requestLabel(status)}
    </Badge>
  );
}
