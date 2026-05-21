/**
 * Placeholder tile shown in place of a missing image asset.
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md (decision #12)
 */

interface PlaceholderProps {
  label: string;
  className?: string;
}

export function Placeholder({ label, className }: PlaceholderProps) {
  return (
    <div className={`tqp-placeholder ${className ?? ''}`}>
      <span className="tqp-placeholder-label">{label}</span>
    </div>
  );
}
