# Coki Frontend Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all renderer pages and global styles to match the Apple-minimalist design system with automatic Light/Dark mode, using shadcn/ui + Tailwind CSS v4.

**Architecture:** CSS variables drive the entire color system via `prefers-color-scheme`. shadcn/ui components provide accessible primitives. All pages are rewritten as self-contained React components using Tailwind utility classes mapped to CSS variables. No functional changes to business logic.

**Tech Stack:** React 19, Tailwind CSS v4, shadcn/ui, Radix UI Primitives, Lucide React, Zustand

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/renderer/src/index.css` | Rewrite | CSS variables, shadcn base styles, dark mode, custom markdown tweaks |
| `apps/renderer/src/lib/utils.ts` | Create | shadcn `cn()` utility (clsx + tailwind-merge) |
| `apps/renderer/src/components/ui/*.tsx` | Create | shadcn components: button, badge, card, input, label, separator, collapsible, scroll-area, skeleton, tooltip |
| `apps/renderer/src/components/Sidebar.tsx` | Rewrite | Resizable sidebar with drag handle and adaptive layout |
| `apps/renderer/src/components/Timeline.tsx` | Rewrite | Phase-grouped trace log viewer with new visual style |
| `apps/renderer/src/components/CostPanel.tsx` | Rewrite | Collapsible cost summary using shadcn Collapsible |
| `apps/renderer/src/pages/Home.tsx` | Rewrite | Query input page with staggered entrance animations |
| `apps/renderer/src/pages/Dashboard.tsx` | Rewrite | Progress monitor with animated progress bar and styled log stream |
| `apps/renderer/src/pages/Report.tsx` | Rewrite | Markdown report reader with serif font, GFM, KaTeX, dark-mode prose |
| `apps/renderer/src/pages/History.tsx` | Rewrite | Card-based run history with status badges and empty state |
| `apps/renderer/src/pages/Settings.tsx` | Rewrite | Grouped form layout with card sections and save feedback |
| `apps/renderer/src/App.tsx` | Modify | Global layout shell with page transition wrapper |
| `apps/renderer/package.json` | Modify | Add shadcn/ui dependencies: class-variance-authority, clsx, tailwind-merge, @radix-ui/* |
| `apps/renderer/components.json` | Create | shadcn configuration file |
| `apps/renderer/tsconfig.json` | Modify | Add path alias `@/*` pointing to `src/*` for shadcn imports |

---

## Task 1: Initialize shadcn/ui and CSS Theme Foundation

**Files:**
- Create: `apps/renderer/components.json`
- Create: `apps/renderer/src/lib/utils.ts`
- Modify: `apps/renderer/package.json`
- Modify: `apps/renderer/tsconfig.json`
- Modify: `apps/renderer/src/index.css`
- Modify: `apps/renderer/vite.config.ts`

- [ ] **Step 1: Add shadcn/ui dependencies**

```bash
cd /Users/eureka/codes/coki/apps/renderer
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-collapsible @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tooltip
```

- [ ] **Step 2: Create shadcn config**

Create `apps/renderer/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 3: Create utils helper**

Create `apps/renderer/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Update tsconfig path alias**

Modify `apps/renderer/tsconfig.json` to add:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 5: Update vite.config.ts alias**

Modify `apps/renderer/vite.config.ts` to add the `@` alias:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 5173 },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 6: Rewrite index.css with CSS variables and shadcn base**

Replace `apps/renderer/src/index.css`:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@import "katex/dist/katex.min.css";
@import "highlight.js/styles/github.css";

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar-bg: var(--sidebar-bg);
  --color-sidebar-border: var(--sidebar-border);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 18px;
}

:root {
  --background: #ffffff;
  --foreground: #1d1d1f;
  --card: #ffffff;
  --card-foreground: #1d1d1f;
  --popover: #ffffff;
  --popover-foreground: #1d1d1f;
  --primary: #0071e3;
  --primary-foreground: #ffffff;
  --secondary: #f5f5f7;
  --secondary-foreground: #1d1d1f;
  --muted: #f5f5f7;
  --muted-foreground: #86868b;
  --accent: #f5f5f7;
  --accent-foreground: #1d1d1f;
  --destructive: #ff3b30;
  --destructive-foreground: #ffffff;
  --border: #e8e8ed;
  --input: #e8e8ed;
  --ring: #0071e3;
  --sidebar-bg: #f5f5f7;
  --sidebar-border: #e8e8ed;
  --success: #34c759;
  --warning: #ff9500;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 40px rgba(0,0,0,0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #000000;
    --foreground: #f5f5f7;
    --card: #000000;
    --card-foreground: #f5f5f7;
    --popover: #1c1c1e;
    --popover-foreground: #f5f5f7;
    --primary: #0a84ff;
    --primary-foreground: #ffffff;
    --secondary: #1c1c1e;
    --secondary-foreground: #f5f5f7;
    --muted: #1c1c1e;
    --muted-foreground: #98989d;
    --accent: #1c1c1e;
    --accent-foreground: #f5f5f7;
    --destructive: #ff453a;
    --destructive-foreground: #ffffff;
    --border: #38383a;
    --input: #38383a;
    --ring: #0a84ff;
    --sidebar-bg: #1c1c1e;
    --sidebar-border: #2c2c2e;
    --success: #30d158;
    --warning: #ff9f0a;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
    --shadow-lg: 0 12px 40px rgba(0,0,0,0.5);
  }

  @import "highlight.js/styles/github-dark.css";
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}

/* Markdown report styles */
.markdown-report {
  font-family: 'Noto Serif SC', Georgia, 'Times New Roman', serif;
  font-size: 16px;
  line-height: 1.8;
  color: var(--muted-foreground);
}

