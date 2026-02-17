import * as React from "react";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <Drawer open={open} onOpenChange={onOpenChange}>{children}</Drawer>;
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>;
}

function ResponsiveDialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTrigger asChild={asChild}>{children}</DrawerTrigger>;
  return <DialogTrigger asChild={asChild}>{children}</DialogTrigger>;
}

function ResponsiveDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent className={className}>
        <div className="overflow-y-auto max-h-[82vh] px-4 pb-8">
          {children}
        </div>
      </DrawerContent>
    );
  }
  return <DialogContent className={className}>{children}</DialogContent>;
}

function ResponsiveDialogHeader({ children, className, onClose }: { children: React.ReactNode; className?: string; onClose?: () => void }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="flex items-center justify-between px-0 pt-1 pb-3">
        <DrawerHeader className={`flex-1 p-0 text-left ${className ?? ''}`}>{children}</DrawerHeader>
        <DrawerClose asChild>
          <button className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground active:scale-90 transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </DrawerClose>
      </div>
    );
  }
  return <DialogHeader className={className}>{children}</DialogHeader>;
}

function ResponsiveDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTitle className={className}>{children}</DrawerTitle>;
  return <DialogTitle className={className}>{children}</DialogTitle>;
}

function ResponsiveDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerDescription className={className}>{children}</DrawerDescription>;
  return <DialogDescription className={className}>{children}</DialogDescription>;
}

function ResponsiveDialogClose({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerClose asChild={asChild}>{children}</DrawerClose>;
  return <DialogClose asChild={asChild}>{children}</DialogClose>;
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogClose,
};
