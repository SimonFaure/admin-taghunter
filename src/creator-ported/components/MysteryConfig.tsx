// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Upload, Download, Send, ChevronDown, ChevronUp, GripVertical, LayoutGrid as Layout, Menu, X } from 'lucide-react';
import { AdminOnlyPanel } from '../../components/AdminOnlyPanel';
import { ScenarioAdminControls } from '../../components/ScenarioAdminControls';
import { supabase } from '../lib/db';
import { ConfirmDialog, PublishStep } from './ConfirmDialog';
import { Alert } from './Alert';
import { LanguageSelector, AddLanguageModal } from './LanguageSelector';
import { JsonViewer } from './JsonViewer';
import { ClientEmailModal } from './ClientEmailModal';
import JSZip from 'jszip';
import { loadConfig } from '../utils/config';
import { getMediaUrl as getMediaUrlUtil, extractFileName as extractFileNameUtil } from '../utils/mediaUrl';
import { authService } from '../services/authService';
import { getUploadedFilenames, markUploaded } from '../utils/uploadedMediaCache';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
import { PublishValidationModal } from './PublishValidationModal';
import { validateMysteryConfig, type ValidationResult } from '../utils/publishValidation';

interface Level {
  points: string;
  name: string;
  description: string;
}

interface Enigma {
  number: string;
  text: string;
  good_answer_image: string;
  good_answer_points: string;
  wrong_answer_points: string;
}

interface Overscore {
  overscore_step: string;
  overscore_score: string;
  name_overscore_step: string;
  image_overscore_step: string;
}

interface MysteryConfigData {
  title: string;
  background_image: string;
  game_visual: string;
  game_instructions_image: string;
  game_instructions_button_image: string;
  game_instructions_button_hover_image: string;
  game_refresh_button_image: string;
  game_refresh_button_hover_image: string;
  levels_gauge_image: string;
  levels_gauge_image_with_content: string;
  levels_gauge_player_icon_image: string;
  levels_gauge_level_icon_image: string;
  time_background_image: string;
  score_background_image: string;
  enigmas_header_image: string;
  steps_container_image: string;
  top_1_image: string;
  top_3_image: string;
  top_10_image: string;
  game_public: string;
  number_of_enigmas: string;
  overscore_steps: string;
  score_full_game: string;
  animation_image_duration: string;
  animation_enigma_duration: string;
  animation_message_duration: string;
  default_time: string;
  gauge_filling: string;
  level_font_color: string;
  scenario_version: string;
  default_time_malus: string;
  font: string;
  font_color: string;
  enigma_success: string;
  enigma_error: string;
  enigma_no_answer: string;
  top_1_sound: string;
  top_3_sound: string;
  top_10_sound: string;
  final_image_sound: string;
  levels: Record<string, Level>;
  enigmas: Enigma[];
  overscores: Overscore[];
  points_units: string;
  team_title: string;
  pdf_title: string;
  auto_reset: boolean;
  delay_auto_reset: string;
  text_player_starts: string;
  text_card_not_empty: string;
  text_team_starts_card_not_empty: string;
  text_card_not_corresponding: string;
  text_team_ended: string;
  text_all_team_ended: string;
  text_scenario_ended: string;
  text_team_reached_new_level: string;
  text_card_empty: string;
  text_late_malus: string;
  text_team_enters_top_ranking: string;
  text_team_enters_podium: string;
  text_team_first_place: string;
  text_following_top_podium: string;
  text_if_error: string;
  text_is_card_empty: string;
  message_display_time: string;
  animation_display_time: string;
}

interface MysteryConfigProps {
  scenarioId: string;
  onBack: () => void;
  onOpenLayoutEditor: () => void;
}

