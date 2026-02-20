import * as React from "react";
import { cn } from "@/lib/utils";

// Safe TooltipProvider that does NOT depend on @radix-ui/react-tooltip
// to avoid duplicate-React "useRef of null" crashes.
const TooltipProvider: React.FC<{ children: React.ReactNode; delayDuration?: number; skipDelayDuration?: number }> = ({ children }) => {
  return <>{children}</>;
};

// Lazy-load radix tooltip only when actually used (not at app root)
let RadixLoaded: typeof import("@radix-ui/react-tooltip") | null = null;
function getRadix() {
  if (!RadixLoaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RadixLoaded = require("@radix-ui/react-tooltip");
  }
  return RadixLoaded!;
}

const Tooltip: React.FC<{ children: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }> = (props) => {
  const R = getRadix();
  return <R.Root {...props} />;
};

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  (props, ref) => {
    const R = getRadix();
    return <R.Trigger ref={ref} {...props} />;
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number; side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end" }
>(({ className, sideOffset = 4, ...props }, ref) => {
  const R = getRadix();
  return (
    <R.Provider>
      <R.Root>
        <R.Content
          ref={ref}
          sideOffset={sideOffset}
          className={cn(
            "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className,
          )}
          {...props}
        />
      </R.Root>
    </R.Provider>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
