import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapseAllValue {
  allCollapsed: boolean;
  version: number;
  toggleAll: () => void;
}

const CollapseAllContext = createContext<CollapseAllValue | null>(null);

export function CollapseAllProvider({ children }: { children: ReactNode }) {
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [version, setVersion] = useState(0);
  const toggleAll = () => {
    setAllCollapsed((c) => !c);
    setVersion((v) => v + 1);
  };
  return (
    <CollapseAllContext.Provider value={{ allCollapsed, version, toggleAll }}>
      {children}
    </CollapseAllContext.Provider>
  );
}

export function useCollapseAll(): CollapseAllValue {
  return (
    useContext(CollapseAllContext) ?? {
      allCollapsed: false,
      version: 0,
      toggleAll: () => {},
    }
  );
}

interface CollapsibleSectionProps {
  title: string;
  headerExtra?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

// Derive a stable scroll-target id from the title (used by SectionsTOC). Strips
// parenthesized suffixes (e.g. "(24)") so a counted title's id doesn't change
// as the count does.
export function sectionIdFromTitle(t: string): string {
  const base = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CollapsibleSection({
  title,
  headerExtra,
  defaultCollapsed = false,
  children,
}: CollapsibleSectionProps) {
  const ctx = useCollapseAll();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  useEffect(() => {
    setCollapsed(ctx.allCollapsed);
    // Re-sync only when the global toggle fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.version]);

  return (
    <section
      id={sectionIdFromTitle(title)}
      data-section-title={title}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 scroll-mt-20"
    >
      <div className={`flex items-center justify-between gap-2 ${collapsed ? '' : 'mb-3'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 text-base font-semibold text-gray-900 hover:text-gray-700 -m-1 p-1 rounded"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
          <span>{title}</span>
        </button>
        {headerExtra && <div onClick={(e) => e.stopPropagation()}>{headerExtra}</div>}
      </div>
      {!collapsed && children}
    </section>
  );
}
