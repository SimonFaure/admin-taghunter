import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
}

export function JsonViewer({ data, title = 'JSON Data' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const isExpanded = (path: string) => expandedPaths.has(path);

  const renderValue = (value: any, key: string, path: string, depth: number = 0): JSX.Element => {
    const indent = depth * 20;

    if (value === null) {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
          <span className="text-blue-400 font-medium">{key}:</span>
          <span className="text-slate-500 italic">null</span>
        </div>
      );
    }

    if (value === undefined) {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
          <span className="text-blue-400 font-medium">{key}:</span>
          <span className="text-slate-500 italic">undefined</span>
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
          <span className="text-blue-400 font-medium">{key}:</span>
          <span className="text-orange-400">{value.toString()}</span>
        </div>
      );
    }

    if (typeof value === 'number') {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
          <span className="text-blue-400 font-medium">{key}:</span>
          <span className="text-green-400">{value}</span>
        </div>
      );
    }

    if (typeof value === 'string') {
      const isUrl = value.startsWith('http://') || value.startsWith('https://');
      return (
        <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
          <span className="text-blue-400 font-medium">{key}:</span>
          {isUrl ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline break-all"
            >
              {value}
            </a>
          ) : (
            <span className="text-yellow-300">"{value}"</span>
          )}
        </div>
      );
    }

    if (Array.isArray(value)) {
      const currentPath = `${path}.${key}`;
      const expanded = isExpanded(currentPath);
      const isEmpty = value.length === 0;

      return (
        <div style={{ marginLeft: `${indent}px` }} className="py-1">
          <div className="flex gap-2 items-start">
            {!isEmpty && (
              <button
                onClick={() => togglePath(currentPath)}
                className="text-slate-400 hover:text-slate-200 mt-0.5"
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            <span className="text-blue-400 font-medium">{key}:</span>
            <span className="text-slate-400">
              [{value.length} {value.length === 1 ? 'item' : 'items'}]
            </span>
          </div>
          {expanded && !isEmpty && (
            <div className="mt-1">
              {value.map((item, index) =>
                renderValue(item, `[${index}]`, currentPath, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const currentPath = `${path}.${key}`;
      const expanded = isExpanded(currentPath);
      const keys = Object.keys(value);
      const isEmpty = keys.length === 0;

      return (
        <div style={{ marginLeft: `${indent}px` }} className="py-1">
          <div className="flex gap-2 items-start">
            {!isEmpty && (
              <button
                onClick={() => togglePath(currentPath)}
                className="text-slate-400 hover:text-slate-200 mt-0.5"
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            <span className="text-blue-400 font-medium">{key}:</span>
            <span className="text-slate-400">
              {'{'}
              {keys.length} {keys.length === 1 ? 'property' : 'properties'}
              {'}'}
            </span>
          </div>
          {expanded && !isEmpty && (
            <div className="mt-1">
              {keys.map((k) => renderValue(value[k], k, currentPath, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ marginLeft: `${indent}px` }} className="flex gap-2 py-1">
        <span className="text-blue-400 font-medium">{key}:</span>
        <span className="text-slate-300">{String(value)}</span>
      </div>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded transition text-sm"
        >
          {copied ? (
            <>
              <Check size={16} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={16} />
              Copy JSON
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-auto max-h-[600px] font-mono text-sm">
        {typeof data === 'object' && data !== null ? (
          Object.keys(data).map((key) => renderValue(data[key], key, 'root', 0))
        ) : (
          <div className="text-slate-400">No data available</div>
        )}
      </div>
    </div>
  );
}
