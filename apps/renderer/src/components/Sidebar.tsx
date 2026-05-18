import { useState, useRef, useCallback, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FlaskConical, History, Settings } from "lucide-react";
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