export function MysteryConfig({ scenarioId, onBack, onOpenLayoutEditor }: MysteryConfigProps) {
  const [config, setConfig] = useState<MysteryConfigData>({
    title: '',
    background_image: '',
    game_visual: '',
    game_instructions_image: '',
    game_instructions_button_image: '',
    game_instructions_button_hover_image: '',
    game_refresh_button_image: '',
    game_refresh_button_hover_image: '',
    levels_gauge_image: '',
    levels_gauge_image_with_content: '',
    levels_gauge_player_icon_image: '',
    levels_gauge_level_icon_image: '',
    time_background_image: '',
    score_background_image: '',
    enigmas_header_image: '',
    steps_container_image: '',
    top_1_image: '',
    top_3_image: '',
    top_10_image: '',
    game_public: 'kids',
    number_of_enigmas: '12',
    overscore_steps: '6',
    score_full_game: '100',
    animation_image_duration: '1',
    animation_enigma_duration: '1',
    animation_message_duration: '2',
    default_time: '60',
    gauge_filling: 'linear-gradient(90deg, rgba(0,106,255,1) 0%, rgba(0,178,254,1) 35%, rgba(0,255,220,0.6741290266106443) 100%)',
    level_font_color: '#000000',
    scenario_version: '1.0',
    default_time_malus: '1',
    font: 'Arial',
    font_color: '#000000',
    enigma_success: '',
    enigma_error: '',
    enigma_no_answer: '',
    top_1_sound: '',
    top_3_sound: '',
    top_10_sound: '',
    final_image_sound: '',
    levels: {},
    enigmas: [],
    overscores: [],
    points_units: 'by_points',
    team_title: '',
    pdf_title: '',
    auto_reset: false,
    delay_auto_reset: '0',
    text_player_starts: '',
    text_card_not_empty: '',
    text_team_starts_card_not_empty: '',
    text_card_not_corresponding: '',
    text_team_ended: '',
    text_all_team_ended: '',
    text_scenario_ended: '',
    text_team_reached_new_level: '',
    text_card_empty: '',
    text_late_malus: '',
    text_team_enters_top_ranking: '',
    text_team_enters_podium: '',
    text_team_first_place: '',
    text_following_top_podium: '',
    text_if_error: '',
    text_is_card_empty: '',
    message_display_time: '2',
    animation_display_time: '1'
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [showCustomFontInput, setShowCustomFontInput] = useState(false);
  const [newCustomFont, setNewCustomFont] = useState('');
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishAllMedia, setPublishAllMedia] = useState(false);
  const [publishAsClient, setPublishAsClient] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [publishProgress, setPublishProgress] = useState<string>('');
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const [showClientEmailModal, setShowClientEmailModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [showNavigation, setShowNavigation] = useState(true);
  const [draggedEnigmaIndex, setDraggedEnigmaIndex] = useState<number | null>(null);
  const [draggedLevelKey, setDraggedLevelKey] = useState<string | null>(null);
  const [draggedOverscoreIndex, setDraggedOverscoreIndex] = useState<number | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioStory, setScenarioStory] = useState('');
  const [gameType, setGameType] = useState<string>('mystery');
  const [scenarioType, setScenarioType] = useState<'product' | 'custom'>('custom');
  const [scenarioStatus, setScenarioStatus] = useState<string>('draft');
  const [scenarioUniqid, setScenarioUniqid] = useState<string>('');
  const [scenarioLayout, setScenarioLayout] = useState<any>(null);
  const [scenarioData, setScenarioData] = useState<any>(null);
  const [defaultPatternId, setDefaultPatternId] = useState<string | null>(null);
  const [defaultPatternSlug, setDefaultPatternSlug] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [dragOverField, setDragOverField] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [pendingPublishAction, setPendingPublishAction] = useState<(() => void) | null>(null);

  const [currentLanguage, setCurrentLanguage] = useState('fr');
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['fr']);
  const [showAddLanguageModal, setShowAddLanguageModal] = useState(false);
  const [translations, setTranslations] = useState<Record<string, any>>({
    fr: {
      title: '',
      description: '',
      story: '',
      levels: {},
      enigmas: [],
      overscores: []
    }
  });

  const predefinedFonts = [
    'Arial',
    'Arial Black',
    'Helvetica',
    'Helvetica Neue',
    'Times New Roman',
    'Times',
    'Georgia',
    'Palatino',
    'Garamond',
    'Book Antiqua',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Courier New',
    'Courier',
    'Lucida Console',
    'Monaco',
    'Comic Sans MS',
    'Brush Script MT',
    'Impact',
    'Century Gothic',
    'Franklin Gothic Medium',
    'Gill Sans',
    'Segoe UI',
    'Calibri',
    'Cambria',
    'Candara',
    'Consolas',
    'TrajanPro',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Source Sans Pro',
    'Raleway',
    'Nunito',
    'Ubuntu',
    'Playfair Display',
    'Merriweather',
    'PT Sans',
    'Oswald',
    'Quicksand'
  ];

  useEffect(() => {
    loadConfig();
  }, [scenarioId]);

  const getMediaUrl = (fileName: string) => {
    return getMediaUrlUtil(scenarioUniqid || scenarioId, fileName);
  };

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('scenarios')
        .select('title, description, game_type, scenario_type, status, uniqid, data, medias, scenario_layout, default_pattern_id')
        .eq('id', scenarioId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setScenarioTitle(data.title || '');
        setScenarioDescription(data.description || '');
        setGameType(data.game_type || 'mystery');
        setScenarioType(data.scenario_type || 'custom');
        setScenarioStatus((data as any).status || 'draft');
        setScenarioUniqid(data.uniqid || '');
        setScenarioLayout((data as any).scenario_layout || null);
        setScenarioData({
          data: data.data || null,
          media: (data as any).medias || null
        });

        const patternId = (data as any).default_pattern_id || null;
        setDefaultPatternId(patternId);
        if (patternId) {
          const { data: patternData } = await supabase
            .from('patterns')
            .select('slug')
            .eq('id', patternId)
            .maybeSingle();
          setDefaultPatternSlug(patternData?.slug || null);
        } else {
          setDefaultPatternSlug(null);
        }

        const gameMeta = data.data?.game_meta || {};
        const loadedConfig = {
          ...config,
          title: data.title,
          ...gameMeta
        };

        // Check if scenario uses new media structure
        const scenarioMedia = (data as any).medias;

        if (scenarioMedia) {
          // New structure: media is separate
          // Merge general images
          if (scenarioMedia.images) {
            Object.keys(scenarioMedia.images).forEach(field => {
              loadedConfig[field as keyof MysteryConfigData] = scenarioMedia.images[field];
            });
          }

          // Merge level images
          if (scenarioMedia.levels) {
            Object.keys(scenarioMedia.levels).forEach(field => {
              loadedConfig[field as keyof MysteryConfigData] = scenarioMedia.levels[field];
            });
          }

          // Merge sounds
          if (scenarioMedia.sounds) {
            Object.keys(scenarioMedia.sounds).forEach(field => {
              loadedConfig[field as keyof MysteryConfigData] = scenarioMedia.sounds[field];
            });
          }

          // Merge enigma images back with enigma data
          if (scenarioMedia.enigmas && loadedConfig.enigmas) {
            loadedConfig.enigmas = loadedConfig.enigmas.map((enigma: Enigma) => {
              const mediaEnigma = scenarioMedia.enigmas.find((e: any) => e.enigma_number === enigma.number);
              return {
                ...enigma,
                good_answer_image: mediaEnigma ? (mediaEnigma.good_answer_image || '') : ''
              };
            });
          }

          // Merge overscore images back with overscore data
          if (scenarioMedia.overscores && loadedConfig.overscores) {
            loadedConfig.overscores = loadedConfig.overscores.map((overscore: Overscore) => {
              const mediaOverscore = scenarioMedia.overscores.find((o: any) => o.overscore_step === overscore.overscore_step);
              return {
                ...overscore,
                image_overscore_step: mediaOverscore ? (mediaOverscore.image_overscore_step || '') : ''
              };
            });
          }
        } else {
          // Old structure: media is in game_meta - values are already filenames or relative paths
          // No URL conversion needed
        }

        setConfig(loadedConfig);
        if (gameMeta.custom_fonts) {
          setCustomFonts(gameMeta.custom_fonts);
        }

        if (data.data?.translations) {
          setTranslations(data.data.translations);
          setAvailableLanguages(data.data.available_languages || ['fr']);
          const defaultLang = data.data.default_language || 'fr';
          setCurrentLanguage(defaultLang);

          // Load description and story for the current language
          const currentTranslation = data.data.translations[defaultLang];
          if (currentTranslation) {
            setScenarioDescription(currentTranslation.description || data.description || '');
            setScenarioStory(currentTranslation.story || '');
          }
        } else {
          // Initialize translations for existing scenarios without translations
          const initialTranslations = {
            fr: {
              title: loadedConfig.title,
              description: data.description || '',
              story: '',
              levels: loadedConfig.levels,
              enigmas: loadedConfig.enigmas?.map((e: Enigma) => ({ number: e.number, text: e.text })) || [],
              overscores: loadedConfig.overscores?.map((o: Overscore) => ({
                overscore_step: o.overscore_step,
                name_overscore_step: o.name_overscore_step
              })) || []
            }
          };
          setTranslations(initialTranslations);
          setAvailableLanguages(['fr']);
          setCurrentLanguage('fr');
          setScenarioDescription(data.description || '');
          setScenarioStory('');
        }
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractFileName = (url: string) => {
    return extractFileNameUtil(url);
  };

  const handleSave = async (incrementVersion: boolean = false) => {
    setSaving(true);
    try {
      // Fetch existing scenario data if we need to check for changes
      let existingData = null;
      if (incrementVersion) {
        const { data: existingScenario } = await supabase
          .from('scenarios')
          .select('data, medias')
          .eq('id', scenarioId)
          .single();
        existingData = existingScenario;
      }

      // Sync current config to translations before saving
      const updatedTranslations = {
        ...translations,
        [currentLanguage]: {
          title: config.title,
          levels: config.levels,
          enigmas: config.enigmas.map(e => ({ number: e.number, text: e.text })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      };

      // Check if data has changed when incrementVersion is requested
      let shouldIncrementVersion = incrementVersion;
      if (incrementVersion && existingData) {
        const hasDataChanged = JSON.stringify(existingData.data) !== JSON.stringify({
          game_meta: config,
          default_language: currentLanguage,
          available_languages: availableLanguages,
          translations: updatedTranslations
        });

        shouldIncrementVersion = hasDataChanged;
        if (!hasDataChanged) {
          console.log('No changes detected, version will not be incremented');
        }
      }

      const updatedConfig = shouldIncrementVersion
        ? { ...config, scenario_version: (parseFloat(config.scenario_version || '1') + 0.1).toFixed(1) }
        : config;

      if (shouldIncrementVersion) {
        setConfig(updatedConfig);
      }

      const configToSave = { ...updatedConfig };

      // Define media fields
      const imageFields = [
        'background_image',
        'game_visual',
        'game_instructions_image',
        'game_instructions_button_image',
        'game_instructions_button_hover_image',
        'game_refresh_button_image',
        'game_refresh_button_hover_image',
        'time_background_image',
        'score_background_image',
        'enigmas_header_image',
        'steps_container_image',
        'top_1_image',
        'top_3_image',
        'top_10_image'
      ];

      const levelImageFields = [
        'levels_gauge_image',
        'levels_gauge_image_with_content',
        'levels_gauge_player_icon_image',
        'levels_gauge_level_icon_image'
      ];

      const soundFields = [
        'enigma_success',
        'enigma_error',
        'enigma_no_answer',
        'top_1_sound',
        'top_3_sound',
        'top_10_sound',
        'final_image_sound'
      ];

      // Build media object with organized structure
      const mediaObject: any = {
        images: {},
        sounds: {},
        videos: {},
        enigmas: [],
        levels: {},
        overscores: []
      };

      // Extract general images
      imageFields.forEach(field => {
        if (configToSave[field as keyof MysteryConfigData]) {
          mediaObject.images[field] = extractFileName(configToSave[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract level images
      levelImageFields.forEach(field => {
        if (configToSave[field as keyof MysteryConfigData]) {
          mediaObject.levels[field] = extractFileName(configToSave[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract sounds
      soundFields.forEach(field => {
        if (configToSave[field as keyof MysteryConfigData]) {
          mediaObject.sounds[field] = extractFileName(configToSave[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract enigma images
      if (configToSave.enigmas) {
        mediaObject.enigmas = configToSave.enigmas.map((enigma: Enigma) => ({
          enigma_number: enigma.number,
          good_answer_image: extractFileName(enigma.good_answer_image)
        }));
      }

      // Extract overscore images
      if (configToSave.overscores) {
        mediaObject.overscores = configToSave.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          image_overscore_step: extractFileName(overscore.image_overscore_step)
        }));
      }

      // Build data object (non-media configuration)
      const configDataCopy = { ...configToSave };

      // Remove media fields from config data
      [...imageFields, ...levelImageFields, ...soundFields].forEach(field => {
        delete configDataCopy[field as keyof MysteryConfigData];
      });

      // Update enigmas to remove image references
      if (configDataCopy.enigmas) {
        configDataCopy.enigmas = configDataCopy.enigmas.map((enigma: Enigma) => ({
          number: enigma.number,
          text: enigma.text,
          good_answer_points: enigma.good_answer_points,
          wrong_answer_points: enigma.wrong_answer_points
        }));
      }

      // Update overscores to remove image references
      if (configDataCopy.overscores) {
        configDataCopy.overscores = configDataCopy.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          overscore_score: overscore.overscore_score,
          name_overscore_step: overscore.name_overscore_step
        }));
      }

      const scenarioData = {
        title: configToSave.title,
        medias: mediaObject,
        data: {
          game_meta: {
            ...configDataCopy,
            custom_fonts: customFonts
          },
          default_language: currentLanguage,
          available_languages: availableLanguages,
          translations: updatedTranslations
        },
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      // Update local state with synced translations
      setTranslations(updatedTranslations);

      console.log('=== SAVING SCENARIO ===');
      console.log('Media object:', JSON.stringify(mediaObject, null, 2));
      console.log('Data.game_meta keys:', Object.keys(configDataCopy));
      console.log('Full scenario data:', JSON.stringify(scenarioData, null, 2));

      const { error } = await supabase
        .from('scenarios')
        .update(scenarioData)
        .eq('id', scenarioId);

      if (error) throw error;

      console.log('=== SAVE SUCCESSFUL ===');

      // Verify what was saved by reading it back
      const { data: savedData, error: readError } = await supabase
        .from('scenarios')
        .select('medias, data')
        .eq('id', scenarioId)
        .maybeSingle();

      if (!readError && savedData) {
        console.log('Verified saved media:', JSON.stringify(savedData.medias, null, 2));
        console.log('Verified saved data.game_meta keys:', Object.keys(savedData.data?.game_meta || {}));
      }

      setAlert({
        type: 'success',
        message: 'Configuration saved successfully!'
      });
    } catch (error) {
      console.error('Error saving config:', error);
      setAlert({
        type: 'error',
        message: 'Failed to save configuration'
      });
    } finally {
      setSaving(false);
    }
  };

  const addCustomFont = () => {
    if (newCustomFont.trim() && !customFonts.includes(newCustomFont.trim())) {
      setCustomFonts([...customFonts, newCustomFont.trim()]);
      setConfig({ ...config, font: newCustomFont.trim() });
      setNewCustomFont('');
      setShowCustomFontInput(false);
    }
  };

  const removeCustomFont = (fontToRemove: string) => {
    setCustomFonts(customFonts.filter(f => f !== fontToRemove));
    if (config.font === fontToRemove) {
      setConfig({ ...config, font: 'Arial' });
    }
  };

  const handleAddLanguage = (languageCode: string) => {
    if (!availableLanguages.includes(languageCode)) {
      setAvailableLanguages([...availableLanguages, languageCode]);
      setTranslations({
        ...translations,
        [languageCode]: {
          title: config.title,
          description: scenarioDescription,
          story: scenarioStory,
          levels: JSON.parse(JSON.stringify(config.levels)),
          enigmas: config.enigmas.map(e => ({ number: e.number, text: e.text })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      });
      setCurrentLanguage(languageCode);
    }
    setShowAddLanguageModal(false);
  };

  const handleRemoveLanguage = (languageCode: string) => {
    if (availableLanguages.length === 1) {
      setAlert({
        type: 'error',
        message: 'Cannot remove the last language'
      });
      return;
    }

    const newAvailableLanguages = availableLanguages.filter(l => l !== languageCode);
    const newTranslations = { ...translations };
    delete newTranslations[languageCode];

    setAvailableLanguages(newAvailableLanguages);
    setTranslations(newTranslations);

    if (currentLanguage === languageCode) {
      setCurrentLanguage(newAvailableLanguages[0]);
    }
  };

  const handleLanguageChange = (languageCode: string) => {
    const currentTranslation = translations[currentLanguage];
    if (currentTranslation) {
      currentTranslation.title = config.title;
      currentTranslation.description = scenarioDescription;
      currentTranslation.story = scenarioStory;
      currentTranslation.levels = config.levels;
      currentTranslation.enigmas = config.enigmas.map(e => ({ number: e.number, text: e.text }));
      currentTranslation.overscores = config.overscores.map(o => ({
        overscore_step: o.overscore_step,
        name_overscore_step: o.name_overscore_step
      }));
    }

    setCurrentLanguage(languageCode);

    const newTranslation = translations[languageCode];
    if (newTranslation) {
      setConfig({
        ...config,
        title: newTranslation.title || config.title,
        levels: newTranslation.levels || config.levels,
        enigmas: config.enigmas.map((e, i) => ({
          ...e,
          text: newTranslation.enigmas[i]?.text || e.text
        })),
        overscores: config.overscores.map((o, i) => ({
          ...o,
          name_overscore_step: newTranslation.overscores?.[i]?.name_overscore_step || o.name_overscore_step
        }))
      });
      setScenarioDescription(newTranslation.description || scenarioDescription);
      setScenarioStory(newTranslation.story || scenarioStory);
    }
  };

  const allFonts = [...predefinedFonts, ...customFonts];

  const updateField = (field: keyof MysteryConfigData, value: string) => {
    setConfig({ ...config, [field]: value });
  };

  const downloadImage = async (imageUrl: string, fieldName: string) => {
    if (!imageUrl) {
      alert('No image URL to download');
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to download image');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fieldName}_${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Make sure the URL is valid and accessible.');
    }
  };

  const downloadAllImages = async () => {
    const imageFields = [
      { url: config.background_image, name: 'background_image' },
      { url: config.game_instructions_image, name: 'game_instructions_image' },
      { url: config.game_instructions_button_image, name: 'game_instructions_button_image' },
      { url: config.game_instructions_button_hover_image, name: 'game_instructions_button_hover_image' },
      { url: config.game_refresh_button_image, name: 'game_refresh_button_image' },
      { url: config.game_refresh_button_hover_image, name: 'game_refresh_button_hover_image' }
    ];

    const imagesToDownload = imageFields.filter(field => field.url);

    if (imagesToDownload.length === 0) {
      alert('No images to download');
      return;
    }

    for (const image of imagesToDownload) {
      await downloadImage(image.url, image.name);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handleZipDownload = async () => {
    console.log('=== Starting zip download process ===');
    setPublishing(true);
    setPublishProgress('Saving configuration...');
    try {
      console.log('Incrementing version and saving...');

      // Sync current config to translations before creating zip
      const updatedTranslations = {
        ...translations,
        [currentLanguage]: {
          title: config.title,
          levels: config.levels,
          enigmas: config.enigmas.map(e => ({ number: e.number, text: e.text })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      };

      const updatedConfig = {
        ...config,
        scenario_version: (parseFloat(config.scenario_version || '1') + 0.1).toFixed(1)
      };
      setConfig(updatedConfig);
      setTranslations(updatedTranslations);

      const cleanedConfig = { ...updatedConfig };

      // Define media fields
      const imageFields = [
        'background_image',
        'game_visual',
        'game_instructions_image',
        'game_instructions_button_image',
        'game_instructions_button_hover_image',
        'game_refresh_button_image',
        'game_refresh_button_hover_image',
        'time_background_image',
        'score_background_image',
        'enigmas_header_image',
        'steps_container_image',
        'top_1_image',
        'top_3_image',
        'top_10_image'
      ];

      const levelImageFields = [
        'levels_gauge_image',
        'levels_gauge_image_with_content',
        'levels_gauge_player_icon_image',
        'levels_gauge_level_icon_image'
      ];

      const soundFields = [
        'enigma_success',
        'enigma_error',
        'enigma_no_answer',
        'top_1_sound',
        'top_3_sound',
        'top_10_sound',
        'final_image_sound'
      ];

      // Build media object with organized structure
      const mediaObject: any = {
        images: {},
        sounds: {},
        videos: {},
        enigmas: [],
        levels: {},
        overscores: []
      };

      // Extract general images
      imageFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.images[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract level images
      levelImageFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.levels[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract sounds
      soundFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.sounds[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract enigma images
      if (cleanedConfig.enigmas) {
        mediaObject.enigmas = cleanedConfig.enigmas.map((enigma: Enigma) => ({
          enigma_number: enigma.number,
          good_answer_image: extractFileName(enigma.good_answer_image)
        }));
      }

      // Extract overscore images
      if (cleanedConfig.overscores) {
        mediaObject.overscores = cleanedConfig.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          image_overscore_step: extractFileName(overscore.image_overscore_step)
        }));
      }

      // Build data object (non-media configuration)
      const configDataCopy = { ...cleanedConfig };

      // Remove media fields from config data
      [...imageFields, ...levelImageFields, ...soundFields].forEach(field => {
        delete configDataCopy[field as keyof MysteryConfigData];
      });

      // Update enigmas to remove image references
      if (configDataCopy.enigmas) {
        configDataCopy.enigmas = configDataCopy.enigmas.map((enigma: Enigma) => ({
          number: enigma.number,
          text: enigma.text,
          good_answer_points: enigma.good_answer_points,
          wrong_answer_points: enigma.wrong_answer_points
        }));
      }

      // Update overscores to remove image references
      if (configDataCopy.overscores) {
        configDataCopy.overscores = configDataCopy.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          overscore_score: overscore.overscore_score,
          name_overscore_step: overscore.name_overscore_step
        }));
      }

      const scenarioData = {
        title: cleanedConfig.title,
        medias: mediaObject,
        data: {
          game_meta: {
            ...configDataCopy,
            custom_fonts: customFonts
          },
          default_language: currentLanguage,
          available_languages: availableLanguages,
          translations: updatedTranslations
        },
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const { error } = await supabase
        .from('scenarios')
        .update(scenarioData)
        .eq('id', scenarioId);

      if (error) throw error;
      console.log('Configuration saved with new version:', updatedConfig.scenario_version);

      setPublishProgress('Creating zip archive...');
      const zip = new JSZip();
      const mediaFolder = zip.folder('media');

      if (!mediaFolder) {
        throw new Error('Failed to create media folder in zip');
      }

      const mediaFileNames = [
        updatedConfig.background_image,
        updatedConfig.game_instructions_image,
        updatedConfig.game_instructions_button_image,
        updatedConfig.game_instructions_button_hover_image,
        updatedConfig.game_refresh_button_image,
        updatedConfig.game_refresh_button_hover_image,
        updatedConfig.enigma_success,
        updatedConfig.enigma_error,
        updatedConfig.enigma_no_answer,
        updatedConfig.top_1_sound,
        updatedConfig.top_3_sound,
        updatedConfig.top_10_sound,
        updatedConfig.final_image_sound
      ].filter(f => f);

      console.log('Found media files:', mediaFileNames.length);
      setPublishProgress(`Downloading ${mediaFileNames.length} media files...`);

      for (const fileName of mediaFileNames) {
        try {
          const url = getMediaUrlUtil(scenarioUniqid || scenarioId, fileName);
          console.log('Fetching media:', fileName);
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            console.log('Adding to zip:', fileName, 'size:', blob.size);
            mediaFolder.file(fileName, blob);
          } else {
            console.warn('Failed to fetch media (status ' + response.status + '):', fileName);
          }
        } catch (error) {
          console.error(`Failed to fetch media file: ${fileName}`, error);
        }
      }

      console.log('All media files processed');
      setPublishProgress('Packaging scenario data...');

      const getRelativeUrl = (url: string) => {
        if (!url) return '';
        const fileName = url.split('/').pop() || '';
        return fileName ? `media/${fileName}` : '';
      };

      const zipScenarioData = {
        scenario: {
          id: scenarioId,
          name: scenarioTitle,
          uniqid: scenarioUniqid,
          scenario_type: scenarioType,
          default_pattern_id: defaultPatternId || null,
          default_pattern_slug: defaultPatternSlug || null
        },
        layout: scenarioLayout,
        game_data: {
          game_meta: {
            font: updatedConfig.font,
            title: updatedConfig.title,
            levels: updatedConfig.levels,
            enigmas: updatedConfig.enigmas.map((e: Enigma) => ({
              text: e.text,
              number: e.number,
              good_answer_points: e.good_answer_points,
              wrong_answer_points: e.wrong_answer_points
            })),
            font_color: updatedConfig.font_color,
            overscores: updatedConfig.overscores.map((o: Overscore) => ({
              overscore_step: o.overscore_step,
              name_overscore_step: o.name_overscore_step
            })),
            game_public: updatedConfig.game_public,
            custom_fonts: customFonts,
            default_time: updatedConfig.default_time,
            game_version: '10.0',
            gauge_filling: updatedConfig.gauge_filling,
            overscore_steps: updatedConfig.overscore_steps,
            score_full_game: updatedConfig.score_full_game,
            level_font_color: updatedConfig.level_font_color,
            scenario_version: updatedConfig.scenario_version,
            number_of_enigmas: updatedConfig.number_of_enigmas,
            default_time_malus: updatedConfig.default_time_malus,
            animation_image_duration: updatedConfig.animation_image_duration,
            animation_enigma_duration: updatedConfig.animation_enigma_duration,
            animation_message_duration: updatedConfig.animation_message_duration
          },
          translations: translations,
          default_language: currentLanguage,
          available_languages: availableLanguages
        },
        medias: {
          images: Object.fromEntries(
            Object.entries({
              game_visual: getRelativeUrl(updatedConfig.game_visual),
              background_image: getRelativeUrl(updatedConfig.background_image),
              game_instructions_image: getRelativeUrl(updatedConfig.game_instructions_image),
              game_refresh_button_image: getRelativeUrl(updatedConfig.game_refresh_button_image),
              game_instructions_button_image: getRelativeUrl(updatedConfig.game_instructions_button_image),
              game_instructions_button_hover_image: getRelativeUrl(updatedConfig.game_instructions_button_hover_image),
              game_refresh_button_hover_image: getRelativeUrl(updatedConfig.game_refresh_button_hover_image),
              levels_gauge_image: getRelativeUrl(updatedConfig.levels_gauge_image),
              levels_gauge_image_with_content: getRelativeUrl(updatedConfig.levels_gauge_image_with_content),
              levels_gauge_player_icon_image: getRelativeUrl(updatedConfig.levels_gauge_player_icon_image),
              levels_gauge_level_icon_image: getRelativeUrl(updatedConfig.levels_gauge_level_icon_image),
              time_background_image: getRelativeUrl(updatedConfig.time_background_image),
              score_background_image: getRelativeUrl(updatedConfig.score_background_image),
              enigmas_header_image: getRelativeUrl(updatedConfig.enigmas_header_image),
              steps_container_image: getRelativeUrl(updatedConfig.steps_container_image),
              top_1_image: getRelativeUrl(updatedConfig.top_1_image),
              top_3_image: getRelativeUrl(updatedConfig.top_3_image),
              top_10_image: getRelativeUrl(updatedConfig.top_10_image)
            }).filter(([_, value]) => value && value !== '')
          ),
          levels: [],
          sounds: [
            ...(updatedConfig.enigma_success ? [{ sound_type: 'enigma_success', sound_file: getRelativeUrl(updatedConfig.enigma_success) }] : []),
            ...(updatedConfig.enigma_error ? [{ sound_type: 'enigma_error', sound_file: getRelativeUrl(updatedConfig.enigma_error) }] : []),
            ...(updatedConfig.enigma_no_answer ? [{ sound_type: 'enigma_no_answer', sound_file: getRelativeUrl(updatedConfig.enigma_no_answer) }] : []),
            ...(updatedConfig.top_1_sound ? [{ sound_type: 'top_1_sound', sound_file: getRelativeUrl(updatedConfig.top_1_sound) }] : []),
            ...(updatedConfig.top_3_sound ? [{ sound_type: 'top_3_sound', sound_file: getRelativeUrl(updatedConfig.top_3_sound) }] : []),
            ...(updatedConfig.top_10_sound ? [{ sound_type: 'top_10_sound', sound_file: getRelativeUrl(updatedConfig.top_10_sound) }] : []),
            ...(updatedConfig.final_image_sound ? [{ sound_type: 'final_image_sound', sound_file: getRelativeUrl(updatedConfig.final_image_sound) }] : [])
          ],
          videos: [],
          enigmas: updatedConfig.enigmas
            .map((e: Enigma) => ({
              enigma_number: e.number,
              good_answer_image: getRelativeUrl(e.good_answer_image)
            }))
            .filter(e => e.good_answer_image && e.good_answer_image !== ''),
          overscores: updatedConfig.overscores
            .map((o: Overscore) => ({
              overscore_step: o.overscore_step,
              image_overscore_step: getRelativeUrl(o.image_overscore_step)
            }))
            .filter(o => o.image_overscore_step && o.image_overscore_step !== '')
        }
      };

      console.log('Adding game-data.json to zip (using relative media URLs)');
      zip.file('game-data.json', JSON.stringify(zipScenarioData, null, 2));

      console.log('Generating zip blob...');
      setPublishProgress('Generating zip file...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipSizeMB = (zipBlob.size / (1024 * 1024)).toFixed(2);
      console.log('Zip blob generated');
      console.log('Zip file size:', zipBlob.size, 'bytes', '(' + zipSizeMB + ' MB)');

      setPublishProgress('Downloading zip file...');
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${scenarioId}_v${updatedConfig.scenario_version}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setPublishing(false);
      setPublishProgress('');
      setAlert({
        type: 'success',
        message: `Scenario "${config.title}" has been zipped and downloaded successfully!`
      });
    } catch (error) {
      console.error('Error creating zip:', error);
      setPublishProgress('');
      setPublishing(false);
      setAlert({
        type: 'error',
        message: 'Failed to create zip file. Check console for details.'
      });
    }
  };

  const updateStep = (index: number, status: 'done' | 'doing' | 'todo', label?: string) => {
    setPublishSteps(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], status, ...(label && { label }) };
      }
      return updated;
    });
  };

  const triggerPublishWithValidation = (publishAsClientFlag: boolean, publishAllMediaFlag: boolean) => {
    const result = validateMysteryConfig(config, scenarioTitle, scenarioDescription);
    if (!result.valid || result.warnings.length > 0) {
      setValidationResult(result);
      setPendingPublishAction(() => () => {
        setValidationResult(null);
        setPendingPublishAction(null);
        setPublishAsClient(publishAsClientFlag);
        setPublishAllMedia(publishAllMediaFlag);
        setShowPublishConfirm(true);
      });
    } else {
      setPublishAsClient(publishAsClientFlag);
      setPublishAllMedia(publishAllMediaFlag);
      setShowPublishConfirm(true);
    }
  };

  const handlePublishConfirm = () => {
    setShowPublishConfirm(false);
    if (publishAsClient) {
      setShowClientEmailModal(true);
    } else {
      const userEmail = authService.getEmail();
      const userClientId = authService.getClientId();
      if (userEmail && userClientId) {
        doPublish(userEmail, userClientId, false);
      } else {
        setAlert({
          type: 'error',
          message: 'Could not retrieve user information. Please try logging in again.'
        });
      }
    }
  };

  const doPublish = async (clientEmail: string, clientId: string, asClient = true) => {
    setShowClientEmailModal(false);
    setShowPublishConfirm(true);
    console.log('=== Starting publish process ===');
    setPublishing(true);
    setPublishProgress('Saving configuration...');

    // Initialize steps
    setPublishSteps([
      { label: 'Save configuration', status: 'doing' },
      { label: 'Publish to Taghunter', status: 'todo' },
      { label: 'Collect media files', status: 'todo' },
      { label: 'Upload media files', status: 'todo' },
    ]);

    try {
      console.log('Checking for changes before publishing...');

      // Fetch existing scenario data
      const { data: existingScenario } = await supabase
        .from('scenarios')
        .select('uniqid, data, medias')
        .eq('id', scenarioId)
        .single();

      // Sync current config to translations before publishing
      const updatedTranslations = {
        ...translations,
        [currentLanguage]: {
          title: config.title,
          levels: config.levels,
          enigmas: config.enigmas.map(e => ({ number: e.number, text: e.text })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      };

      // Check if data has changed by comparing with existing data
      const hasDataChanged = JSON.stringify(existingScenario?.data) !== JSON.stringify({
        game_meta: config,
        default_language: currentLanguage,
        available_languages: availableLanguages,
        translations: updatedTranslations
      }) || JSON.stringify(existingScenario?.medias) !== JSON.stringify({});

      // Only increment version if data has changed
      const updatedConfig = hasDataChanged
        ? {
            ...config,
            scenario_version: (parseFloat(config.scenario_version || '1') + 0.1).toFixed(1)
          }
        : config;

      if (hasDataChanged) {
        console.log('Changes detected, incrementing version to:', updatedConfig.scenario_version);
      } else {
        console.log('No changes detected, keeping version:', updatedConfig.scenario_version);
      }

      setConfig(updatedConfig);
      setTranslations(updatedTranslations);

      let uniqid = existingScenario?.uniqid;
      if (!uniqid) {
        // Generate uniqid similar to PHP uniqid format
        uniqid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      }

      // Clean URLs and separate media from data
      const cleanedConfig = { ...updatedConfig };

      // Define media fields
      const imageFields = [
        'background_image',
        'game_visual',
        'game_instructions_image',
        'game_instructions_button_image',
        'game_instructions_button_hover_image',
        'game_refresh_button_image',
        'game_refresh_button_hover_image',
        'time_background_image',
        'score_background_image',
        'enigmas_header_image',
        'steps_container_image',
        'top_1_image',
        'top_3_image',
        'top_10_image'
      ];

      const levelImageFields = [
        'levels_gauge_image',
        'levels_gauge_image_with_content',
        'levels_gauge_player_icon_image',
        'levels_gauge_level_icon_image'
      ];

      const soundFields = [
        'enigma_success',
        'enigma_error',
        'enigma_no_answer',
        'top_1_sound',
        'top_3_sound',
        'top_10_sound',
        'final_image_sound'
      ];

      // Build media object with organized structure
      const mediaObject: any = {
        images: {},
        sounds: {},
        videos: {},
        enigmas: [],
        levels: {},
        overscores: []
      };

      // Extract general images
      imageFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.images[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract level images
      levelImageFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.levels[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract sounds
      soundFields.forEach(field => {
        if (cleanedConfig[field as keyof MysteryConfigData]) {
          mediaObject.sounds[field] = extractFileName(cleanedConfig[field as keyof MysteryConfigData] as string);
        }
      });

      // Extract enigma images
      if (cleanedConfig.enigmas) {
        mediaObject.enigmas = cleanedConfig.enigmas.map((enigma: Enigma, index: number) => ({
          enigma_number: enigma.number,
          good_answer_image: extractFileName(enigma.good_answer_image)
        }));
      }

      // Extract overscore images
      if (cleanedConfig.overscores) {
        mediaObject.overscores = cleanedConfig.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          image_overscore_step: extractFileName(overscore.image_overscore_step)
        }));
      }

      // Build data object (non-media configuration)
      const configDataCopy = { ...cleanedConfig };

      // Remove media fields from config data
      [...imageFields, ...levelImageFields, ...soundFields].forEach(field => {
        delete configDataCopy[field as keyof MysteryConfigData];
      });

      // Update enigmas to remove image references
      if (configDataCopy.enigmas) {
        configDataCopy.enigmas = configDataCopy.enigmas.map((enigma: Enigma) => ({
          number: enigma.number,
          text: enigma.text,
          good_answer_points: enigma.good_answer_points,
          wrong_answer_points: enigma.wrong_answer_points
        }));
      }

      // Update overscores to remove image references
      if (configDataCopy.overscores) {
        configDataCopy.overscores = configDataCopy.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          overscore_score: overscore.overscore_score,
          name_overscore_step: overscore.name_overscore_step
        }));
      }

      const scenarioData = {
        title: cleanedConfig.title,
        uniqid: uniqid,
        medias: mediaObject,
        data: {
          game_meta: {
            ...configDataCopy,
            custom_fonts: customFonts
          },
          default_language: currentLanguage,
          available_languages: availableLanguages,
          translations: updatedTranslations
        },
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const { error } = await supabase
        .from('scenarios')
        .update(scenarioData)
        .eq('id', scenarioId);

      if (error) throw error;
      console.log('Configuration saved with new version:', updatedConfig.scenario_version);

      // Fetch the complete data column from the database
      const { data: completeScenario, error: fetchError } = await supabase
        .from('scenarios')
        .select('data, medias, scenario_layout')
        .eq('id', scenarioId)
        .single();

      if (fetchError) throw fetchError;
      console.log('Fetched complete scenario data from database:', completeScenario);

      // Mark step 0 as done
      updateStep(0, 'done');
      updateStep(1, 'doing');

      console.log('Using client email:', clientEmail);
      console.log('Using client ID from check-client:', clientId);
      const isAdmin = authService.isAdmin();
      console.log('Is Admin:', isAdmin);
      console.log('As Client:', asClient);

      setPublishProgress('Publishing to Taghunter...');

      console.log('Sending request to Taghunter server via edge function...');
      console.log('Complete data column being sent:', completeScenario.data);
      console.log('Complete media column being sent:', completeScenario.medias);
      console.log('Complete scenario_layout column being sent:', completeScenario.scenario_layout);
      const apiUrl = `${API_BASE_URL}/scenarios.php?action=create`;
      const authHeaders = authService.getAuthHeaders() as Record<string, string>;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          ...(authHeaders.Authorization ? { 'Authorization': authHeaders.Authorization } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: clientEmail,
          client_id: clientId,
          is_admin: isAdmin && !asClient ? '1' : '0',
          uniqid: uniqid,
          status: scenarioStatus,
          title: scenarioTitle || config.title || 'Untitled Scenario',
          description: scenarioDescription || config.title || 'No description provided',
          game_type: gameType,
          scenario_type: scenarioType,
          data: completeScenario.data,
          medias: completeScenario.medias,
          scenario_layout: completeScenario.scenario_layout
        })
      });

      console.log('Publish response status:', response.status);
      console.log('Publish response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('Publish response body:', responseText);

      if (!response.ok) {
        throw new Error(`Failed to publish scenario (${response.status}): ${responseText}`);
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
        console.log('Publish response data:', responseData);
      } catch (e) {
        console.log('Response is not JSON');
        throw new Error('Invalid response from server');
      }

      if (!responseData.success || !responseData.data) {
        throw new Error('Failed to create scenario on server');
      }

      const serverUniqid = responseData.data.uniqid;
      console.log('Scenario created on server with uniqid:', serverUniqid);

      // Mark step 1 as done
      updateStep(1, 'done');
      updateStep(2, 'doing');

      // Collect all media files that need to be uploaded
      setPublishProgress('Collecting media files...');
      const mediaToUpload: { fieldName: string; url: string; fileName: string }[] = [];

      // Define all media fields
      const mediaFields: (keyof MysteryConfigData)[] = [
        'background_image',
        'game_visual',
        'game_instructions_image',
        'game_instructions_button_image',
        'game_instructions_button_hover_image',
        'game_refresh_button_image',
        'game_refresh_button_hover_image',
        'levels_gauge_image',
        'levels_gauge_image_with_content',
        'levels_gauge_player_icon_image',
        'levels_gauge_level_icon_image',
        'time_background_image',
        'score_background_image',
        'enigmas_header_image',
        'steps_container_image',
        'top_1_image',
        'top_3_image',
        'top_10_image',
        'enigma_success',
        'enigma_error',
        'enigma_no_answer',
        'top_1_sound',
        'top_3_sound',
        'top_10_sound',
        'final_image_sound'
      ];

      // Collect main config media
      mediaFields.forEach(field => {
        const fileName = updatedConfig[field];
        if (fileName && typeof fileName === 'string' && fileName.trim()) {
          mediaToUpload.push({
            fieldName: field,
            url: getMediaUrlUtil(scenarioUniqid || scenarioId, fileName),
            fileName: fileName
          });
        }
      });

      // Collect enigma images
      if (updatedConfig.enigmas) {
        updatedConfig.enigmas.forEach((enigma: Enigma, index: number) => {
          if (enigma.good_answer_image) {
            mediaToUpload.push({
              fieldName: `enigma_${index}_image`,
              url: getMediaUrlUtil(scenarioUniqid || scenarioId, enigma.good_answer_image),
              fileName: enigma.good_answer_image
            });
          }
        });
      }

      // Collect overscore images
      if (updatedConfig.overscores) {
        updatedConfig.overscores.forEach((overscore: Overscore, index: number) => {
          if (overscore.image_overscore_step) {
            mediaToUpload.push({
              fieldName: `overscore_${index}_image`,
              url: getMediaUrlUtil(scenarioUniqid || scenarioId, overscore.image_overscore_step),
              fileName: overscore.image_overscore_step
            });
          }
          if (overscore.steps_container_image) {
            mediaToUpload.push({
              fieldName: `overscore_${index}_steps_container`,
              url: getMediaUrlUtil(scenarioUniqid || scenarioId, overscore.steps_container_image),
              fileName: overscore.steps_container_image
            });
          }
        });
      }

      // Remove duplicates
      const uniqueMedia = mediaToUpload.filter((item, index, self) =>
        index === self.findIndex((t) => t.fileName === item.fileName)
      );

      console.log(`Found ${uniqueMedia.length} unique media files to upload`);

      // Mark step 2 as done
      updateStep(2, 'done');

      // Check which media files have already been uploaded (unless publishing all)
      let mediaToUploadFiltered = uniqueMedia;
      let alreadyUploadedCount = 0;

      if (!publishAllMedia) {
        const alreadyUploadedFileNames = getUploadedFilenames(scenarioUniqid || scenarioId);
        mediaToUploadFiltered = uniqueMedia.filter(
          media => !alreadyUploadedFileNames.has(media.fileName)
        );
        alreadyUploadedCount = uniqueMedia.length - mediaToUploadFiltered.length;
        console.log(`${alreadyUploadedCount} files already uploaded, ${mediaToUploadFiltered.length} new files to upload`);
      } else {
        console.log('Publishing all media files (forced), uploading all ' + uniqueMedia.length + ' files');
      }

      updateStep(3, 'doing', `Upload media files (0/${mediaToUploadFiltered.length})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} already uploaded` : ''}`);

      // Upload media files one by one
      if (mediaToUploadFiltered.length > 0) {
        for (let i = 0; i < mediaToUploadFiltered.length; i++) {
          const media = mediaToUploadFiltered[i];
          updateStep(3, 'doing', `Upload media files (${i + 1}/${mediaToUploadFiltered.length})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} already uploaded` : ''}`);
          setPublishProgress(`Uploading media ${i + 1}/${mediaToUploadFiltered.length}: ${media.fileName}...`);
          console.log(`Uploading ${media.fileName}...`);

          try {
            // Download from Supabase storage
            const storagePath = `${scenarioUniqid || scenarioId}/${media.fileName}`;
            console.log(`Downloading from storage: ${storagePath}`);
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('game-media')
              .download(storagePath);

            if (downloadError) {
              console.error(`Failed to download ${media.fileName} from ${storagePath}:`, downloadError);
              continue;
            }

            console.log(`Successfully downloaded ${media.fileName}, size: ${fileData.size} bytes`);

            const uploadApiUrl = `${API_BASE_URL}/scenarios.php?action=upload_media`;
            console.log(`Calling upload_media endpoint: ${uploadApiUrl}`);
            const formData = new FormData();
            formData.append('file', fileData, media.fileName);
            formData.append('uniqid', serverUniqid);
            formData.append('email', clientEmail);

            const uploadHeaders = authService.getAuthHeaders() as Record<string, string>;
            const uploadResponse = await fetch(uploadApiUrl, {
              method: 'POST',
              headers: uploadHeaders.Authorization
                ? { 'Authorization': uploadHeaders.Authorization }
                : {},
              body: formData
            });

            console.log(`Upload response status: ${uploadResponse.status}`);

            const uploadResultText = await uploadResponse.text();
            let uploadResult;
            try {
              uploadResult = JSON.parse(uploadResultText);
            } catch (e) {
              console.error(`Failed to parse upload response for ${media.fileName}:`, uploadResultText);
              continue;
            }

            if (!uploadResponse.ok || !uploadResult.success) {
              console.error(`Failed to upload ${media.fileName} (${uploadResponse.status}):`, uploadResult.error || uploadResultText);
              continue;
            }

            console.log(`Successfully uploaded ${media.fileName}:`, uploadResult);
            markUploaded(scenarioUniqid || scenarioId, media.fileName);
          } catch (uploadError) {
            console.error(`Error uploading ${media.fileName}:`, uploadError);
          }
        }
      } else {
        // No media files to upload
        updateStep(2, 'done');
        updateStep(3, 'done', 'Upload media files (0/0)');
      }

      // Mark final step as done
      const totalCount = alreadyUploadedCount + mediaToUploadFiltered.length;
      updateStep(3, 'done', `Upload media files (${totalCount}/${totalCount})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} skipped` : ''}`);

      setShowPublishConfirm(false);
      setPublishProgress('');
      setPublishSteps([]);
      setPublishAllMedia(false);

      const successMessage = publishAllMedia
        ? `Scenario "${config.title}" has been successfully published! All ${mediaToUploadFiltered.length} media files were uploaded.`
        : (alreadyUploadedCount > 0
          ? `Scenario "${config.title}" has been successfully published! ${mediaToUploadFiltered.length} new media files uploaded, ${alreadyUploadedCount} files skipped (already uploaded).`
          : `Scenario "${config.title}" has been successfully published with ${mediaToUploadFiltered.length} media files!`);

      setAlert({
        type: 'success',
        message: successMessage
      });
    } catch (error) {
      console.error('Error publishing scenario:', error);
      setPublishProgress('');
      setPublishSteps([]);
      setPublishAllMedia(false);
      setAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred while publishing'
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleImageDrop = async (e: React.DragEvent, fieldName: keyof MysteryConfigData) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (!imageFile) {
      alert('Please drop an image file');
      return;
    }

    await uploadFile(imageFile, fieldName);
  };

  const handleSoundDrop = async (e: React.DragEvent, fieldName: keyof MysteryConfigData) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const soundFile = files.find(file => file.type.startsWith('audio/'));

    if (!soundFile) {
      alert('Please drop an audio file');
      return;
    }

    await uploadFile(soundFile, fieldName);
  };

  const uploadFile = async (file: File, fieldName: keyof MysteryConfigData) => {
    setUploadingField(fieldName);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${fieldName}_${Date.now()}.${fileExt}`;
      const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('game-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      updateField(fieldName, fileName);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file');
    } finally {
      setUploadingField(null);
    }
  };

  const deleteFile = async (fieldName: keyof MysteryConfigData) => {
    const fileName = config[fieldName] as string;
    if (!fileName) return;

    try {
      const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;

      const { error } = await supabase.storage
        .from('game-media')
        .remove([filePath]);

      if (error) throw error;

      updateField(fieldName, '');
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const uploadEnigmaImage = async (file: File, enigmaIndex: number) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `enigma_${enigmaIndex}_${Date.now()}.${fileExt}`;
      const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('game-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      updateEnigma(enigmaIndex, 'good_answer_image', fileName);
    } catch (error) {
      console.error('Error uploading enigma image:', error);
      alert('Failed to upload enigma image');
    }
  };

  const handleImageDragOver = (e: React.DragEvent, fieldName?: keyof MysteryConfigData) => {
    e.preventDefault();
    e.stopPropagation();
    if (fieldName && dragOverField !== fieldName) {
      setDragOverField(fieldName);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);
  };

  const handleImageClick = (fieldName: keyof MysteryConfigData) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadFile(file, fieldName);
      }
    };
    input.click();
  };

  const handleSoundClick = (fieldName: keyof MysteryConfigData) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadFile(file, fieldName);
      }
    };
    input.click();
  };

  const handleFontFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const fontFile = files.find(file =>
      file.type.includes('font') ||
      file.name.endsWith('.ttf') ||
      file.name.endsWith('.otf') ||
      file.name.endsWith('.woff') ||
      file.name.endsWith('.woff2')
    );

    if (!fontFile) {
      alert('Please drop a font file (.ttf, .otf, .woff, .woff2)');
      return;
    }

    const fontName = fontFile.name.replace(/\.[^/.]+$/, '');

    const reader = new FileReader();
    reader.onload = () => {
      const base64Font = reader.result as string;
      const fontFace = new FontFace(fontName, `url(${base64Font})`);

      fontFace.load().then(() => {
        document.fonts.add(fontFace);

        if (!customFonts.includes(fontName)) {
          setCustomFonts([...customFonts, fontName]);
        }
        setConfig({ ...config, font: fontName });
        alert(`Font "${fontName}" loaded successfully!`);
      }).catch(() => {
        alert('Failed to load font file');
      });
    };
    reader.readAsDataURL(fontFile);
  };

  const handleFontDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const addLevel = () => {
    const levelKeys = Object.keys(config.levels).map(Number).filter(n => !isNaN(n));
    const nextKey = levelKeys.length > 0 ? Math.max(...levelKeys) + 1 : 1;

    setConfig({
      ...config,
      levels: {
        ...config.levels,
        [nextKey]: {
          points: '0',
          name: '',
          description: ''
        }
      }
    });
  };

  const removeLevel = (key: string) => {
    const newLevels = { ...config.levels };
    delete newLevels[key];
    setConfig({ ...config, levels: newLevels });
  };

  const updateLevel = (key: string, field: keyof Level, value: string) => {
    setConfig({
      ...config,
      levels: {
        ...config.levels,
        [key]: {
          ...config.levels[key],
          [field]: value
        }
      }
    });
  };

  const addEnigma = () => {
    const nextNumber = config.enigmas.length > 0
      ? (Math.max(...config.enigmas.map(e => parseInt(e.number))) + 1).toString()
      : '1';

    setConfig({
      ...config,
      enigmas: [
        ...config.enigmas,
        {
          number: nextNumber,
          text: '',
          good_answer_image: '',
          good_answer_points: '10',
          wrong_answer_points: '5'
        }
      ]
    });
  };

  const removeEnigma = (index: number) => {
    setConfig({
      ...config,
      enigmas: config.enigmas.filter((_, i) => i !== index)
    });
  };

  const updateEnigma = (index: number, field: keyof Enigma, value: string) => {
    const newEnigmas = [...config.enigmas];
    newEnigmas[index] = {
      ...newEnigmas[index],
      [field]: value
    };
    setConfig({ ...config, enigmas: newEnigmas });
  };

  const addOverscore = () => {
    const nextStep = (config.overscores.length + 1).toString();

    setConfig({
      ...config,
      overscores: [
        ...config.overscores,
        {
          overscore_step: nextStep,
          overscore_score: '0',
          name_overscore_step: '',
          image_overscore_step: ''
        }
      ]
    });
  };

  const removeOverscore = (index: number) => {
    const newOverscores = config.overscores.filter((_, i) => i !== index);
    newOverscores.forEach((overscore, i) => {
      overscore.overscore_step = (i + 1).toString();
    });
    setConfig({
      ...config,
      overscores: newOverscores
    });
  };

  const updateOverscore = (index: number, field: keyof Overscore, value: string) => {
    const newOverscores = [...config.overscores];
    newOverscores[index] = {
      ...newOverscores[index],
      [field]: value
    };
    setConfig({ ...config, overscores: newOverscores });
  };

  const toggleSection = (sectionName: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const navigationSections = [
    { id: 'basic', label: 'Basic Settings' },
    { id: 'scenario_setting', label: 'Scenario Setting' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'levels', label: 'Levels' },
    { id: 'overscores', label: 'Overscores' },
    { id: 'enigmas', label: 'Enigmas' },
    { id: 'actions', label: 'Save & Publish' }
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleEnigmaDragStart = (index: number) => {
    setDraggedEnigmaIndex(index);
  };

  const handleEnigmaDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedEnigmaIndex === null || draggedEnigmaIndex === index) return;

    const newEnigmas = [...config.enigmas];
    const draggedItem = newEnigmas[draggedEnigmaIndex];
    newEnigmas.splice(draggedEnigmaIndex, 1);
    newEnigmas.splice(index, 0, draggedItem);

    newEnigmas.forEach((enigma, i) => {
      enigma.number = (i + 1).toString();
    });

    setConfig({ ...config, enigmas: newEnigmas });
    setDraggedEnigmaIndex(index);
  };

  const handleEnigmaDragEnd = () => {
    setDraggedEnigmaIndex(null);
  };

  const handleLevelDragStart = (levelKey: string) => {
    setDraggedLevelKey(levelKey);
  };

  const handleLevelDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (draggedLevelKey === null || draggedLevelKey === targetKey) return;

    const levelKeys = Object.keys(config.levels).sort((a, b) => parseInt(a) - parseInt(b));
    const draggedIndex = levelKeys.indexOf(draggedLevelKey);
    const targetIndex = levelKeys.indexOf(targetKey);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the keys
    const reorderedKeys = [...levelKeys];
    reorderedKeys.splice(draggedIndex, 1);
    reorderedKeys.splice(targetIndex, 0, draggedLevelKey);

    // Create new levels object with renumbered keys
    const newLevels: Record<string, Level> = {};
    reorderedKeys.forEach((oldKey, index) => {
      const newKey = (index + 1).toString();
      newLevels[newKey] = config.levels[oldKey];
    });

    setConfig({ ...config, levels: newLevels });

    // Update dragged key to its new position
    const newDraggedKey = (targetIndex + 1).toString();
    setDraggedLevelKey(newDraggedKey);
  };

  const handleLevelDragEnd = () => {
    setDraggedLevelKey(null);
  };

  const handleOverscoreDragStart = (index: number) => {
    setDraggedOverscoreIndex(index);
  };

  const handleOverscoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedOverscoreIndex === null || draggedOverscoreIndex === index) return;

    const newOverscores = [...config.overscores];
    const draggedItem = newOverscores[draggedOverscoreIndex];
    newOverscores.splice(draggedOverscoreIndex, 1);
    newOverscores.splice(index, 0, draggedItem);

    newOverscores.forEach((overscore, i) => {
      overscore.overscore_step = (i + 1).toString();
    });

    setConfig({ ...config, overscores: newOverscores });
    setDraggedOverscoreIndex(index);
  };

  const handleOverscoreDragEnd = () => {
    setDraggedOverscoreIndex(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-white">Mystery Game Configuration</h2>
            <p className="text-slate-400 text-sm mt-1">{config.title}</p>
          </div>
        </div>
        <button
          onClick={onOpenLayoutEditor}
          disabled={saving || publishing}
          className="px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Layout size={18} />
          Layout Editor
        </button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 space-y-6">
        <LanguageSelector
          availableLanguages={availableLanguages}
          currentLanguage={currentLanguage}
          onLanguageChange={handleLanguageChange}
          onAddLanguage={() => setShowAddLanguageModal(true)}
          onRemoveLanguage={handleRemoveLanguage}
        />

        <div id="basic" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('basic')}
          >
            <h3 className="text-xl font-semibold text-white">Basic Settings</h3>
            {collapsedSections['basic'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['basic'] && (
          <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                Title
                <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                  {currentLanguage.toUpperCase()}
                </span>
              </label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Game Public
              </label>
              <select
                value={config.game_public}
                onChange={(e) => updateField('game_public', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="mini_kids">Mini Kids</option>
                <option value="kids">Kids</option>
                <option value="ado_adultes">Ado/Adultes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Game Version
              </label>
              <input
                type="text"
                value={config.scenario_version}
                onChange={(e) => updateField('scenario_version', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          </div>
          )}
        </div>

        <div id="scenario_setting" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('scenario_setting')}
          >
            <h3 className="text-xl font-semibold text-white">Scenario Setting</h3>
            {collapsedSections['scenario_setting'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['scenario_setting'] && (
          <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Font
              </label>
              <div className="flex gap-2">
                <select
                  value={config.font}
                  onChange={(e) => updateField('font', e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {allFonts.map(font => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowCustomFontInput(!showCustomFontInput)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  title="Add custom font"
                >
                  <Plus size={18} />
                </button>
              </div>

              {showCustomFontInput && (
                <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded-lg">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newCustomFont}
                      onChange={(e) => setNewCustomFont(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addCustomFont()}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter font name"
                    />
                    <button
                      onClick={addCustomFont}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomFontInput(false);
                        setNewCustomFont('');
                      }}
                      className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition"
                    >
                      Cancel
                    </button>
                  </div>
                  <div
                    className="mt-3 p-6 bg-slate-800 border-2 border-dashed border-slate-600 rounded-lg text-center hover:border-blue-400 transition cursor-pointer"
                    onDrop={handleFontFileDrop}
                    onDragOver={handleFontDragOver}
                  >
                    <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">
                      Drag & drop a font file here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports .ttf, .otf, .woff, .woff2
                    </p>
                  </div>
                  {customFonts.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-400 mb-2">Custom fonts:</p>
                      <div className="flex flex-wrap gap-2">
                        {customFonts.map(font => (
                          <div
                            key={font}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                          >
                            <span>{font}</span>
                            <button
                              onClick={() => removeCustomFont(font)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Font Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={config.font_color}
                  onChange={(e) => updateField('font_color', e.target.value)}
                  className="h-10 w-16 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={config.font_color}
                  onChange={(e) => updateField('font_color', e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Level Font Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={config.level_font_color}
                  onChange={(e) => updateField('level_font_color', e.target.value)}
                  className="h-10 w-16 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={config.level_font_color}
                  onChange={(e) => updateField('level_font_color', e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Points Units
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="by_points"
                    checked={config.points_units === 'by_points'}
                    onChange={(e) => updateField('points_units', e.target.value)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-white">By Points</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="by_percentage"
                    checked={config.points_units === 'by_percentage'}
                    onChange={(e) => updateField('points_units', e.target.value)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-white">By Percentage</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Gauge Filling Gradient
              </label>
              <div className="space-y-3">
                <div
                  className="w-full h-16 rounded-lg border border-slate-700"
                  style={{ background: config.gauge_filling }}
                />
                <input
                  type="text"
                  value={config.gauge_filling}
                  onChange={(e) => updateField('gauge_filling', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
                  placeholder="e.g., linear-gradient(90deg, #ff0000 0%, #00ff00 100%)"
                />
              </div>
            </div>
          </div>
          </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('story')}
          >
            <h3 className="text-xl font-semibold text-white">Story</h3>
            {collapsedSections['story'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['story'] && (
          <div className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                Description
                <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                  {currentLanguage.toUpperCase()}
                </span>
              </label>
              <textarea
                value={scenarioDescription}
                onChange={(e) => setScenarioDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="Enter scenario description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                Story
                <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                  {currentLanguage.toUpperCase()}
                </span>
              </label>
              <textarea
                value={scenarioStory}
                onChange={(e) => setScenarioStory(e.target.value)}
                rows={6}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="Enter the game story"
              />
            </div>
          </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('timing')}
          >
            <h3 className="text-xl font-semibold text-white">Timing & Animation</h3>
            {collapsedSections['timing'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['timing'] && (
          <div className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Time (seconds)
              </label>
              <input
                type="number"
                value={config.default_time}
                onChange={(e) => updateField('default_time', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default Time Malus
              </label>
              <input
                type="number"
                value={config.default_time_malus}
                onChange={(e) => updateField('default_time_malus', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Animation Image Duration (seconds)
              </label>
              <input
                type="number"
                value={config.animation_image_duration}
                onChange={(e) => updateField('animation_image_duration', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Animation Enigma Duration (seconds)
              </label>
              <input
                type="number"
                value={config.animation_enigma_duration}
                onChange={(e) => updateField('animation_enigma_duration', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Animation Message Duration (seconds)
              </label>
              <input
                type="number"
                value={config.animation_message_duration}
                onChange={(e) => updateField('animation_message_duration', e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleSection('images')}>
              <h3 className="text-xl font-semibold text-white">Images</h3>
              {collapsedSections['images'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
            </div>
            <button
              onClick={downloadAllImages}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              title="Download all images"
            >
              <Download size={18} />
              Download All Images
            </button>
          </div>

          {!collapsedSections['images'] && (
          <div className="p-6 space-y-6">

            {/* Background Image & Game Visual */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Background Image */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Background Image
                </label>
                {config.background_image ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                      <img
                        src={getMediaUrl(config.background_image)}
                        alt="Background"
                        className="w-full h-48 object-cover"
                      />
                      <button
                        onClick={() => deleteFile('background_image')}
                        className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        title="Delete image"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ) : uploadingField === 'background_image' ? (
                  <div className="border-2 border-dashed border-blue-500 rounded-lg p-8 text-center bg-slate-900">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-sm text-blue-400">Uploading...</p>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 ${
                      dragOverField === 'background_image'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-blue-400'
                    }`}
                    onDrop={(e) => handleImageDrop(e, 'background_image')}
                    onDragOver={(e) => handleImageDragOver(e, 'background_image')}
                    onDragLeave={handleDragLeave}
                    onClick={() => handleImageClick('background_image')}
                  >
                    <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">Drag & drop or click to select</p>
                  </div>
                )}
              </div>

              {/* Game Visual */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Game Visual
                </label>
                {config.game_visual ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                      <img
                        src={getMediaUrl(config.game_visual)}
                        alt="Game Visual"
                        className="w-full h-48 object-cover"
                      />
                      <button
                        onClick={() => deleteFile('game_visual')}
                        className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        title="Delete image"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ) : uploadingField === 'game_visual' ? (
                  <div className="border-2 border-dashed border-blue-500 rounded-lg p-8 text-center bg-slate-900">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-sm text-blue-400">Uploading...</p>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 ${
                      dragOverField === 'game_visual'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-blue-400'
                    }`}
                    onDrop={(e) => handleImageDrop(e, 'game_visual')}
                    onDragOver={(e) => handleImageDragOver(e, 'game_visual')}
                    onDragLeave={handleDragLeave}
                    onClick={() => handleImageClick('game_visual')}
                  >
                    <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-400">Drag & drop or click to select</p>
                  </div>
                )}
              </div>
            </div>

            {/* Instructions & Refresh Subsection */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-4">Instructions & Refresh Buttons</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Game Instructions Image
              </label>
              {config.game_instructions_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.game_instructions_image)}
                      alt="Game Instructions"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('game_instructions_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'game_instructions_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Instructions Button Image
              </label>
              {config.game_instructions_button_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.game_instructions_button_image)}
                      alt="Instructions Button"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('game_instructions_button_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'game_instructions_button_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Instructions Button Hover Image
              </label>
              {config.game_instructions_button_hover_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.game_instructions_button_hover_image)}
                      alt="Instructions Button Hover"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('game_instructions_button_hover_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'game_instructions_button_hover_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Refresh Button Image
              </label>
              {config.game_refresh_button_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.game_refresh_button_image)}
                      alt="Refresh Button"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('game_refresh_button_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'game_refresh_button_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Refresh Button Hover Image
              </label>
              {config.game_refresh_button_hover_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.game_refresh_button_hover_image)}
                      alt="Refresh Button Hover"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('game_refresh_button_hover_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'game_refresh_button_hover_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>
              </div>
            </div>

            {/* Levels Subsection */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-4">Levels</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Levels Gauge Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Levels Gauge Image
              </label>
              {config.levels_gauge_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.levels_gauge_image)}
                      alt="Levels Gauge"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('levels_gauge_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'levels_gauge_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Levels Gauge Image with Content */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Levels Gauge Image with Content
              </label>
              {config.levels_gauge_image_with_content ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.levels_gauge_image_with_content)}
                      alt="Levels Gauge with Content"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('levels_gauge_image_with_content')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'levels_gauge_image_with_content')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Levels Gauge Player Icon */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Levels Gauge Player Icon
              </label>
              {config.levels_gauge_player_icon_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.levels_gauge_player_icon_image)}
                      alt="Player Icon"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('levels_gauge_player_icon_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'levels_gauge_player_icon_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Levels Gauge Level Icon */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Levels Gauge Level Icon
              </label>
              {config.levels_gauge_level_icon_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.levels_gauge_level_icon_image)}
                      alt="Level Icon"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('levels_gauge_level_icon_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'levels_gauge_level_icon_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>
              </div>
            </div>

            {/* Time, Score, Enigmas Header, Steps Subsection */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-4">Time, Score, Enigmas & Steps</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Time Background Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Time Background Image
              </label>
              {config.time_background_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.time_background_image)}
                      alt="Time Background"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('time_background_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'time_background_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Score Background Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Score Background Image
              </label>
              {config.score_background_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.score_background_image)}
                      alt="Score Background"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('score_background_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'score_background_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Enigmas Header Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Enigmas Header Image
              </label>
              {config.enigmas_header_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.enigmas_header_image)}
                      alt="Enigmas Header"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('enigmas_header_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'enigmas_header_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Steps Container Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Steps Container Image
              </label>
              {config.steps_container_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.steps_container_image)}
                      alt="Steps Container"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('steps_container_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'steps_container_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>
              </div>
            </div>

            {/* Ranking Subsection */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-lg font-semibold text-white mb-4">Ranking</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top 1 Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 1 Image
              </label>
              {config.top_1_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.top_1_image)}
                      alt="Top 1"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('top_1_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'top_1_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Top 3 Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 3 Image
              </label>
              {config.top_3_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.top_3_image)}
                      alt="Top 3"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('top_3_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'top_3_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Top 10 Image */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 10 Image
              </label>
              {config.top_10_image ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                    <img
                      src={getMediaUrl(config.top_10_image)}
                      alt="Top 10"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => deleteFile('top_10_image')}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                      title="Delete image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleImageDrop(e, 'top_10_image')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop image here</p>
                </div>
              )}
            </div>

            {/* Top 1 Sound */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 1 Sound
              </label>
              {config.top_1_sound ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                    <audio controls className="w-full mb-2">
                      <source src={getMediaUrl(config.top_1_sound)} />
                      Your browser does not support the audio element.
                    </audio>
                    <button
                      onClick={() => deleteFile('top_1_sound')}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                      title="Delete sound"
                    >
                      <Trash2 size={18} />
                      Delete Sound
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleSoundDrop(e, 'top_1_sound')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                </div>
              )}
            </div>

            {/* Top 3 Sound */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 3 Sound
              </label>
              {config.top_3_sound ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                    <audio controls className="w-full mb-2">
                      <source src={getMediaUrl(config.top_3_sound)} />
                      Your browser does not support the audio element.
                    </audio>
                    <button
                      onClick={() => deleteFile('top_3_sound')}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                      title="Delete sound"
                    >
                      <Trash2 size={18} />
                      Delete Sound
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleSoundDrop(e, 'top_3_sound')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                </div>
              )}
            </div>

            {/* Top 10 Sound */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Top 10 Sound
              </label>
              {config.top_10_sound ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                    <audio controls className="w-full mb-2">
                      <source src={config.top_10_sound} />
                      Your browser does not support the audio element.
                    </audio>
                    <button
                      onClick={() => deleteFile('top_10_sound')}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                      title="Delete sound"
                    >
                      <Trash2 size={18} />
                      Delete Sound
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleSoundDrop(e, 'top_10_sound')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                </div>
              )}
            </div>
              </div>
            </div>

          </div>
          )}
        </div>

        <div id="sounds" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('sounds')}
          >
            <h3 className="text-xl font-semibold text-white">Sounds</h3>
            {collapsedSections['sounds'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['sounds'] && (
          <div className="px-6 pb-6">
            {/* Enigma Config Subsection */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 mb-4">
              <h4 className="text-lg font-semibold text-white mb-4">Enigma Config</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Enigma Success Sound
                  </label>
                  {config.enigma_success ? (
                    <div className="space-y-2">
                      <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                        <audio controls className="w-full mb-2">
                          <source src={getMediaUrl(config.enigma_success)} />
                          Your browser does not support the audio element.
                        </audio>
                        <button
                          onClick={() => deleteFile('enigma_success')}
                          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                          title="Delete sound"
                        >
                          <Trash2 size={18} />
                          Delete Sound
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                      onDrop={(e) => handleSoundDrop(e, 'enigma_success')}
                      onDragOver={handleImageDragOver}
                    >
                      <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Enigma Error Sound
                  </label>
                  {config.enigma_error ? (
                    <div className="space-y-2">
                      <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                        <audio controls className="w-full mb-2">
                          <source src={getMediaUrl(config.enigma_error)} />
                          Your browser does not support the audio element.
                        </audio>
                        <button
                          onClick={() => deleteFile('enigma_error')}
                          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                          title="Delete sound"
                        >
                          <Trash2 size={18} />
                          Delete Sound
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                      onDrop={(e) => handleSoundDrop(e, 'enigma_error')}
                      onDragOver={handleImageDragOver}
                    >
                      <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Enigma No Answer Sound
                  </label>
                  {config.enigma_no_answer ? (
                    <div className="space-y-2">
                      <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                        <audio controls className="w-full mb-2">
                          <source src={getMediaUrl(config.enigma_no_answer)} />
                          Your browser does not support the audio element.
                        </audio>
                        <button
                          onClick={() => deleteFile('enigma_no_answer')}
                          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                          title="Delete sound"
                        >
                          <Trash2 size={18} />
                          Delete Sound
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                      onDrop={(e) => handleSoundDrop(e, 'enigma_no_answer')}
                      onDragOver={handleImageDragOver}
                    >
                      <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Final Image Sound */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Final Image Sound
              </label>
              {config.final_image_sound ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                    <audio controls className="w-full mb-2">
                      <source src={getMediaUrl(config.final_image_sound)} />
                      Your browser does not support the audio element.
                    </audio>
                    <button
                      onClick={() => deleteFile('final_image_sound')}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
                      title="Delete sound"
                    >
                      <Trash2 size={18} />
                      Delete Sound
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                  onDrop={(e) => handleSoundDrop(e, 'final_image_sound')}
                  onDragOver={handleImageDragOver}
                >
                  <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-400">Drag & drop audio file here</p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        <div id="levels" className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleSection('levels')}>
              <h3 className="text-xl font-semibold text-white">Levels</h3>
              {collapsedSections['levels'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
            </div>
            <button
              onClick={addLevel}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Plus size={18} />
              Add Level
            </button>
          </div>

          {!collapsedSections['levels'] && (
          <div className="p-6">
          <div className="space-y-4">
            {Object.entries(config.levels)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([key, level]) => (
                <div
                  key={key}
                  draggable
                  onDragStart={() => handleLevelDragStart(key)}
                  onDragOver={(e) => handleLevelDragOver(e, key)}
                  onDragEnd={handleLevelDragEnd}
                  className={`bg-slate-900 rounded-lg p-4 border border-slate-700 cursor-move ${
                    draggedLevelKey === key ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GripVertical size={18} className="text-slate-500" />
                      <h4 className="text-lg font-medium text-white">Level {key}</h4>
                    </div>
                    <button
                      onClick={() => removeLevel(key)}
                      className="p-2 text-red-400 hover:bg-red-600/20 rounded transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Points
                      </label>
                      <input
                        type="number"
                        value={level.points}
                        onChange={(e) => updateLevel(key, 'points', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                        Name
                        <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                          {currentLanguage.toUpperCase()}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={level.name}
                        onChange={(e) => updateLevel(key, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                        Description
                        <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                          {currentLanguage.toUpperCase()}
                        </span>
                      </label>
                      <textarea
                        value={level.description}
                        onChange={(e) => updateLevel(key, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}

            {Object.keys(config.levels).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No levels added yet. Click "Add Level" to create one.
              </div>
            )}
          </div>
          </div>
          )}
        </div>

        {/* Overscores Section */}
        <div id="overscores" className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleSection('overscores')}>
              <h3 className="text-xl font-semibold text-white">Overscores</h3>
              {collapsedSections['overscores'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
            </div>
            <button
              onClick={addOverscore}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Plus size={18} />
              Add Overscore
            </button>
          </div>

          {!collapsedSections['overscores'] && (
          <div className="p-6">
          <div className="space-y-4">
            {config.overscores.map((overscore, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => handleOverscoreDragStart(index)}
                onDragOver={(e) => handleOverscoreDragOver(e, index)}
                onDragEnd={handleOverscoreDragEnd}
                className={`bg-slate-900 rounded-lg p-4 border border-slate-700 cursor-move ${
                  draggedOverscoreIndex === index ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical size={18} className="text-slate-500" />
                    <h4 className="text-lg font-medium text-white">Overscore Step {index + 1}</h4>
                  </div>
                  <button
                    onClick={() => removeOverscore(index)}
                    className="p-2 text-red-400 hover:bg-red-600/20 rounded transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Step Score
                    </label>
                    <input
                      type="number"
                      value={overscore.overscore_score}
                      onChange={(e) => updateOverscore(index, 'overscore_score', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                      Name
                      <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                        {currentLanguage.toUpperCase()}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={overscore.name_overscore_step}
                      onChange={(e) => updateOverscore(index, 'name_overscore_step', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      placeholder="Overscore name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Image
                    </label>
                    {overscore.image_overscore_step ? (
                      <div className="relative">
                        <img
                          src={getMediaUrl(overscore.image_overscore_step)}
                          alt={`Overscore ${index + 1}`}
                          className="w-full h-20 object-cover rounded border border-slate-600"
                        />
                        <button
                          onClick={async () => {
                            const fileName = overscore.image_overscore_step;
                            if (fileName && !fileName.startsWith('data:')) {
                              const filePath = `${scenarioUniqid || scenarioId}/${fileName.split('/').pop()}`;
                              await supabase.storage.from('game-media').remove([filePath]);
                            }
                            updateOverscore(index, 'image_overscore_step', '');
                          }}
                          className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
                          title="Delete image"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed border-slate-600 rounded p-4 text-center hover:border-blue-400 transition cursor-pointer"
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const files = Array.from(e.dataTransfer.files);
                          const imageFile = files.find(file => file.type.startsWith('image/'));
                          if (imageFile) {
                            const fileExt = imageFile.name.split('.').pop();
                            const fileName = `overscore_${index}_${Date.now()}.${fileExt}`;
                            const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;
                            const { error } = await supabase.storage
                              .from('game-media')
                              .upload(filePath, imageFile, { cacheControl: '3600', upsert: false });
                            if (!error) {
                              updateOverscore(index, 'image_overscore_step', getMediaUrl(fileName));
                            }
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        <Upload size={20} className="mx-auto text-slate-500" />
                        <p className="text-xs text-slate-500 mt-1">Drop image</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {config.overscores.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No overscores added yet. Click "Add Overscore" to create one.
              </div>
            )}
          </div>
          </div>
          )}
        </div>

        <div id="enigmas" className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleSection('enigmas')}>
              <h3 className="text-xl font-semibold text-white">Enigmas</h3>
              {collapsedSections['enigmas'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
            </div>
            <button
              onClick={addEnigma}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Plus size={18} />
              Add Enigma
            </button>
          </div>

          {!collapsedSections['enigmas'] && (
          <div className="p-6">
          <div className="space-y-4">
            {config.enigmas.map((enigma, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => handleEnigmaDragStart(index)}
                onDragOver={(e) => handleEnigmaDragOver(e, index)}
                onDragEnd={handleEnigmaDragEnd}
                className={`bg-slate-900 rounded-lg p-4 border border-slate-700 cursor-move ${
                  draggedEnigmaIndex === index ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical size={18} className="text-slate-500" />
                    <h4 className="text-lg font-medium text-white">Enigma {enigma.number}</h4>
                  </div>
                  <button
                    onClick={() => removeEnigma(index)}
                    className="p-2 text-red-400 hover:bg-red-600/20 rounded transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Number
                      </label>
                      <input
                        type="number"
                        value={enigma.number}
                        onChange={(e) => updateEnigma(index, 'number', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Good Answer Points
                      </label>
                      <input
                        type="number"
                        value={enigma.good_answer_points}
                        onChange={(e) => updateEnigma(index, 'good_answer_points', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Wrong Answer Points
                      </label>
                      <input
                        type="number"
                        value={enigma.wrong_answer_points}
                        onChange={(e) => updateEnigma(index, 'wrong_answer_points', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Good Answer Image
                      </label>
                      {enigma.good_answer_image ? (
                        <div className="space-y-2">
                          <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                            <img
                              src={getMediaUrl(enigma.good_answer_image)}
                              alt="Good Answer"
                              className="w-full h-32 object-cover"
                            />
                            <button
                              onClick={() => updateEnigma(index, 'good_answer_image', '')}
                              className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
                              title="Delete image"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer bg-slate-900"
                          onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files[0];
                            if (file && file.type.startsWith('image/')) {
                              await uploadEnigmaImage(file, index);
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <Upload size={24} className="mx-auto mb-1 text-slate-400" />
                          <p className="text-xs text-slate-400">Drag & drop image</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                      Text
                      <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                        {currentLanguage.toUpperCase()}
                      </span>
                    </label>
                    <textarea
                      value={enigma.text}
                      onChange={(e) => updateEnigma(index, 'text', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter enigma text/question"
                    />
                  </div>
                </div>
              </div>
            ))}

            {config.enigmas.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No enigmas added yet. Click "Add Enigma" to create one.
              </div>
            )}
          </div>
          </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('texts')}
          >
            <h3 className="text-xl font-semibold text-white">Texts</h3>
            {collapsedSections['texts'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['texts'] && (
          <div className="px-6 pb-6 space-y-6">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div
                className="flex items-center gap-2 cursor-pointer mb-4"
                onClick={() => toggleSection('texts_general')}
              >
                <h4 className="text-lg font-semibold text-white">General</h4>
                {collapsedSections['texts_general'] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
              </div>
              {!collapsedSections['texts_general'] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Team Title
                    </label>
                    <input
                      type="text"
                      value={config.team_title}
                      onChange={(e) => updateField('team_title', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      PDF Title
                    </label>
                    <input
                      type="text"
                      value={config.pdf_title}
                      onChange={(e) => updateField('pdf_title', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.auto_reset}
                        onChange={(e) => setConfig({ ...config, auto_reset: e.target.checked })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-300">Auto Reset</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Delay Auto Reset (seconds)
                    </label>
                    <input
                      type="number"
                      value={config.delay_auto_reset}
                      onChange={(e) => updateField('delay_auto_reset', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div
                className="flex items-center gap-2 cursor-pointer mb-4"
                onClick={() => toggleSection('texts_in_play')}
              >
                <h4 className="text-lg font-semibold text-white">In Play</h4>
                {collapsedSections['texts_in_play'] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
              </div>
              {!collapsedSections['texts_in_play'] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Player Starts
                    </label>
                    <input
                      type="text"
                      value={config.text_player_starts}
                      onChange={(e) => updateField('text_player_starts', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Card Not Empty
                    </label>
                    <input
                      type="text"
                      value={config.text_card_not_empty}
                      onChange={(e) => updateField('text_card_not_empty', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team Starts with Card Not Empty
                    </label>
                    <input
                      type="text"
                      value={config.text_team_starts_card_not_empty}
                      onChange={(e) => updateField('text_team_starts_card_not_empty', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Card Not Corresponding to Any Team
                    </label>
                    <input
                      type="text"
                      value={config.text_card_not_corresponding}
                      onChange={(e) => updateField('text_card_not_corresponding', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team Ended
                    </label>
                    <input
                      type="text"
                      value={config.text_team_ended}
                      onChange={(e) => updateField('text_team_ended', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text All Team Ended
                    </label>
                    <input
                      type="text"
                      value={config.text_all_team_ended}
                      onChange={(e) => updateField('text_all_team_ended', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Scenario Ended
                    </label>
                    <input
                      type="text"
                      value={config.text_scenario_ended}
                      onChange={(e) => updateField('text_scenario_ended', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team Reached New Level
                    </label>
                    <input
                      type="text"
                      value={config.text_team_reached_new_level}
                      onChange={(e) => updateField('text_team_reached_new_level', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Card Empty
                    </label>
                    <input
                      type="text"
                      value={config.text_card_empty}
                      onChange={(e) => updateField('text_card_empty', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Late Malus
                    </label>
                    <input
                      type="text"
                      value={config.text_late_malus}
                      onChange={(e) => updateField('text_late_malus', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div
                className="flex items-center gap-2 cursor-pointer mb-4"
                onClick={() => toggleSection('texts_rankings')}
              >
                <h4 className="text-lg font-semibold text-white">Rankings</h4>
                {collapsedSections['texts_rankings'] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
              </div>
              {!collapsedSections['texts_rankings'] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team Enters Top Ranking
                    </label>
                    <input
                      type="text"
                      value={config.text_team_enters_top_ranking}
                      onChange={(e) => updateField('text_team_enters_top_ranking', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team Enters Podium
                    </label>
                    <input
                      type="text"
                      value={config.text_team_enters_podium}
                      onChange={(e) => updateField('text_team_enters_podium', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Team in First Place
                    </label>
                    <input
                      type="text"
                      value={config.text_team_first_place}
                      onChange={(e) => updateField('text_team_first_place', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Following Top or Podium Entrance
                    </label>
                    <input
                      type="text"
                      value={config.text_following_top_podium}
                      onChange={(e) => updateField('text_following_top_podium', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div
                className="flex items-center gap-2 cursor-pointer mb-4"
                onClick={() => toggleSection('texts_errors')}
              >
                <h4 className="text-lg font-semibold text-white">Errors</h4>
                {collapsedSections['texts_errors'] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
              </div>
              {!collapsedSections['texts_errors'] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text If Error
                    </label>
                    <input
                      type="text"
                      value={config.text_if_error}
                      onChange={(e) => updateField('text_if_error', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Text Is Card Empty
                    </label>
                    <input
                      type="text"
                      value={config.text_is_card_empty}
                      onChange={(e) => updateField('text_is_card_empty', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <div
                className="flex items-center gap-2 cursor-pointer mb-4"
                onClick={() => toggleSection('texts_animations')}
              >
                <h4 className="text-lg font-semibold text-white">Animations</h4>
                {collapsedSections['texts_animations'] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
              </div>
              {!collapsedSections['texts_animations'] && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Message Display Time (seconds)
                    </label>
                    <input
                      type="number"
                      value={config.message_display_time}
                      onChange={(e) => updateField('message_display_time', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Animation Display Time (seconds)
                    </label>
                    <input
                      type="number"
                      value={config.animation_display_time}
                      onChange={(e) => updateField('animation_display_time', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {scenarioData && (
          <JsonViewer data={scenarioData} title="Scenario Data JSON" />
        )}

        <AdminOnlyPanel>
          <ScenarioAdminControls scenarioId={scenarioId} />
        </AdminOnlyPanel>

        <div id="actions" className="flex items-center gap-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            onClick={() => triggerPublishWithValidation(false, false)}
            disabled={saving || publishing}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <Send size={18} />
              <span>{publishing && !publishAllMedia ? 'Publishing...' : 'Publish Updates'}</span>
            </div>
            <span className="text-xs opacity-90">(only new changes & media)</span>
          </button>
          <button
            onClick={() => triggerPublishWithValidation(false, true)}
            disabled={saving || publishing}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <Send size={18} />
              <span>{publishing && publishAllMedia ? 'Publishing...' : 'Publish All'}</span>
            </div>
            <span className="text-xs opacity-90">(force re-upload everything)</span>
          </button>
          <button
            onClick={handleZipDownload}
            disabled={saving || publishing}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            {publishing ? 'Creating Zip...' : 'Zip Scenario'}
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            Back to List
          </button>

          {authService.isAdmin() && (
            <div className="flex items-center gap-4 pt-2 border-t border-slate-700 flex-wrap">
              <span className="text-sm text-slate-400 font-medium">Admin Only:</span>
              <button
                onClick={() => triggerPublishWithValidation(true, false)}
                disabled={saving || publishing}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Send size={18} />
                  <span>Publish Updates as Client</span>
                </div>
                <span className="text-xs opacity-90">(specify client email)</span>
              </button>
              <button
                onClick={() => triggerPublishWithValidation(true, true)}
                disabled={saving || publishing}
                className="px-6 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Send size={18} />
                  <span>Publish All as Client</span>
                </div>
                <span className="text-xs opacity-90">(force re-upload to client)</span>
              </button>
            </div>
          )}
        </div>
        </div>

        {/* Right Navigation Sidebar */}
        <div className="relative">
          {/* Toggle Button */}
          <button
            onClick={() => setShowNavigation(!showNavigation)}
            className="fixed right-4 top-20 z-50 p-2 bg-slate-800 text-white rounded-lg border border-slate-700 hover:bg-slate-700 transition shadow-lg"
            title={showNavigation ? 'Hide navigation' : 'Show navigation'}
          >
            {showNavigation ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Navigation Panel */}
          <div
            className={`w-48 sticky top-6 self-start transition-all duration-300 ${
              showNavigation ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
            }`}
          >
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-3">
              <h3 className="text-sm font-semibold text-white mb-3">Go To</h3>
              <nav className="space-y-0.5">
                {navigationSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white rounded transition"
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {validationResult && pendingPublishAction && (
        <PublishValidationModal
          result={validationResult}
          onProceed={pendingPublishAction}
          onCancel={() => { setValidationResult(null); setPendingPublishAction(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={showPublishConfirm}
        onCancel={() => {
          if (!publishing) {
            setShowPublishConfirm(false);
            setPublishSteps([]);
            setPublishAllMedia(false);
          }
        }}
        onConfirm={handlePublishConfirm}
        title={publishAllMedia ? "Publish Everything (Force Re-upload)" : "Publish Updates Only"}
        message={publishing
          ? (publishAllMedia ? "Publishing your scenario with all media files..." : "Publishing updates...")
          : (publishAllMedia
            ? "Are you sure you want to force publish ALL media files?\n\nThis will:\n• Save all configuration changes\n• Increment the scenario version\n• Upload the scenario data to Taghunter server\n• Re-upload ALL media files (even if already uploaded)\n\nThis may take several minutes."
            : "Are you sure you want to publish updates?\n\nThis will:\n• Save all configuration changes\n• Increment the scenario version\n• Upload the scenario data to Taghunter server\n• Upload only NEW or CHANGED media files\n\nAlready uploaded media will be skipped."
          )
        }
        confirmText={publishAllMedia ? "Publish Everything" : "Publish Updates"}
        variant="info"
        steps={publishSteps}
        isProcessing={publishing}
      />

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      {publishing && publishProgress && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-lg text-sm text-slate-200 shadow-xl flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-white"></div>
          {publishProgress}
        </div>
      )}

      {showAddLanguageModal && (
        <AddLanguageModal
          availableLanguages={availableLanguages}
          onSelect={handleAddLanguage}
          onClose={() => setShowAddLanguageModal(false)}
        />
      )}

      <ClientEmailModal
        isOpen={showClientEmailModal}
        onSubmit={doPublish}
        onCancel={() => setShowClientEmailModal(false)}
        title="Publish Scenario"
        description="Enter the client email address to publish this scenario under"
      />
    </div>
  );
}
