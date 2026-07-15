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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * On phones this renders a native-feeling bottom sheet (vaul: drag handle,
 * swipe-to-dismiss, background scale). On desktop it stays a centered dialog.
 * The choice is made once at the root and shared via context so the
 * subcomponent tree always matches the root primitive.
 */
const SheetContext = React.createContext(false);

interface ResponsiveDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;
  return (
    <SheetContext.Provider value={isMobile}>
      <Root open={open} onOpenChange={onOpenChange}>{children}</Root>
    </SheetContext.Provider>
  );
}

function ResponsiveDialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const Trigger = React.useContext(SheetContext) ? DrawerTrigger : DialogTrigger;
  return <Trigger asChild={asChild}>{children}</Trigger>;
}

function ResponsiveDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const isSheet = React.useContext(SheetContext);
  if (isSheet) {
    return (
      <DrawerContent>
        <div className={cn("overflow-y-auto overscroll-contain px-4 pt-2 pb-safe", className)}>
          <div className="pb-4">{children}</div>
        </div>
      </DrawerContent>
    );
  }
  return (
    <DialogContent className={`max-h-[85vh] overflow-y-auto ${className ?? ''}`}>
      {children}
    </DialogContent>
  );
}

function ResponsiveDialogHeader({ children, className }: { children: React.ReactNode; className?: string; onClose?: () => void }) {
  const Header = React.useContext(SheetContext) ? DrawerHeader : DialogHeader;
  return <Header className={className}>{children}</Header>;
}

function ResponsiveDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const Title = React.useContext(SheetContext) ? DrawerTitle : DialogTitle;
  return <Title className={className}>{children}</Title>;
}

function ResponsiveDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const Description = React.useContext(SheetContext) ? DrawerDescription : DialogDescription;
  return <Description className={className}>{children}</Description>;
}

function ResponsiveDialogClose({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const Close = React.useContext(SheetContext) ? DrawerClose : DialogClose;
  return <Close asChild={asChild}>{children}</Close>;
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
