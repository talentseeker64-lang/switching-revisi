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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PARTNER_TYPE_LABELS, type Partner, type PartnerType } from '@/lib/types';
import { createPartner, updatePartner } from '@/lib/api/partners';
import { ApiError } from '@/lib/api-client';

const PARTNER_TYPE_VALUES = Object.keys(PARTNER_TYPE_LABELS) as [PartnerType, ...PartnerType[]];

const createSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, numbers, dashes or underscores only'),
  name: z.string().min(2).max(150),
  type: z.enum(PARTNER_TYPE_VALUES, { message: 'Required' }),
  contactName: z.string().optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof createSchema>;

export function PartnerFormDialog({
  partner,
  onSaved,
}: {
  partner?: Partner;
  onSaved: () => void;
}) {
  const isEdit = !!partner;
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
    resolver: zodResolver(createSchema),
    defaultValues: {
      code: partner?.code ?? '',
      name: partner?.name ?? '',
      type: partner?.type ?? ('' as PartnerType),
      contactName: partner?.contactName ?? '',
      contactEmail: partner?.contactEmail ?? '',
      contactPhone: partner?.contactPhone ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: partner?.code ?? '',
        name: partner?.name ?? '',
        type: partner?.type ?? ('' as PartnerType),
        contactName: partner?.contactName ?? '',
        contactEmail: partner?.contactEmail ?? '',
        contactPhone: partner?.contactPhone ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const payload = {
        name: values.name,
        type: values.type,
        contactName: values.contactName || undefined,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
      };

      if (isEdit) {
        await updatePartner(partner.id, payload);
        toast.success('Partner updated');
      } else {
        await createPartner({ code: values.code, ...payload });
        toast.success('Partner created');
      }

      setOpen(false);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save partner';
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
            {isEdit ? 'Edit' : 'New Partner'}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit partner' : 'Register new partner'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the partner profile. The partner code cannot be changed.'
              : 'Partner code must be unique and is used in routing rules and logs.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" disabled={isEdit} {...register('code')} placeholder="KOP-SEJAHTERA" />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} placeholder="Koperasi Sejahtera Bersama" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={watch('type')} onValueChange={(v) => setValue('type', v as PartnerType)}>
              <SelectTrigger id="type" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PARTNER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-sm text-destructive">Type is required</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName">Contact name</Label>
            <Input id="contactName" {...register('contactName')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" {...register('contactEmail')} />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" {...register('contactPhone')} />
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
