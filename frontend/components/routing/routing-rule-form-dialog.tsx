'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Partner, RoutingRule } from '@/lib/types';
import { createRoutingRule, updateRoutingRule } from '@/lib/api/routing';
import { ApiError } from '@/lib/api-client';

const schema = z.object({
  name: z.string().min(2).max(150),
  transactionType: z.string().min(1).max(60),
  partnerId: z.string().optional(),
  targetService: z.string().min(1).max(60),
  priority: z.number().int().min(1).max(1000),
  isActive: z.boolean(),
  fieldMappingJson: z.string().optional().refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid JSON object, e.g. {"amount":"total_amount"}' },
  ),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(rule?: RoutingRule): FormValues {
  return {
    name: rule?.name ?? '',
    transactionType: rule?.transactionType ?? '',
    partnerId: rule?.partnerId ?? undefined, // RoutingRule.partnerId can be `null`; the form uses `undefined`
    targetService: rule?.targetService ?? 'BLOCKCHAIN_GATEWAY',
    priority: rule?.priority ?? 100,
    isActive: rule?.isActive ?? true,
    fieldMappingJson: rule?.targetConfig?.fieldMapping
      ? JSON.stringify(rule.targetConfig.fieldMapping, null, 2)
      : '',
  };
}

export function RoutingRuleFormDialog({
  rule,
  partners,
  onSaved,
}: {
  rule?: RoutingRule;
  partners: Partner[];
  onSaved: () => void;
}) {
  const isEdit = !!rule;
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(rule),
  });

  useEffect(() => {
    if (open) reset(toFormValues(rule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const fieldMapping = values.fieldMappingJson?.trim()
        ? (JSON.parse(values.fieldMappingJson) as Record<string, string>)
        : undefined;

      const payload = {
        name: values.name,
        transactionType: values.transactionType,
        partnerId: values.partnerId || undefined,
        targetService: values.targetService,
        priority: values.priority,
        isActive: values.isActive,
        targetConfig: fieldMapping ? { fieldMapping } : undefined,
      };

      if (isEdit) {
        await updateRoutingRule(rule.id, payload);
        toast.success('Routing rule updated');
      } else {
        await createRoutingRule(payload);
        toast.success('Routing rule created');
      }

      setOpen(false);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save routing rule';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={isEdit ? 'outline' : 'default'} size={isEdit ? 'sm' : 'default'}>
            {isEdit ? 'Edit' : 'New Rule'}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit routing rule' : 'Create routing rule'}</DialogTitle>
          <DialogDescription>
            Rules route a transaction type to a target service. A partner-scoped rule always wins
            over a generic one; otherwise lower priority runs first.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transactionType">Transaction type</Label>
            <Input
              id="transactionType"
              {...register('transactionType')}
              placeholder="PAYMENT_SETTLEMENT"
            />
            {errors.transactionType && (
              <p className="text-sm text-destructive">{errors.transactionType.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="partnerId">Partner scope</Label>
            <Select
              value={watch('partnerId') ?? 'ANY'}
              onValueChange={(v) => setValue('partnerId', !v || v === 'ANY' ? undefined : v)}
            >
              <SelectTrigger id="partnerId" className="w-full">
                <SelectValue placeholder="Any partner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANY">Any partner</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetService">Target service</Label>
            <Input id="targetService" {...register('targetService')} placeholder="BLOCKCHAIN_GATEWAY" />
            {errors.targetService && (
              <p className="text-sm text-destructive">{errors.targetService.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority (lower runs first)</Label>
            <Input
              id="priority"
              type="number"
              {...register('priority', { valueAsNumber: true })}
            />
            {errors.priority && (
              <p className="text-sm text-destructive">{errors.priority.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fieldMappingJson">Field mapping (optional JSON)</Label>
            <Textarea
              id="fieldMappingJson"
              rows={3}
              {...register('fieldMappingJson')}
              placeholder='{"amount": "total_amount"}'
              className="font-mono text-xs"
            />
            {errors.fieldMappingJson && (
              <p className="text-sm text-destructive">{errors.fieldMappingJson.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">Active</Label>
            <Switch
              id="isActive"
              checked={watch('isActive')}
              onCheckedChange={(checked) => setValue('isActive', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
