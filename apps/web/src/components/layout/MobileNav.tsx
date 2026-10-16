import { MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

/** Botão "hambúrguer" + gaveta com a navegação (telas abaixo de md). */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="max-w-[18rem] border-sidebar-border bg-sidebar text-sidebar-foreground"
        closeClassName="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Navegação principal do TraceFlow</SheetDescription>
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <BrandMark inverted />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
