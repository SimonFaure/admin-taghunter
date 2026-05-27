import { DocsShell } from '../../help';

// Client-facing docs page. The HelpProvider (audience="client") is supplied by ClientLayout.
export function MyHelpView() {
  return (
    <div className="h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <DocsShell />
    </div>
  );
}
