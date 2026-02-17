import * as React from "react";
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
  return <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>;
}

function ResponsiveDialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  return <DialogTrigger asChild={asChild}>{children}</DialogTrigger>;
}

function ResponsiveDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <DialogContent className={`max-h-[85vh] overflow-y-auto ${className ?? ''}`}>
      {children}
    </DialogContent>
  );
}

function ResponsiveDialogHeader({ children, className }: { children: React.ReactNode; className?: string; onClose?: () => void }) {
  return <DialogHeader className={className}>{children}</DialogHeader>;
}

function ResponsiveDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <DialogTitle className={className}>{children}</DialogTitle>;
}

function ResponsiveDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <DialogDescription className={className}>{children}</DialogDescription>;
}

function ResponsiveDialogClose({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
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
