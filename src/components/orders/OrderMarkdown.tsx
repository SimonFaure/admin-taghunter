import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Product descriptions are Markdown typed in a plain textarea (admin). Raw HTML
// is not rendered (react-markdown default), links open in a new tab.
export function OrderMarkdown({ source, className = '' }: { source: string; className?: string }) {
  if (!source.trim()) return null;
  return (
    <div className={`text-sm text-slate-700 space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
