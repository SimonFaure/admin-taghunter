export interface AppConfig {
  usbPort: string;
  language: 'english' | 'french';
  userEmail?: string;
}

const STORAGE_KEY = 'taghunter_creator_config';

const DEFAULT_CONFIG: AppConfig = {
  usbPort: '',
  language: 'english',
  userEmail: '',
};

export const loadConfig = async (): Promise<AppConfig> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    console.error('Error loading config:', error);
    return { ...DEFAULT_CONFIG };
  }
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
};
