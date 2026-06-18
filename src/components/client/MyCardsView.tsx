import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CardsRegistryEditor, CardsEditorApi } from '../CardsRegistryEditor';
import {
  listCards,
  createCard,
  updateCard,
  deleteCard,
  importCardsCsv,
} from '../../lib/cardsApi';

export function MyCardsView() {
  const { t } = useTranslation('cardsList');
  const api = useMemo<CardsEditorApi>(
    () => ({
      list: () => listCards(),
      create: async (card) => {
        await createCard(card);
      },
      update: async (id, fields) => {
        await updateCard(id, fields);
      },
      remove: async (id) => {
        await deleteCard(id);
      },
      importCsv: (file) => importCardsCsv(file),
    }),
    []
  );

  return (
    <CardsRegistryEditor
      api={api}
      title={t('title')}
      description={t('description')}
    />
  );
}
