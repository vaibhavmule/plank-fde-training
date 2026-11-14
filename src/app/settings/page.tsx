import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { config } from "@/lib/config";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const isProduction = config.environment === "production";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
          <CardDescription>What is running right now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">Environment</span>
            <Badge variant={isProduction ? "default" : "secondary"}>
              {config.environment}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">Commit</span>
            <code className="font-mono text-sm">{config.commit}</code>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