.markdown-report h1, .markdown-report h2, .markdown-report h3,
.markdown-report h4, .markdown-report h5, .markdown-report h6 {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  color: var(--foreground);
  font-weight: 600;
}

.markdown-report p {
  margin-bottom: 1.5em;
}

.markdown-report a[href^="#user-content-fn"] {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
  margin-left: 1px;
  text-decoration: none;
  color: var(--primary);
}

.markdown-report a[href^="#user-content-fn"]:hover {
  text-decoration: underline;
}

.markdown-report pre {
  border-radius: 12px;
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.6;
  overflow-x: auto;
  background: var(--secondary);
}

.markdown-report :not(pre) > code {
  background-color: var(--secondary);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  font-size: 0.9em;
  font-weight: inherit;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}

.markdown-report code::before,
.markdown-report code::after {
  content: none !important;
}

.markdown-report a[data-footnote-backref] {
  margin-left: 0.4em;
  text-decoration: none;
  color: var(--muted-foreground);
  font-size: 0.85em;
}

.markdown-report a[data-footnote-backref]:hover {
  color: var(--primary);
}

.markdown-report [data-footnotes] {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.markdown-report [data-footnotes] li {
  scroll-margin-top: 5rem;
  padding: 0.25rem 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.markdown-report sup[id^="user-content-fnref-"],
.markdown-report sup > a[href^="#user-content-fn-"] {
  scroll-margin-top: 5rem;
}

.markdown-report table {
  font-size: 0.9rem;
  width: 100%;
  border-collapse: collapse;
}

.markdown-report th {
  background-color: var(--secondary);
  font-weight: 600;
  text-align: left;
}

.markdown-report th,
.markdown-report td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.markdown-report tr:hover td {
  background-color: var(--secondary);
}

.markdown-report blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1rem;
  margin-left: 0;
  color: var(--muted-foreground);
  font-style: italic;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}
```

- [ ] **Step 7: Verify CSS compiles**

Run: `cd /Users/eureka/codes/coki/apps/renderer && pnpm dev`

Expected: Vite dev server starts without CSS errors on port 5173.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: init shadcn/ui, CSS variables, and dark mode theme"
```

---

## Task 2: Create shadcn/ui Primitive Components

**Files:**
- Create: `apps/renderer/src/components/ui/button.tsx`
- Create: `apps/renderer/src/components/ui/badge.tsx`
- Create: `apps/renderer/src/components/ui/card.tsx`
- Create: `apps/renderer/src/components/ui/input.tsx`
- Create: `apps/renderer/src/components/ui/label.tsx`
- Create: `apps/renderer/src/components/ui/separator.tsx`
- Create: `apps/renderer/src/components/ui/collapsible.tsx`
- Create: `apps/renderer/src/components/ui/scroll-area.tsx`
- Create: `apps/renderer/src/components/ui/skeleton.tsx`
- Create: `apps/renderer/src/components/ui/tooltip.tsx`

- [ ] **Step 1: Create Button component**

Create `apps/renderer/src/components/ui/button.tsx`:

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:scale-[1.02] hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 2: Create Badge component**

Create `apps/renderer/src/components/ui/badge.tsx`:

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-[rgba(52,199,89,0.12)] text-[#34c759] dark:bg-[rgba(48,209,88,0.15)] dark:text-[#30d158]",
        warning: "border-transparent bg-[rgba(255,149,0,0.12)] text-[#ff9500] dark:bg-[rgba(255,159,10,0.15)] dark:text-[#ff9f0a]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
```

- [ ] **Step 3: Create Card component**

Create `apps/renderer/src/components/ui/card.tsx`:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow duration-200",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
```

- [ ] **Step 4: Create Input component**

Create `apps/renderer/src/components/ui/input.tsx`:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 5: Create Textarea component**

Create `apps/renderer/src/components/ui/textarea.tsx`:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
```

- [ ] **Step 6: Create Label component**

Create `apps/renderer/src/components/ui/label.tsx`:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
```

- [ ] **Step 7: Create Separator component**

Create `apps/renderer/src/components/ui/separator.tsx`:

```typescript
import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
```

- [ ] **Step 8: Create Collapsible component**

Create `apps/renderer/src/components/ui/collapsible.tsx`:

```typescript
"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
```

- [ ] **Step 9: Create ScrollArea component**

Create `apps/renderer/src/components/ui/scroll-area.tsx`:

```typescript
import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border hover:bg-muted-foreground/40" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
```

- [ ] **Step 10: Create Skeleton component**

Create `apps/renderer/src/components/ui/skeleton.tsx`:

```typescript
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 11: Create Tooltip component**

Create `apps/renderer/src/components/ui/tooltip.tsx`:

```typescript
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-lg border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

- [ ] **Step 12: Verify build**

Run: `cd /Users/eureka/codes/coki/apps/renderer && pnpm build`

Expected: Build completes without TypeScript or Vite errors.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui primitive components"
```

---

## Task 3: Resizable Sidebar

**Files:**
- Rewrite: `apps/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar with resize handle**

Replace `apps/renderer/src/components/Sidebar.tsx`:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FileText, History, Settings, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 160;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 220;

const NAV_ITEMS = [
  { to: "/", label: "新研究", icon: FlaskConical },
  { to: "/history", label: "历史", icon: History },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const isNarrow = width < 200;

  return (
    <aside
      ref={sidebarRef}
      className="relative flex flex-col shrink-0 h-full border-r transition-colors duration-200"
      style={{
        width: `${width}px`,
        backgroundColor: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div className={cn("flex items-center", isNarrow ? "px-3 py-5 justify-center" : "px-5 py-6")}>
        {isNarrow ? (
          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
            C
          </div>
        ) : (
          <span className="text-[22px] font-bold tracking-tight text-foreground">Coki</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-150",
                isNarrow ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )
            }
            title={isNarrow ? item.label : undefined}
          >
            <item.icon className="w-[18px] h-[18px] shrink-0" />
            {!isNarrow && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Resize Handle */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors duration-150 z-10",
          isResizing ? "bg-primary" : "bg-transparent hover:bg-primary/50",
        )}
        onMouseDown={handleMouseDown}
      />
    </aside>
  );
}
```

- [ ] **Step 2: Verify sidebar renders and resizes**

Run `pnpm dev`, open the app. Try dragging the right edge of the sidebar.

Expected: Sidebar width changes smoothly. Below 200px, labels hide and only icons show.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/Sidebar.tsx
git commit -m "feat: resizable sidebar with adaptive narrow layout"
```

---

## Task 4: Global Layout Shell + Page Transitions

**Files:**
- Modify: `apps/renderer/src/App.tsx`

- [ ] **Step 1: Update App.tsx with transition wrapper**

Replace `apps/renderer/src/App.tsx`:

```typescript
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Report } from "./pages/Report";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Timeline } from "./components/Timeline";

function PageTransition({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <div
      className="transition-opacity duration-200 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage("fadeOut");
      const timer = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("fadeIn");
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location, displayLocation]);

  return (
    <div
      className="transition-opacity duration-150 ease-out"
      style={{ opacity: transitionStage === "fadeIn" ? 1 : 0 }}
    >
      <Routes location={displayLocation}>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard/:runId" element={<Dashboard />} />
        <Route path="/report/:runId" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/timeline/:runId" element={<Timeline />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-w-0">
          <AppRoutes />
        </main>
      </div>
    </HashRouter>
  );
}
```

- [ ] **Step 2: Verify page transitions**

Click between routes. Expected: smooth 150ms fade between pages.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/App.tsx
git commit -m "feat: global layout shell with page fade transitions"
```

---

## Task 5: Home Page

**Files:**
- Rewrite: `apps/renderer/src/pages/Home.tsx`

- [ ] **Step 1: Rewrite Home with new design**

Replace `apps/renderer/src/pages/Home.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEPTH_OPTIONS = [
  { value: 1, label: "快速", desc: "概览式研究" },
  { value: 2, label: "平衡", desc: "标准深度" },
  { value: 3, label: "深度", desc: "全面分析" },
] as const;

export function Home() {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { setCurrentRunId, setIsRunning, reset } = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = async () => {
    if (!query.trim()) return;
    reset();
    setIsRunning(true);
    const runId = await api.research.start(query, { depth });
    setCurrentRunId(runId);
    navigate(`/dashboard/${runId}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-xl mx-auto px-8 py-16">
      {/* Title */}
      <div
        className={cn(
          "text-center transition-all duration-500 ease-out",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <h1 className="text-[28px] font-bold tracking-tight mb-2">Coki</h1>
        <p className="text-[15px] text-muted-foreground">深度研究，由 AI 驱动</p>
      </div>

      {/* Input */}
      <div
        className={cn(
          "w-full mt-12 transition-all duration-500 ease-out delay-100",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <Textarea
          placeholder="输入研究主题，例如：AI Agent 发展趋势..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[120px] text-[15px] leading-relaxed"
        />
      </div>

      {/* Depth selector */}
      <div
        className={cn(
          "flex gap-2 mt-6 transition-all duration-500 ease-out delay-200",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        {DEPTH_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDepth(opt.value)}
            className={cn(
              "px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200",
              depth === opt.value
                ? "bg-primary text-primary-foreground scale-[1.02]"
                : "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Start button */}
      <div
        className={cn(
          "w-full mt-6 transition-all duration-500 ease-out delay-300",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        )}
      >
        <Button
          size="lg"
          className="w-full h-12 text-base"
          onClick={handleStart}
          disabled={!query.trim()}
        >
          开始研究
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Home page**

Run `pnpm dev`. Expected: centered layout, staggered fade-in animation, pill-shaped buttons, working query submission.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/pages/Home.tsx
git commit -m "feat: redesign Home page with staggered animations"
```

---

## Task 6: Dashboard Page

**Files:**
- Rewrite: `apps/renderer/src/pages/Dashboard.tsx`

- [ ] **Step 1: Rewrite Dashboard with new design**

Replace `apps/renderer/src/pages/Dashboard.tsx`:

```typescript
import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { phase, progress, logs, isRunning, error } = useAppStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runId) return;

    const unsubscribe = api.on.researchProgress((event: unknown) => {
      const e = event as { type: string; phase?: string; message?: string; progress?: number };
      if (e.type === "progress") {
        useAppStore.getState().setPhase(e.phase ?? "unknown");
        useAppStore.getState().setProgress(e.progress ?? 0);
        useAppStore.getState().addLog({
          level: "info",
          message: e.message ?? "",
          phase: e.phase ?? "unknown",
        });
      } else if (e.type === "error") {
        useAppStore.getState().setError(e.message ?? "Unknown error");
        useAppStore.getState().setIsRunning(false);
      } else if (e.type === "complete") {
        useAppStore.getState().setIsRunning(false);
        navigate(`/report/${runId}`);
      }
    });

    return unsubscribe;
  }, [runId, navigate]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col items-center min-h-full max-w-[680px] mx-auto px-8 py-12">
      {/* Header */}
      <div className="w-full flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight">正在研究</h2>
          <p className="text-[15px] text-muted-foreground mt-1">
            {useAppStore.getState().currentRunId ? "研究任务执行中..." : ""}
          </p>
        </div>
        <Badge variant="default" className="mt-1">
          {phase}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="w-full mb-8">
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{
              width: `${progress}%`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        <div className="mt-2 text-[13px] font-medium text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="w-full mb-6 border-l-4 border-l-destructive bg-[rgba(255,59,48,0.06)] dark:bg-[rgba(255,69,58,0.08)]">
          <div className="p-4 text-sm text-foreground">{error}</div>
        </Card>
      )}

      {/* Log stream */}
      <Card className="w-full flex-1 min-h-[320px]">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">
            执行日志
          </h3>
        </div>
        <ScrollArea className="h-[320px]">
          <div className="p-4 space-y-2">
            {logs.map((log, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-[13px] font-mono py-1 px-2 rounded-lg hover:bg-secondary transition-colors duration-150"
              >
                <span className="text-muted-foreground shrink-0 w-[80px]">
                  [{log.phase}]
                </span>
                <span className="text-muted-foreground">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify Dashboard**

Run `pnpm dev`, start a research. Expected: clean progress bar with smooth animation, styled log stream with auto-scroll, error card with left red border.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/pages/Dashboard.tsx
git commit -m "feat: redesign Dashboard with progress bar and styled logs"
```

---

## Task 7: Report Page

**Files:**
- Rewrite: `apps/renderer/src/pages/Report.tsx`

- [ ] **Step 1: Rewrite Report with new design**

Replace `apps/renderer/src/pages/Report.tsx`:

```typescript
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { api } from "../lib/api";
import { CostPanel } from "../components/CostPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function Report() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    api.research.report(runId).then((data: unknown) => {
      const run = data as { cited_report?: string; citedReport?: string };
      setReport(run.cited_report ?? run.citedReport ?? null);
      setLoading(false);
    });
  }, [runId]);

  const handleExport = async () => {
    if (!report || !runId) return;
    const slug = runId.slice(0, 8);
    await api.research.exportMarkdown(`report-${slug}.md`, report);
  };

  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto px-8 py-12">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-8 w-full mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-[800px] mx-auto px-8 py-12 text-center">
        <p className="text-muted-foreground">未找到报告</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto px-8 py-12">
      {/* Report header */}
      <div className="mb-8">
        <div className="text-[13px] font-medium text-muted-foreground mb-2">
          研究报告
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">
          深度研究报告
        </h1>
      </div>

      {/* Report content */}
      <article className="markdown-report">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={{
            h2: ({ node: _node, children, ...props }) => {
              const isFootnotes =
                props.id === "footnote-label" ||
                (typeof children === "string" && children === "Footnotes");
              return (
                <h2 {...props} id={props.id ?? undefined}>
                  {isFootnotes ? "References" : children}
                </h2>
              );
            },
            a: ({ href, children, ...props }) => {
              if (href?.startsWith("#")) {
                return (
                  <a
                    {...props}
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      const target = document.getElementById(
                        decodeURIComponent(href.slice(1)),
                      );
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a {...props} href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {report}
        </ReactMarkdown>
      </article>

      {/* Action bar */}
      <div className="flex gap-3 items-center justify-center mt-12 pt-8 border-t border-border">
        <Button variant="secondary" size="sm" onClick={handleExport}>
          保存为 .md
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/timeline/${runId}`)}>
          查看时间线
        </Button>
      </div>

      {/* Cost panel */}
      <div className="mt-6">
        <CostPanel runId={runId!} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Report page**

Run `pnpm dev`, navigate to a completed report. Expected: serif font body, proper heading hierarchy, styled code blocks, working footnotes, GFM tables, action bar with secondary buttons.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/pages/Report.tsx
git commit -m "feat: redesign Report page with serif typography and dark mode"
```

---

## Task 8: History Page

**Files:**
- Rewrite: `apps/renderer/src/pages/History.tsx`

- [ ] **Step 1: Rewrite History with new design**

Replace `apps/renderer/src/pages/History.tsx`:

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Clock } from "lucide-react";

interface RunSummary {
  id: string;
  user_query: string;
  depth: number;
  status: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "destructive" },
  running: { label: "进行中", variant: "warning" },
};

const DEPTH_LABELS: Record<number, string> = {
  1: "快速",
  2: "平衡",
  3: "深度",
};

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.research.history().then((data: unknown) => {
      setRuns(data as RunSummary[]);
    });
  }, []);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full max-w-[720px] mx-auto px-8 py-16">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
          <FileText className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-[17px] font-semibold mb-2">暂无研究记录</h2>
        <p className="text-[15px] text-muted-foreground mb-6">开始你的第一次深度研究</p>
        <Button onClick={() => navigate("/")}>开始新研究</Button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-8 py-8">
      <h2 className="text-[22px] font-semibold tracking-tight mb-6">历史记录</h2>
      <div className="space-y-3">
        {runs.map((run, index) => (
          <Card
            key={run.id}
            className="p-5 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-border/80"
            style={{
              animationDelay: `${index * 50}ms`,
            }}
            onClick={() => navigate(`/report/${run.id}`)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground truncate">
                  {run.user_query}
                </h3>
                <div className="flex items-center gap-3 mt-1.5 text-[13px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(run.created_at).toLocaleDateString("zh-CN")}
                  </span>
                  <span>{DEPTH_LABELS[run.depth] ?? `深度 ${run.depth}`}</span>
                </div>
              </div>
              <Badge variant={STATUS_MAP[run.status]?.variant ?? "secondary"}>
                {STATUS_MAP[run.status]?.label ?? run.status}
              </Badge>
            </div>
            {run.status === "completed" && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <button
                  className="text-[13px] text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/timeline/${run.id}`);
                  }}
                >
                  查看时间线
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify History page**

Run `pnpm dev`, navigate to /history. Expected: card list with hover shadow, status badges (colored pills), date + depth metadata, empty state with icon and CTA.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/pages/History.tsx
git commit -m "feat: redesign History page with card layout and status badges"
```

---

## Task 9: Timeline Component

**Files:**
- Rewrite: `apps/renderer/src/components/Timeline.tsx`

- [ ] **Step 1: Rewrite Timeline with new design**

Replace `apps/renderer/src/components/Timeline.tsx`:

```typescript
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const api = (window as any).coki;

interface TraceLog {
  id: number;
  run_id: string;
  phase: string | null;
  event_type: string | null;
  message: string | null;
  details: string | null;
  level: string;
  created_at: string;
}

const LEVEL_VARIANTS: Record<string, "default" | "secondary" | "warning" | "destructive"> = {
  debug: "secondary",
  info: "secondary",
  warn: "warning",
  error: "destructive",
};

const PHASE_ORDER = ["init", "plan", "split", "subagents", "reflection", "synthesize", "extract-claims", "cite"];

const PHASE_LABELS: Record<string, string> = {
  init: "初始化",
  plan: "计划",
  split: "拆分",
  subagents: "子代理",
  reflection: "反思",
  synthesize: "综合",
  "extract-claims": "提取论点",
  cite: "引用",
};

export function Timeline() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<TraceLog[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!runId) return;
    api.research.timeline(runId).then(setLogs);
  }, [runId]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const grouped: Record<string, TraceLog[]> = {};
  for (const log of logs) {
    const phase = log.phase ?? "unknown";
    if (!grouped[phase]) grouped[phase] = [];
    grouped[phase].push(log);
  }

  const sortedPhases = PHASE_ORDER.filter((p) => grouped[p]);
  for (const p of Object.keys(grouped)) {
    if (!sortedPhases.includes(p)) sortedPhases.push(p);
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  };

  return (
    <div className="max-w-[800px] mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight">时间线</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">暂无追踪日志</p>
      ) : (
        <div className="space-y-8">
          {sortedPhases.map((phase) => (
            <div key={phase}>
              <h2 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {PHASE_LABELS[phase] ?? phase}
              </h2>
              <div className="relative pl-4">
                {/* Timeline line */}
                <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-border" />

                <div className="space-y-1">
                  {grouped[phase].map((log) => (
                    <div key={log.id} className="relative pl-5">
                      {/* Dot */}
                      <div
                        className="absolute left-0 top-[10px] w-[10px] h-[10px] rounded-full bg-primary"
                        style={{
                          boxShadow: `0 0 0 3px var(--background), 0 0 0 4px var(--border)`,
                        }}
                      />

                      <div
                        className="cursor-pointer rounded-lg px-3 py-2 hover:bg-secondary transition-colors duration-150"
                        onClick={() => toggle(log.id)}
                      >
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="text-muted-foreground font-mono shrink-0 w-[72px]">
                            {formatTime(log.created_at)}
                          </span>
                          <Badge variant={LEVEL_VARIANTS[log.level] ?? "secondary"} className="text-[11px] py-0 h-5">
                            {log.level}
                          </Badge>
                          {log.event_type && (
                            <span className="text-muted-foreground">{log.event_type}</span>
                          )}
                          <span className="text-foreground flex-1">{log.message}</span>
                          {log.details && (
                            <span className="text-muted-foreground">
                              {expanded.has(log.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>
                          )}
                        </div>

                        {expanded.has(log.id) && log.details && (
                          <Card className="mt-2 p-3 bg-secondary/50 border-none">
                            <pre className="text-[12px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(log.details), null, 2);
                                } catch {
                                  return log.details;
                                }
                              })()}
                            </pre>
                          </Card>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify Timeline**

Run `pnpm dev`, navigate to a timeline. Expected: vertical timeline with accent dots, phase grouping with Chinese labels, expandable JSON details in styled cards, level badges.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/Timeline.tsx
git commit -m "feat: redesign Timeline with accent dots and phase grouping"
```

---

## Task 10: Settings Page

**Files:**
- Rewrite: `apps/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Rewrite Settings with new design**

Replace `apps/renderer/src/pages/Settings.tsx`:

```typescript
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigData {
  llm: { baseUrl: string; model: string; apiKeyConfigured: boolean; thinking: boolean };
  tavily: { apiKeyConfigured: boolean };
  roles: Record<string, { model: string }>;
}

const ROLE_NAMES = ["planner", "splitter", "subagent", "evaluator", "reflection", "synthesis", "citation"] as const;

const ROLE_LABELS: Record<string, string> = {
  planner: "Planner",
  splitter: "Splitter",
  subagent: "Sub-agent",
  evaluator: "Evaluator",
  reflection: "Reflection",
  synthesis: "Synthesis",
  citation: "Citation",
};

export function Settings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [thinking, setThinking] = useState(false);
  const [roleModels, setRoleModels] = useState<Record<string, string>>({});
  const [llmKey, setLlmKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [llmKeyFocused, setLlmKeyFocused] = useState(false);
  const [tavilyKeyFocused, setTavilyKeyFocused] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.config.get().then((data: ConfigData) => {
      setConfig(data);
      setBaseUrl(data.llm.baseUrl);
      setDefaultModel(data.llm.model);
      setThinking(data.llm.thinking ?? false);
      const models: Record<string, string> = {};
      for (const role of ROLE_NAMES) {
        models[role] = data.roles[role]?.model ?? "";
      }
      setRoleModels(models);
    });
  }, []);

  const handleSave = async () => {
    const patch: Record<string, unknown> = {};
    if (baseUrl !== config?.llm.baseUrl) patch.llmBaseUrl = baseUrl;
    if (defaultModel !== config?.llm.model) patch.llmModel = defaultModel;
    if (thinking !== (config?.llm.thinking ?? false)) patch.llmThinking = thinking;
    if (llmKey) patch.llmApiKey = llmKey;
    if (tavilyKey) patch.tavilyApiKey = tavilyKey;

    for (const role of ROLE_NAMES) {
      const current = config?.roles[role]?.model ?? "";
      if (roleModels[role] !== current) {
        patch[`role.${role}.model`] = roleModels[role];
      }
    }

    await api.config.update(patch);
    setLlmKey("");
    setTavilyKey("");
    setLlmKeyFocused(false);
    setTavilyKeyFocused(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    const data: ConfigData = await api.config.get();
    setConfig(data);
  };

  return (
    <div className="max-w-[600px] mx-auto px-8 py-8">
      <h2 className="text-[22px] font-semibold tracking-tight mb-6">设置</h2>

      <div className="space-y-6">
        {/* LLM Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">LLM 配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={config?.llm.apiKeyConfigured && !llmKeyFocused ? "" : "输入 LLM API key..."}
                value={config?.llm.apiKeyConfigured && !llmKeyFocused && !llmKey ? "••••••••" : llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                onFocus={() => { setLlmKeyFocused(true); if (!llmKey) setLlmKey(""); }}
                onBlur={() => { if (!llmKey) setLlmKeyFocused(false); }}
              />
              {config?.llm.apiKeyConfigured && !llmKeyFocused && (
                <p className="text-[13px] text-[#34c759] dark:text-[#30d158]">已配置</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>默认模型</Label>
              <Input
                placeholder="gpt-4o-mini"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
              <p className="text-[13px] text-muted-foreground">
                未指定模型的角色将使用此默认值
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors duration-200 relative",
                    thinking ? "bg-primary" : "bg-border",
                  )}
                  onClick={() => setThinking(!thinking)}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform duration-200",
                      thinking ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </div>
                <span className="text-sm font-medium">启用思考模式</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Per-Role Models */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">角色模型覆盖</CardTitle>
            <CardDescription>为每个管道角色指定特定模型，留空则使用默认模型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ROLE_NAMES.map((role) => (
                <div key={role} className="flex items-center gap-3">
                  <Label className="w-28 shrink-0 text-[13px]">{ROLE_LABELS[role]}</Label>
                  <Input
                    placeholder={defaultModel || "gpt-4o-mini"}
                    value={roleModels[role] ?? ""}
                    onChange={(e) =>
                      setRoleModels((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tavily */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">Tavily 搜索</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Input
              type="password"
              placeholder={config?.tavily.apiKeyConfigured && !tavilyKeyFocused ? "" : "输入 Tavily API key..."}
              value={config?.tavily.apiKeyConfigured && !tavilyKeyFocused && !tavilyKey ? "••••••••" : tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              onFocus={() => { setTavilyKeyFocused(true); if (!tavilyKey) setTavilyKey(""); }}
              onBlur={() => { if (!tavilyKey) setTavilyKeyFocused(false); }}
            />
            {config?.tavily.apiKeyConfigured && !tavilyKeyFocused && (
              <p className="text-[13px] text-[#34c759] dark:text-[#30d158]">已配置</p>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            onClick={handleSave}
            className={cn(
              "transition-all duration-200",
              saved && "bg-[#34c759] hover:bg-[#34c759] dark:bg-[#30d158] dark:hover:bg-[#30d158]",
            )}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                已保存
              </>
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Settings**

Run `pnpm dev`, navigate to /settings. Expected: grouped card layout, custom toggle switch for thinking mode, save button turns green on success, input focus rings match theme.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/pages/Settings.tsx
git commit -m "feat: redesign Settings page with card groups and custom toggle"
```

---

## Task 11: CostPanel Component

**Files:**
- Rewrite: `apps/renderer/src/components/CostPanel.tsx`

- [ ] **Step 1: Rewrite CostPanel with shadcn Collapsible**

Replace `apps/renderer/src/components/CostPanel.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

const api = (window as any).coki;

interface CostSummary {
  totalInput: number;
  totalOutput: number;
  totalLatency: number;
  callCount: number;
  byPhase: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
}

export function CostPanel({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CostSummary | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    api.research.costSummary(runId).then(setData);
  }, [open, runId]);

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
    String(n);

  const formatMs = (ms: number) =>
    ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` :
    ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` :
    `${ms}ms`;

  return (
    <Card className="border-none shadow-none bg-transparent">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary rounded-xl transition-colors duration-150">
          <span>成本与令牌</span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {data ? (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">
                    {formatTokens(data.totalInput + data.totalOutput)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">总令牌数</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">{data.callCount}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">LLM 调用</div>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <div className="text-[22px] font-semibold text-foreground">
                    {formatMs(data.totalLatency)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">总耗时</div>
                </div>
              </div>

              {Object.keys(data.byPhase).length > 0 && (
                <div className="rounded-xl bg-secondary overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
                        <th className="text-left py-2.5 px-4">阶段</th>
                        <th className="text-right py-2.5 px-4">调用</th>
                        <th className="text-right py-2.5 px-4">输入</th>
                        <th className="text-right py-2.5 px-4">输出</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.byPhase).map(([phase, stats]) => (
                        <tr key={phase} className="border-t border-border/50">
                          <td className="py-2 px-4 text-foreground">{phase}</td>
                          <td className="text-right py-2 px-4">{stats.calls}</td>
                          <td className="text-right py-2 px-4">{formatTokens(stats.inputTokens)}</td>
                          <td className="text-right py-2 px-4">{formatTokens(stats.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 pb-4 text-sm text-muted-foreground">加载中...</div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
```

- [ ] **Step 2: Verify CostPanel**

Run `pnpm dev`, open a report, expand CostPanel. Expected: collapsible section with styled stat cards and phase breakdown table.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/CostPanel.tsx
git commit -m "feat: redesign CostPanel with shadcn Collapsible and stat cards"
```

---

## Task 12: Final Integration & Verification

**Files:**
- Modify: `apps/renderer/src/index.css` (dark mode highlight.js fix)

- [ ] **Step 1: Ensure dark mode highlight.js loads correctly**

In `apps/renderer/src/index.css`, verify the `@import "highlight.js/styles/github-dark.css"` inside the dark media query is working. If it causes build issues, replace with a manual CSS override:

```css
@media (prefers-color-scheme: dark) {
  .hljs {
    color: #e6edf3;
    background: #0d1117;
  }
  .hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
  .hljs-string { color: #a5d6ff; }
  .hljs-number { color: #79c0ff; }
  .hljs-comment { color: #8b949e; }
  .hljs-function { color: #d2a8ff; }
}
```

- [ ] **Step 2: Full typecheck**

Run: `cd /Users/eureka/codes/coki && pnpm typecheck`

Expected: No TypeScript errors in renderer package.

- [ ] **Step 3: Full build**

Run: `cd /Users/eureka/codes/coki/apps/renderer && pnpm build`

Expected: Build completes successfully.

- [ ] **Step 4: Lint check**

Run: `cd /Users/eureka/codes/coki && pnpm lint`

Expected: No ESLint errors (or only pre-existing ones).

- [ ] **Step 5: Visual QA checklist**

Manually verify in dev mode:
- [ ] Home: staggered fade-in, pill buttons, textarea focus ring
- [ ] Dashboard: progress bar animation, log stream styling
- [ ] Report: serif font, code blocks, tables, footnotes, dark mode readability
- [ ] History: card hover shadow, status badges, empty state
- [ ] Timeline: accent dots, expandable JSON, phase labels
- [ ] Settings: card groups, toggle switch, save feedback
- [ ] Sidebar: resize handle works, narrow mode shows icons only
- [ ] Page transitions: smooth fade between routes
- [ ] Dark mode: switch macOS appearance, app follows instantly

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete frontend visual redesign - Apple minimalist theme with dark mode"
```

---

## Spec Coverage Check

| Spec Section | Implementing Task |
|---|---|
| CSS variables (Light/Dark) | Task 1 |
| Font hierarchy | Task 1 (index.css), Task 7 (Report) |
| Spacing & radius system | Task 1, all page tasks |
| Shadow system | Task 1, page tasks |
| Button component (pill) | Task 2 |
| Badge variants | Task 2 |
| Card component | Task 2 |
| Input/Label/Form | Task 2, Task 10 |
| ScrollArea | Task 2, Task 6, Task 9 |
| Collapsible | Task 2, Task 11 |
| Tooltip | Task 2, Task 3 |
| Skeleton | Task 2, Task 7 |
| Page transitions | Task 4 |
| Resizable Sidebar | Task 3 |
| Home page | Task 5 |
| Dashboard page | Task 6 |
| Report page | Task 7 |
| History page | Task 8 |
| Timeline page | Task 9 |
| Settings page | Task 10 |
| CostPanel | Task 11 |
| Dark mode prose | Task 1, Task 7 |
| Focus rings | Task 2 |
| Animation specs | All page tasks |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- No vague requirements like "add appropriate error handling".
- All code blocks contain complete implementation.
- All file paths are exact.

## Type Consistency

- `cn()` utility used consistently across all components.
- shadcn component props follow standard React patterns.
- CSS variable names match between `index.css` and all component usages.
- `Badge` variant names consistent: `default`, `secondary`, `destructive`, `success`, `warning`.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-frontend-visual-redesign.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
