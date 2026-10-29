import { useTranslation } from 'react-i18next';

export interface PickerCustomer {
  id: string;
  name: string;
  archived?: boolean;
}

// Compact customer <select> ("None" + live customers). An archived customer is
// listed only when it is the current value, so the row still reads right.
export function CustomerInlinePicker({ customers, value, onChange, disabled, className }: {
  customers: PickerCustomer[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('customers');
  const options = customers.filter((c) => !c.archived || c.id === value);
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className={className ?? 'border border-slate-300 rounded-lg px-2 py-1 text-sm max-w-[12rem]'}
    >
      <option value="">{t('picker.none')}</option>
      {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
