import * as React from "react";

// Simple TooltipProvider wrapper to avoid radix-ui/react-tooltip React version conflicts
const TooltipProvider: React.FC<{ children: React.ReactNode; delayDuration?: number; skipDelayDuration?: number }> = ({ children }) => {
  return <>{children}</>;
};

const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, { ref, ...props });
    }
    return <button ref={ref} {...props}>{children}</button>;
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { side?: string; sideOffset?: number; hidden?: boolean; [key: string]: any }>(
  ({ children, side, sideOffset, hidden, ...props }, ref) => {
    if (hidden) return null;
    return <div ref={ref} {...props} style={{ display: "none" }}>{children}</div>;
  }
);
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
