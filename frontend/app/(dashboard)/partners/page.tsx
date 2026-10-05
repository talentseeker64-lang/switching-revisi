'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PartnerStatusBadge } from '@/components/partners/partner-status-badge';
import { PartnerFormDialog } from '@/components/partners/partner-form-dialog';
import { listPartners } from '@/lib/api/partners';
import { ApiError } from '@/lib/api-client';
import { PARTNER_TYPE_LABELS, type Partner, type PartnerStatus, type PartnerType } from '@/lib/types';

const PAGE_SIZE = 20;

export default function PartnersPage() {
  const [items, setItems] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<PartnerType | 'ALL'>('ALL');
  const [status, setStatus] = useState<PartnerStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listPartners({
        search: search || undefined,
        type: type === 'ALL' ? undefined : type,
        status: status === 'ALL' ? undefined : status,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load partners';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search, type, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
        <PartnerFormDialog onSaved={load} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={type}
          onValueChange={(v) => {
            setPage(1);
            setType(v as PartnerType | 'ALL');
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {Object.entries(PARTNER_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v as PartnerStatus | 'ALL');
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No partners found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell className="font-mono text-xs">{partner.code}</TableCell>
                  <TableCell>
                    <Link href={`/partners/${partner.id}`} className="font-medium hover:underline">
                      {partner.name}
                    </Link>
                  </TableCell>
                  <TableCell>{PARTNER_TYPE_LABELS[partner.type]}</TableCell>
                  <TableCell>
                    <PartnerStatusBadge status={partner.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={<Link href={`/partners/${partner.id}`} />}
                      nativeButton={false}
                      variant="ghost"
                      size="sm"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} partner{total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
