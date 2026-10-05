'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { RoutingRuleFormDialog } from '@/components/routing/routing-rule-form-dialog';
import { deleteRoutingRule, listRoutingRules } from '@/lib/api/routing';
import { listPartners } from '@/lib/api/partners';
import { ApiError } from '@/lib/api-client';
import type { Partner, RoutingRule } from '@/lib/types';

export default function RoutingPage() {
  const [items, setItems] = useState<RoutingRule[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rules, partnerResult] = await Promise.all([
        listRoutingRules({ pageSize: 100 }),
        listPartners({ pageSize: 100 }),
      ]);
      setItems(rules.items);
      setPartners(partnerResult.items);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load routing rules';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(rule: RoutingRule) {
    if (!confirm(`Delete routing rule "${rule.name}"?`)) return;
    try {
      await deleteRoutingRule(rule.id);
      toast.success('Routing rule deleted');
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete routing rule';
      toast.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Routing Rules</h1>
        <RoutingRuleFormDialog partners={partners} onSaved={load} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Transaction type</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No routing rules yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell className="font-mono text-xs">{rule.transactionType}</TableCell>
                  <TableCell>
                    {rule.partner ? `${rule.partner.name} (${rule.partner.code})` : 'Any'}
                  </TableCell>
                  <TableCell>{rule.targetService}</TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <RoutingRuleFormDialog rule={rule} partners={partners} onSaved={load} />
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rule)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
