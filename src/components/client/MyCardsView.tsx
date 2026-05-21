import { useMemo } from 'react';
import { CardsRegistryEditor, CardsEditorApi } from '../CardsRegistryEditor';
import {
  listCards,
  createCard,
  updateCard,
  deleteCard,
  importCardsCsv,
} from '../../lib/cardsApi';

export function MyCardsView() {
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
      title="My Cards"
      description="Register, edit and delete your game cards. Changes sync to your playground devices on their next refresh."
    />
  );
}
