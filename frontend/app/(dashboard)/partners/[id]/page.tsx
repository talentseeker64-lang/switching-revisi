'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PartnerStatusBadge } from '@/components/partners/partner-status-badge';
import { PartnerFormDialog } from '@/components/partners/partner-form-dialog';
import { IssuedCredentialDialog } from '@/components/partners/issued-credential-dialog';
import {
  getPartner,
  issueCredential,
  revokeCredential,
  updatePartnerStatus,
} from '@/lib/api/partners';
import { ApiError } from '@/lib/api-client';
import { PARTNER_TYPE_LABELS, type IssuedCredential, type PartnerDetail, type PartnerStatus } from '@/lib/types';

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getPartner(id);
      setPartner(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load partner';
      toast.error(message);
      if (err instanceof ApiError && err.status === 404) {
        router.push('/partners');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: PartnerStatus) {
    if (!partner) return;
    try {
      await updatePartnerStatus(partner.id, status);
      toast.success(`Partner set to ${status}`);
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update status';
      toast.error(message);
    }
  }

  async function handleIssueCredential() {
    if (!partner) return;
    setIssuing(true);
    try {
      const credential = await issueCredential(partner.id);
      setIssuedCredential(credential);
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to issue credential';
      toast.error(message);
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevoke(credentialId: string) {
    if (!partner) return;
    try {
      await revokeCredential(partner.id, credentialId);
      toast.success('Credential revoked');
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to revoke credential';
      toast.error(message);
    }
  }

  if (isLoading || !partner) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/partners')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{partner.name}</h1>
        <PartnerStatusBadge status={partner.status} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Profile</CardTitle>
          <div className="flex gap-2">
            <PartnerFormDialog partner={partner} onSaved={load} />
            {partner.status !== 'ACTIVE' && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('ACTIVE')}>
                Activate
              </Button>
            )}
            {partner.status !== 'INACTIVE' && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('INACTIVE')}>
                Deactivate
              </Button>
            )}
            {partner.status !== 'SUSPENDED' && (
              <Button size="sm" variant="destructive" onClick={() => handleStatusChange('SUSPENDED')}>
                Suspend
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Code</div>
            <div className="font-mono">{partner.code}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Type</div>
            <div>{PARTNER_TYPE_LABELS[partner.type]}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Contact name</div>
            <div>{partner.contactName || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Contact email</div>
            <div>{partner.contactEmail || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Contact phone</div>
            <div>{partner.contactPhone || '-'}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API Credentials</CardTitle>
          <Button size="sm" onClick={handleIssueCredential} disabled={issuing}>
            {issuing ? 'Issuing...' : 'Issue new credential'}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partner.credentials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No credentials issued yet.
                  </TableCell>
                </TableRow>
              ) : (
                partner.credentials.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell className="font-mono text-xs">{cred.apiKeyPrefix}...</TableCell>
                    <TableCell>
                      <Badge variant={cred.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {cred.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(cred.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {cred.status === 'ACTIVE' && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(cred.id)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <IssuedCredentialDialog
        credential={issuedCredential}
        onOpenChange={(open) => !open && setIssuedCredential(null)}
      />
    </div>
  );
}
