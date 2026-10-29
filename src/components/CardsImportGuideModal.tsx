import { useTranslation } from 'react-i18next';
import { Download, X, FileSpreadsheet, Info } from 'lucide-react';
import { CARDS_IMPORT_HEADERS, mockCardValues } from '../lib/cardsTemplate';

interface Props {
  onClose: () => void;
  onDownload: () => void;
}

/** Explains what goes in each column of the cards import file, with a preview of the template. */
export function CardsImportGuideModal({ onClose, onDownload }: Props) {
  const { t } = useTranslation('cardsRegistry');
  const mock = mockCardValues(t('template.mock.name'), t('template.mock.color'));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-full overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-700" />
            {t('guide.title')}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-5">{t('guide.intro')}</p>

        {/* Spreadsheet-style preview: header row + example card line */}
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('guide.previewLabel')}
        </div>
        <div className="overflow-x-auto mb-2 border border-slate-300 rounded-md">
          <table className="min-w-full text-sm font-mono border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="w-10 border-r border-b border-slate-300 text-xs text-slate-400 font-normal" />
                {['A', 'B', 'C', 'D'].map((col) => (
                  <th
                    key={col}
                    className="border-r last:border-r-0 border-b border-slate-300 px-3 py-1 text-xs text-slate-400 font-normal"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bg-slate-100 border-r border-b border-slate-300 text-center text-xs text-slate-400">1</td>
                {CARDS_IMPORT_HEADERS.map((h) => (
                  <td key={h} className="border-r last:border-r-0 border-b border-slate-300 px-3 py-1.5 font-semibold text-slate-900">
                    {h}
                  </td>
                ))}
              </tr>
              <tr className="bg-amber-50">
                <td className="bg-slate-100 border-r border-slate-300 text-center text-xs text-slate-400">2</td>
                {CARDS_IMPORT_HEADERS.map((h) => (
                  <td key={h} className="border-r last:border-r-0 border-slate-300 px-3 py-1.5 text-slate-700">
                    {mock[h]}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mb-5">{t('guide.previewNote')}</p>

        {/* What goes in each column */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg mb-5">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('template.colColumn')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('template.colDescription')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('template.colRequired')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('template.colExample')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {CARDS_IMPORT_HEADERS.map((h) => (
                <tr key={h} className="align-top">
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">{h}</td>
                  <td className="px-3 py-2 text-slate-700">{t(`template.columns.${h}.description`)}</td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{t(`template.columns.${h}.required`)}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{mock[h]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 p-3 mb-5 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <ul className="list-disc pl-4 space-y-1">
            <li>{t('template.noteHeaders')}</li>
            <li>{t('template.noteExample')}</li>
            <li>{t('template.noteAddOnly')}</li>
            <li>{t('template.noteUpdate')}</li>
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            {t('guide.close')}
          </button>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700"
          >
            <Download className="w-4 h-4" />
            {t('guide.download')}
          </button>
        </div>
      </div>
    </div>
  );
}
