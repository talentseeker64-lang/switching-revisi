import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PlaceholderPage({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-muted-foreground">
            Coming in {stage}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This screen is scaffolded but not yet implemented. It will be built in {stage} of the
          project plan.
        </CardContent>
      </Card>
    </div>
  );
}
