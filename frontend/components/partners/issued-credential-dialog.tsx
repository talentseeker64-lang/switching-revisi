'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { IssuedCredential } from '@/lib/types';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable - user can still select the text manually
    }
  }

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{value}</code>
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function IssuedCredentialDialog({
  credential,
  onOpenChange,
}: {
  credential: IssuedCredential | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!credential} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API credential issued</DialogTitle>
          <DialogDescription>
            Copy the secret now - it cannot be retrieved again after closing this dialog.
          </DialogDescription>
        </DialogHeader>
        {credential && (
          <div className="space-y-4">
            <CopyField label="API Key" value={credential.apiKey} />
            <CopyField label="API Secret" value={credential.apiSecret} />
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
