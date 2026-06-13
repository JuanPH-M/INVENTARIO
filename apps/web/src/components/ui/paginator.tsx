'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginatorProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
}

export function Paginator({ page, totalPages, total, onPageChange }: PaginatorProps) {
  const [inputVal, setInputVal] = useState('');

  if (totalPages <= 1 && !total) return null;

  function handleGo(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(inputVal, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
      setInputVal('');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages}{total !== undefined ? ` · ${total} registros` : ''}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {totalPages > 3 && (
          <form onSubmit={handleGo} className="flex items-center gap-1">
            <Input
              className="h-8 w-16 text-center text-sm"
              placeholder="Ir a"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              type="number"
              min={1}
              max={totalPages}
            />
            <Button type="submit" variant="outline" size="sm">Ir</Button>
          </form>
        )}
      </div>
    </div>
  );
}
