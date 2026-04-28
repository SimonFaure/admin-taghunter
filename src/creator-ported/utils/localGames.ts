export async function getLocalGameIds(): Promise<string[]> {
  const isElectron = typeof window !== 'undefined' && (window as any).electron?.isElectron;

  if (!isElectron) {
    console.log('Electron not available');
    return [];
  }

  try {
    const localGameIds = await (window as any).electron.games.list();
    console.log('Local game folders found:', localGameIds);
    return localGameIds;
  } catch (error) {
    console.error('Error reading local games:', error);
    return [];
  }
}
