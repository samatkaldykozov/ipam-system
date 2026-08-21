'use client';

import * as React from 'react';
import { FileUp, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ImportResult } from '@/lib/csv-utils';

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columnsHint: string;
  onImport: (csvText: string) => Promise<ImportResult>;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  columnsHint,
  onImport,
}: CsvImportDialogProps) {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFileName(null);
      setSubmitting(false);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setSubmitting(true);
    try {
      const text = await file.text();
      const outcome = await onImport(text);
      setResult(outcome);
      if (outcome.ok) {
        toast.success(
          `Import complete: ${outcome.created} created, ${outcome.updated} updated`,
        );
      }
    } catch {
      setResult({
        ok: false,
        created: 0,
        updated: 0,
        errors: [{ row: 0, message: 'Failed to read or process this file' }],
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const visibleErrors = result?.errors.slice(0, 25) ?? [];
  const hiddenErrorCount = Math.max((result?.errors.length ?? 0) - 25, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Expected columns:{' '}
            <span className="font-mono text-xs">{columnsHint}</span>. Export the
            current data first to get a file with this exact layout, then edit
            and re-import it.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleInputChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {fileName ?? 'Click to choose a CSV file'}
            </span>
            <span className="text-xs text-muted-foreground">
              {submitting ? 'Importing…' : 'or drag one here'}
            </span>
          </button>

          {result ? (
            <Alert
              variant={result.errors.length > 0 ? 'destructive' : 'default'}
            >
              <FileUp className="h-4 w-4" />
              <AlertTitle>
                {result.created} created, {result.updated} updated
                {result.errors.length > 0
                  ? `, ${result.errors.length} row(s) skipped`
                  : ''}
              </AlertTitle>
              {result.errors.length > 0 ? (
                <AlertDescription>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                    {visibleErrors.map((err, idx) => (
                      <p key={idx}>
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                    {hiddenErrorCount > 0 ? (
                      <p>…and {hiddenErrorCount} more.</p>
                    ) : null}
                  </div>
                </AlertDescription>
              ) : null}
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
