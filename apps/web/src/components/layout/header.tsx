'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import { useUiStore } from '@/stores/ui.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SEARCH_ROUTES: { path: string; label: string }[] = [
  { path: '/dashboard/products', label: 'Productos' },
  { path: '/dashboard/users', label: 'Usuarios' },
  { path: '/dashboard/clients', label: 'Clientes' },
  { path: '/dashboard/suppliers', label: 'Proveedores' },
  { path: '/dashboard/sales', label: 'Ventas' },
  { path: '/dashboard/purchases', label: 'Compras' },
  { path: '/dashboard/inventory', label: 'Inventario' },
  { path: '/dashboard/branches', label: 'Sucursales' },
  { path: '/dashboard/categories', label: 'Categorías' },
  { path: '/dashboard/finance', label: 'Transacciones' },
  { path: '/dashboard/reports', label: 'Reportes' },
];

export function Header({ title }: { title?: string }) {
  const { setSidebarOpen, theme, setTheme } = useUiStore();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Current section search: navigate to current page with search param
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    // Check if current page is a searchable section
    const current = SEARCH_ROUTES.find((r) => pathname.startsWith(r.path));
    if (current) {
      router.push(`${current.path}?search=${encodeURIComponent(query.trim())}`);
    } else {
      // Go to products as default searchable page
      router.push(`/dashboard/products?search=${encodeURIComponent(query.trim())}`);
    }
    setShowSuggestions(false);
  }

  // Filter route suggestions by query
  const suggestions = query.length >= 2
    ? SEARCH_ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!inputRef.current?.parentElement?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-8 w-8"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {title && <h1 className="hidden sm:block text-lg font-semibold">{title}</h1>}

      <form onSubmit={handleSearch} className="flex-1 hidden md:block max-w-sm">
        <div className="relative" ref={inputRef as any}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Buscar en esta sección..."
            className="pl-9 h-8 bg-muted border-0"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-md z-50 py-1">
              {suggestions.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => { router.push(s.path); setQuery(''); setShowSuggestions(false); }}
                >
                  Ir a <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
