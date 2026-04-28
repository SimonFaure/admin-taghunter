// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Upload, Download, Send, ChevronDown, ChevronUp, LayoutGrid as Layout, Menu, X } from 'lucide-react';
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
import { validateTagquestConfig, type ValidationResult } from '../utils/publishValidation';

interface Level {
  points: string;
  name: string;
  description: string;
}

interface Quest {
  main_image: string;
  points: string;
  name: string;
  sound: string;
  image_1: string;
  image_2: string;
  image_3: string;
  image_4: string;
}

interface Overscore {
  overscore_step: string;
  overscore_score: string;
  name_overscore_step: string;
  image_overscore_step: string;
}

interface TagquestConfigData {
  title: string;
  background_image: string;
  game_visual: string;
  common_image: string;
  malus_container: string;
  malus_image: string;
  late_malus_image: string;
  combo_image: string;
  square_image: string;
  score_image: string;
  team_name_container_image: string;
  timer_container_image: string;
  quest_counter_image: string;
  top_1_image: string;
  top_3_image: string;
  top_10_image: string;
  game_public: string;
  number_of_quests: string;
  animation_image_duration: string;
  animation_message_duration: string;
  end_station: string;
  default_time: string;
  level_font_color: string;
  scenario_version: string;
  default_time_malus: string;
  font: string;
  font_color: string;
  top_1_sound: string;
  top_3_sound: string;
  top_10_sound: string;
  final_image_sound: string;
  success_sound: string;
  cheating_sound: string;
  malus_sound: string;
  late_malus_sound: string;
  combo_2_quests: string;
  combo_4_quests: string;
  combo_6_quests: string;
  malus_points: string;
  malus_station_number: string;
  late_malus_points: string;
  levels: Record<string, Level>;
  quests: Quest[];
  overscores: Overscore[];
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

interface TagquestConfigProps {
  scenarioId: string;
  onBack: () => void;
  onOpenLayoutEditor: () => void;
}

export function TagquestConfig({ scenarioId, onBack, onOpenLayoutEditor }: TagquestConfigProps) {
  const [config, setConfig] = useState<TagquestConfigData>({
    title: '',
    background_image: '',
    game_visual: '',
    common_image: '',
    malus_container: '',
    malus_image: '',
    late_malus_image: '',
    combo_image: '',
    square_image: '',
    score_image: '',
    team_name_container_image: '',
    timer_container_image: '',
    quest_counter_image: '',
    top_1_image: '',
    top_3_image: '',
    top_10_image: '',
    game_public: 'kids',
    number_of_quests: '10',
    animation_image_duration: '1',
    animation_message_duration: '2',
    end_station: '60',
    default_time: '60',
    level_font_color: '#000000',
    scenario_version: '1.0',
    default_time_malus: '1',
    font: 'Arial',
    font_color: '#000000',
    top_1_sound: '',
    top_3_sound: '',
    top_10_sound: '',
    final_image_sound: '',
    success_sound: '',
    cheating_sound: '',
    malus_sound: '',
    late_malus_sound: '',
    combo_2_quests: '0',
    combo_4_quests: '0',
    combo_6_quests: '0',
    malus_points: '0',
    malus_station_number: '0',
    late_malus_points: '0',
    levels: {},
    quests: [],
    overscores: [],
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
  const [useDefaultImages, setUseDefaultImages] = useState(false);
  const [useDefaultTexts, setUseDefaultTexts] = useState(false);
  const [defaultConfig, setDefaultConfig] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [publishProgress, setPublishProgress] = useState<string>('');
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const [showClientEmailModal, setShowClientEmailModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(null);
  const [draggedLevelKey, setDraggedLevelKey] = useState<string | null>(null);
  const [draggedOverscoreIndex, setDraggedOverscoreIndex] = useState<number | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioStory, setScenarioStory] = useState('');
  const [gameType, setGameType] = useState<string>('tagquest');
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
  const [showNavigation, setShowNavigation] = useState(true);
  const [translations, setTranslations] = useState<Record<string, any>>({
    fr: {
      title: '',
      description: '',
      story: '',
      levels: {},
      quests: [],
      overscores: []
    }
  });
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

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
    loadDefaultConfig();
    loadConfigData();
  }, [scenarioId]);

  const loadDefaultConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('default_config')
        .select('value')
        .eq('meta', 'tagquest_default_data')
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        setDefaultConfig(data.value);
      }
    } catch (error) {
      console.error('Error loading default config:', error);
    }
  };

  const getMediaUrl = (fileName: string) => {
    return getMediaUrlUtil(scenarioUniqid || scenarioId, fileName);
  };

  const loadConfigData = async () => {
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
        setGameType(data.game_type || 'tagquest');
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

        const scenarioMedia = (data as any).medias;

        if (scenarioMedia) {
          if (scenarioMedia.images) {
            Object.keys(scenarioMedia.images).forEach(field => {
              loadedConfig[field as keyof TagquestConfigData] = scenarioMedia.images[field];
            });
          }

          if (scenarioMedia.sounds) {
            Object.keys(scenarioMedia.sounds).forEach(field => {
              loadedConfig[field as keyof TagquestConfigData] = scenarioMedia.sounds[field];
            });

            // Backward compatibility: migrate old tops_sound to new individual top sounds
            if (scenarioMedia.sounds.tops_sound && !scenarioMedia.sounds.top_1_sound) {
              const topsFileName = scenarioMedia.sounds.tops_sound;
              loadedConfig.top_1_sound = topsFileName;
              loadedConfig.top_3_sound = topsFileName;
              loadedConfig.top_10_sound = topsFileName;
            }
          }

          if (scenarioMedia.quests && loadedConfig.quests) {
            loadedConfig.quests = loadedConfig.quests.map((quest: Quest, index: number) => {
              const mediaQuest = scenarioMedia.quests[index];
              return {
                ...quest,
                main_image: mediaQuest ? (mediaQuest.main_image || '') : '',
                sound: mediaQuest ? (mediaQuest.sound || '') : '',
                image_1: mediaQuest ? (mediaQuest.image_1 || '') : '',
                image_2: mediaQuest ? (mediaQuest.image_2 || '') : '',
                image_3: mediaQuest ? (mediaQuest.image_3 || '') : '',
                image_4: mediaQuest ? (mediaQuest.image_4 || '') : ''
              };
            });
          }

          if (scenarioMedia.overscores && loadedConfig.overscores) {
            loadedConfig.overscores = loadedConfig.overscores.map((overscore: Overscore) => {
              const mediaOverscore = scenarioMedia.overscores.find((o: any) => o.overscore_step === overscore.overscore_step);
              return {
                ...overscore,
                image_overscore_step: mediaOverscore ? (mediaOverscore.image_overscore_step || '') : ''
              };
            });
          }
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

          const currentTranslation = data.data.translations[defaultLang];
          if (currentTranslation) {
            setScenarioDescription(currentTranslation.description || data.description || '');
            setScenarioStory(currentTranslation.story || '');
          }
        } else {
          const initialTranslations = {
            fr: {
              title: loadedConfig.title,
              description: data.description || '',
              story: '',
              levels: loadedConfig.levels,
              quests: loadedConfig.quests?.map((q: Quest, index: number) => ({ index: index.toString(), name: q.name })) || [],
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

  const handleUseDefaultImages = (checked: boolean) => {
    setUseDefaultImages(checked);
    if (checked && defaultConfig) {
      setConfig(prev => ({
        ...prev,
        malus_container: (defaultConfig as any).malus_container || '',
        malus_image: defaultConfig.malus_image || '',
        combo_image: defaultConfig.combo_image || '',
        team_name_container_image: (defaultConfig as any).team_name_container_image || '',
        timer_container_image: (defaultConfig as any).timer_container_image || '',
        quest_counter_image: (defaultConfig as any).quest_counter_image || '',
        score_image: (defaultConfig as any).score_image || ''
      }));
    } else if (!checked) {
      setConfig(prev => ({
        ...prev,
        malus_container: '',
        malus_image: '',
        combo_image: '',
        team_name_container_image: '',
        timer_container_image: '',
        quest_counter_image: '',
        score_image: ''
      }));
    }
  };

  const handleUseDefaultTexts = (checked: boolean) => {
    setUseDefaultTexts(checked);
    if (checked && defaultConfig) {
      setConfig(prev => ({
        ...prev,
        team_title: defaultConfig.team_title || prev.team_title,
        pdf_title: defaultConfig.pdf_title || prev.pdf_title,
        auto_reset: defaultConfig.auto_reset ?? prev.auto_reset,
        delay_auto_reset: defaultConfig.delay_auto_reset || prev.delay_auto_reset,
        text_player_starts: defaultConfig.text_player_starts || prev.text_player_starts,
        text_card_not_empty: defaultConfig.text_card_not_empty || prev.text_card_not_empty,
        text_team_starts_card_not_empty: defaultConfig.text_team_starts_card_not_empty || prev.text_team_starts_card_not_empty,
        text_card_not_corresponding: defaultConfig.text_card_not_corresponding || prev.text_card_not_corresponding,
        text_team_ended: defaultConfig.text_team_ended || prev.text_team_ended,
        text_all_team_ended: defaultConfig.text_all_team_ended || prev.text_all_team_ended,
        text_scenario_ended: defaultConfig.text_scenario_ended || prev.text_scenario_ended,
        text_team_reached_new_level: defaultConfig.text_team_reached_new_level || prev.text_team_reached_new_level,
        text_card_empty: defaultConfig.text_card_empty || prev.text_card_empty,
        text_late_malus: defaultConfig.text_late_malus || prev.text_late_malus,
        text_team_enters_top_ranking: defaultConfig.text_team_enters_top_ranking || prev.text_team_enters_top_ranking,
        text_team_enters_podium: defaultConfig.text_team_enters_podium || prev.text_team_enters_podium,
        text_team_first_place: defaultConfig.text_team_first_place || prev.text_team_first_place,
        text_following_top_podium: defaultConfig.text_following_top_podium || prev.text_following_top_podium,
        text_if_error: defaultConfig.text_if_error || prev.text_if_error,
        text_is_card_empty: defaultConfig.text_is_card_empty || prev.text_is_card_empty,
        message_display_time: defaultConfig.message_display_time || prev.message_display_time,
        animation_display_time: defaultConfig.animation_display_time || prev.animation_display_time
      }));
    }
  };

  const extractFileName = (url: string) => {
    return extractFileNameUtil(url);
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
      { fileName: config.background_image, name: 'background_image' },
      { fileName: config.game_visual, name: 'game_visual' },
      { fileName: config.malus_container, name: 'malus_container' },
      { fileName: config.malus_image, name: 'malus_image' },
      { fileName: config.combo_image, name: 'combo_image' },
      { fileName: config.team_name_container_image, name: 'team_name_container_image' },
      { fileName: config.timer_container_image, name: 'timer_container_image' },
      { fileName: config.quest_counter_image, name: 'quest_counter_image' },
      { fileName: config.score_image, name: 'score_image' },
      { fileName: config.late_malus_image, name: 'late_malus_image' },
      { fileName: config.top_1_image, name: 'top_1_image' },
      { fileName: config.top_3_image, name: 'top_3_image' },
      { fileName: config.top_10_image, name: 'top_10_image' }
    ];

    const imagesToDownload = imageFields.filter(field => field.fileName);

    if (imagesToDownload.length === 0) {
      alert('No images to download');
      return;
    }

    for (const image of imagesToDownload) {
      await downloadImage(getMediaUrlUtil(scenarioUniqid || scenarioId, image.fileName), image.name);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedTranslations = {
        ...translations,
        [currentLanguage]: {
          title: config.title,
          description: scenarioDescription,
          story: scenarioStory,
          levels: config.levels,
          quests: config.quests.map((q, index) => ({ index: index.toString(), name: q.name })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      };

      const cleanedConfig = { ...config };

      const imageFields = [
        'background_image',
        'game_visual',
        'malus_container',
        'malus_image',
        'combo_image',
        'team_name_container_image',
        'timer_container_image',
        'quest_counter_image',
        'score_image',
        'late_malus_image',
        'top_1_image',
        'top_3_image',
        'top_10_image'
      ];

      const soundFields = [
        'top_1_sound',
        'top_3_sound',
        'top_10_sound',
        'success_sound',
        'cheating_sound',
        'malus_sound',
        'late_malus_sound'
      ];

      const mediaObject: any = {
        images: {},
        sounds: {},
        quests: [],
        overscores: []
      };

      imageFields.forEach(field => {
        if (cleanedConfig[field as keyof TagquestConfigData]) {
          mediaObject.images[field] = extractFileName(cleanedConfig[field as keyof TagquestConfigData] as string);
        }
      });

      soundFields.forEach(field => {
        if (cleanedConfig[field as keyof TagquestConfigData]) {
          mediaObject.sounds[field] = extractFileName(cleanedConfig[field as keyof TagquestConfigData] as string);
        }
      });

      if (cleanedConfig.quests) {
        mediaObject.quests = cleanedConfig.quests.map((quest: Quest, index: number) => ({
          quest_index: index,
          main_image: extractFileName(quest.main_image),
          sound: extractFileName(quest.sound),
          image_1: extractFileName(quest.image_1),
          image_2: extractFileName(quest.image_2),
          image_3: extractFileName(quest.image_3),
          image_4: extractFileName(quest.image_4)
        }));
      }

      if (cleanedConfig.overscores) {
        mediaObject.overscores = cleanedConfig.overscores.map((overscore: Overscore) => ({
          overscore_step: overscore.overscore_step,
          image_overscore_step: extractFileName(overscore.image_overscore_step)
        }));
      }

      const configDataCopy = { ...cleanedConfig };

      [...imageFields, ...soundFields].forEach(field => {
        delete configDataCopy[field as keyof TagquestConfigData];
      });

      if (configDataCopy.quests) {
        configDataCopy.quests = configDataCopy.quests.map((quest: Quest) => ({
          points: quest.points,
          name: quest.name
        }));
      }

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

      setAlert({ type: 'success', message: 'Configuration saved successfully!' });
    } catch (error) {
      console.error('Error saving config:', error);
      setAlert({ type: 'error', message: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof TagquestConfigData, value: any) => {
    const updatedConfig = { ...config, [field]: value };
    setConfig(updatedConfig);

    if (field === 'title') {
      setScenarioTitle(value);
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const addCustomFont = () => {
    if (newCustomFont.trim() && !customFonts.includes(newCustomFont.trim())) {
      setCustomFonts(prev => [...prev, newCustomFont.trim()]);
      setConfig(prev => ({ ...prev, font: newCustomFont.trim() }));
      setNewCustomFont('');
      setShowCustomFontInput(false);
    }
  };

  const handleLanguageChange = (lang: string) => {
    const currentTranslation = translations[currentLanguage];
    if (currentTranslation) {
      currentTranslation.title = config.title;
      currentTranslation.description = scenarioDescription;
      currentTranslation.story = scenarioStory;
      currentTranslation.levels = config.levels;
      currentTranslation.quests = config.quests.map((q, index) => ({ index: index.toString(), name: q.name }));
      currentTranslation.overscores = config.overscores.map(o => ({
        overscore_step: o.overscore_step,
        name_overscore_step: o.name_overscore_step
      }));
    }

    const newTranslation = translations[lang];
    if (newTranslation) {
      setConfig(prev => ({
        ...prev,
        title: newTranslation.title || prev.title,
        levels: newTranslation.levels || prev.levels,
        quests: prev.quests.map((q, index) => ({
          ...q,
          name: newTranslation.quests?.[index]?.name || q.name
        })),
        overscores: prev.overscores.map((o, index) => ({
          ...o,
          name_overscore_step: newTranslation.overscores?.[index]?.name_overscore_step || o.name_overscore_step
        }))
      }));
      setScenarioDescription(newTranslation.description || '');
      setScenarioStory(newTranslation.story || '');
    }

    setCurrentLanguage(lang);
  };

  const handleAddLanguage = (lang: string) => {
    if (!availableLanguages.includes(lang)) {
      setAvailableLanguages([...availableLanguages, lang]);
      setTranslations({
        ...translations,
        [lang]: {
          title: config.title,
          description: scenarioDescription,
          story: scenarioStory,
          levels: config.levels,
          quests: config.quests.map((q, index) => ({ index: index.toString(), name: q.name })),
          overscores: config.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      });
    }
    setShowAddLanguageModal(false);
  };

  const handleRemoveLanguage = (lang: string) => {
    if (lang === 'fr') return;

    const newTranslations = { ...translations };
    delete newTranslations[lang];
    setTranslations(newTranslations);
    setAvailableLanguages(availableLanguages.filter(l => l !== lang));

    if (currentLanguage === lang) {
      setCurrentLanguage('fr');
    }
  };

  const uploadFile = async (file: File, fieldName: keyof TagquestConfigData) => {
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

  const handleImageClick = (fieldName: keyof TagquestConfigData) => {
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

  const handleSoundClick = (fieldName: keyof TagquestConfigData) => {
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

  const handleImageDrop = async (e: React.DragEvent, fieldName: keyof TagquestConfigData) => {
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

  const handleSoundDrop = async (e: React.DragEvent, fieldName: keyof TagquestConfigData) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);

    const files = Array.from(e.dataTransfer.files);
    const soundFile = files.find(file => file.type.startsWith('audio/'));

    if (!soundFile) {
      alert('Please drop an audio file');
      return;
    }

    await uploadFile(soundFile, fieldName);
  };

  const handleImageDragOver = (e: React.DragEvent, fieldName?: keyof TagquestConfigData) => {
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

  const handleQuestImageDrop = async (e: React.DragEvent, questIndex: number, fieldName: keyof Quest) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (!imageFile) {
      alert('Please drop an image file');
      return;
    }

    await uploadQuestFile(imageFile, questIndex, fieldName);
  };

  const handleQuestImageDragOver = (e: React.DragEvent, questIndex: number, fieldName: keyof Quest) => {
    e.preventDefault();
    e.stopPropagation();
    const dragFieldName = `quest_${questIndex}_${fieldName}`;
    if (dragOverField !== dragFieldName) {
      setDragOverField(dragFieldName);
    }
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

  const addQuest = () => {
    setConfig({
      ...config,
      quests: [
        ...config.quests,
        {
          main_image: '',
          points: '10',
          name: '',
          sound: '',
          image_1: '',
          image_2: '',
          image_3: '',
          image_4: ''
        }
      ]
    });
  };

  const removeQuest = (index: number) => {
    setConfig({
      ...config,
      quests: config.quests.filter((_, i) => i !== index)
    });
  };

  const updateQuest = (index: number, field: keyof Quest, value: string) => {
    const newQuests = [...config.quests];
    newQuests[index] = {
      ...newQuests[index],
      [field]: value
    };
    setConfig({ ...config, quests: newQuests });
  };

  const uploadQuestFile = async (file: File, questIndex: number, fieldName: keyof Quest) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `quest_${questIndex}_${fieldName}_${Date.now()}.${fileExt}`;
      const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('game-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      updateQuest(questIndex, fieldName, fileName);
    } catch (error) {
      console.error('Error uploading quest file:', error);
      alert('Failed to upload file');
    }
  };

  const handleQuestImageClick = (questIndex: number, fieldName: keyof Quest) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadQuestFile(file, questIndex, fieldName);
      }
    };
    input.click();
  };

  const handleQuestSoundClick = (questIndex: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await uploadQuestFile(file, questIndex, 'sound');
      }
    };
    input.click();
  };

  const deleteQuestImage = (questIndex: number, fieldName: keyof Quest) => {
    const updatedQuests = [...config.quests];
    updatedQuests[questIndex] = {
      ...updatedQuests[questIndex],
      [fieldName]: ''
    };
    setConfig({ ...config, quests: updatedQuests });
  };

  const deleteFile = (fieldName: keyof TagquestConfigData) => {
    setConfig({ ...config, [fieldName]: '' });
  };

  const deleteOverscore = (index: number) => {
    const updatedOverscores = config.overscores.filter((_, i) => i !== index);
    setConfig({ ...config, overscores: updatedOverscores });
  };

  const renderQuestImage = (label: string, questIndex: number, fieldName: keyof Quest, preview?: string) => {
    const isUploading = uploadingField === `quest_${questIndex}_${fieldName}`;
    const isDragging = dragOverField === `quest_${questIndex}_${fieldName}`;

    return (
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label}
        </label>
        {preview ? (
          <div className="space-y-2">
            <div
              className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700 cursor-pointer hover:border-blue-500 transition"
              onClick={() => setImagePreview({ url: getMediaUrl(preview), title: label })}
            >
              <img
                src={getMediaUrl(preview)}
                alt={label}
                className="w-full h-48 object-cover"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteQuestImage(questIndex, fieldName);
                }}
                className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                title="Delete image"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ) : isUploading ? (
          <div className="border-2 border-dashed border-blue-500 rounded-lg p-8 text-center bg-slate-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-sm text-blue-400">Uploading...</p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-700 hover:border-blue-400'
            }`}
            onDrop={(e) => handleQuestImageDrop(e, questIndex, fieldName)}
            onDragOver={(e) => handleQuestImageDragOver(e, questIndex, fieldName)}
            onDragLeave={handleDragLeave}
            onClick={() => handleQuestImageClick(questIndex, fieldName)}
          >
            <Upload size={32} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-400">Drag & drop or click to select</p>
          </div>
        )}
      </div>
    );
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
    setConfig({ ...config, overscores: newOverscores });
  };

  const updateOverscore = (index: number, field: keyof Overscore, value: string) => {
    const newOverscores = [...config.overscores];
    newOverscores[index] = {
      ...newOverscores[index],
      [field]: value
    };
    setConfig({ ...config, overscores: newOverscores });
  };

  const uploadOverscoreImage = async (file: File, overscoreIndex: number) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `overscore_${overscoreIndex}_${Date.now()}.${fileExt}`;
      const filePath = `${scenarioUniqid || scenarioId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('game-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      updateOverscore(overscoreIndex, 'image_overscore_step', fileName);
    } catch (error) {
      console.error('Error uploading overscore image:', error);
      alert('Failed to upload overscore image');
    }
  };

  const renderImageUpload = (
    label: string,
    fieldName: keyof TagquestConfigData,
    preview?: string
  ) => {
    const isUploading = uploadingField === fieldName;
    const isDragging = dragOverField === fieldName;

    return (
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label}
        </label>
        {preview ? (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
              <img
                src={getMediaUrl(preview)}
                alt={label}
                className="w-full h-48 object-cover"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFile(fieldName);
                }}
                className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                title="Delete image"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ) : isUploading ? (
          <div className="border-2 border-dashed border-blue-500 rounded-lg p-8 text-center bg-slate-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-sm text-blue-400">Uploading...</p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-700 hover:border-blue-400'
            }`}
            onDrop={(e) => handleImageDrop(e, fieldName)}
            onDragOver={(e) => handleImageDragOver(e, fieldName)}
            onDragLeave={handleDragLeave}
            onClick={() => handleImageClick(fieldName)}
          >
            <Upload size={32} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-400">Drag & drop or click to select</p>
          </div>
        )}
      </div>
    );
  };

  const renderSoundUpload = (
    label: string,
    fieldName: keyof TagquestConfigData,
    fileName?: string
  ) => {
    const isUploading = uploadingField === fieldName;

    return (
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label}
        </label>
        {fileName ? (
          <div className="space-y-2">
            <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
              <audio controls className="w-full mb-2">
                <source src={getMediaUrl(fileName)} />
                Your browser does not support the audio element.
              </audio>
              <button
                onClick={() => deleteFile(fieldName)}
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
            onDrop={(e) => handleSoundDrop(e, fieldName)}
            onDragOver={handleImageDragOver}
          >
            <Upload size={32} className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-400">Drag & drop audio file here</p>
          </div>
        )}
      </div>
    );
  };

  const handleZipDownload = async () => {
    console.log('=== Starting zip download process ===');
    setPublishing(true);
    setPublishProgress('Saving configuration...');
    try {
      console.log('Incrementing version and saving...');

      const versionParts = config.scenario_version.split('.');
      const majorVersion = parseInt(versionParts[0] || '1', 10);
      const minorVersion = parseInt(versionParts[1] || '0', 10);
      const newVersion = `${majorVersion}.${minorVersion + 1}`;

      const updatedConfig = {
        ...config,
        scenario_version: newVersion
      };
      setConfig(updatedConfig);

      const { error } = await supabase
        .from('scenarios')
        .update({
          data: { game_meta: updatedConfig, quests: updatedConfig.quests },
          medias: {
            images: Object.fromEntries(
              Object.entries(updatedConfig).filter(([key]) =>
                key.endsWith('_image') && updatedConfig[key as keyof TagquestConfigData]
              )
            ),
            sounds: {
              top_1_sound: updatedConfig.top_1_sound,
              top_3_sound: updatedConfig.top_3_sound,
              top_10_sound: updatedConfig.top_10_sound,
              success_sound: updatedConfig.success_sound,
              cheating_sound: updatedConfig.cheating_sound,
              malus_sound: updatedConfig.malus_sound,
              late_malus_sound: updatedConfig.late_malus_sound
            },
            levels: updatedConfig.levels,
            quests: updatedConfig.quests,
            overscores: updatedConfig.overscores
          },
          updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        })
        .eq('id', scenarioId);

      if (error) throw error;
      console.log('Configuration saved with new version:', updatedConfig.scenario_version);

      setPublishProgress('Creating zip archive...');
      const zip = new JSZip();
      const mediaFolder = zip.folder('media');

      const mediaFiles: string[] = [
        updatedConfig.background_image,
        updatedConfig.game_visual,
        updatedConfig.malus_container,
        updatedConfig.malus_image,
        updatedConfig.combo_image,
        updatedConfig.team_name_container_image,
        updatedConfig.timer_container_image,
        updatedConfig.quest_counter_image,
        updatedConfig.score_image,
        updatedConfig.late_malus_image,
        updatedConfig.top_1_image,
        updatedConfig.top_3_image,
        updatedConfig.top_10_image,
        updatedConfig.top_1_sound,
        updatedConfig.top_3_sound,
        updatedConfig.top_10_sound,
        updatedConfig.success_sound,
        updatedConfig.cheating_sound,
        updatedConfig.malus_sound,
        updatedConfig.late_malus_sound,
        ...updatedConfig.quests.flatMap(q => [
          q.main_image,
          q.sound,
          q.image_1,
          q.image_2,
          q.image_3,
          q.image_4
        ])
      ].filter(f => f);

      console.log('Found media files:', mediaFiles.length);
      setPublishProgress(`Downloading ${mediaFiles.length} media files...`);

      for (const fileName of mediaFiles) {
        try {
          const url = getMediaUrlUtil(scenarioUniqid || scenarioId, fileName);
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            mediaFolder?.file(fileName, blob);
          }
        } catch (err) {
          console.warn(`Failed to fetch ${fileName}:`, err);
        }
      }

      console.log('All media files processed');
      setPublishProgress('Packaging scenario data...');

      const getRelativeUrl = (url: string) => {
        if (!url) return '';
        const filename = url.split('/').pop();
        return filename ? `media/${filename}` : '';
      };

      const zipScenarioData = {
        scenario: {
          title: scenarioTitle,
          description: scenarioDescription,
          game_type: gameType,
          uniqid: scenarioUniqid,
          scenario_type: scenarioType,
          default_pattern_id: defaultPatternId || null,
          default_pattern_slug: defaultPatternSlug || null
        },
        layout: scenarioLayout,
        game_data: {
          game_meta: {
            font: updatedConfig.font,
            font_color: updatedConfig.font_color,
            level_font_color: updatedConfig.level_font_color,
            game_public: updatedConfig.game_public,
            number_of_quests: updatedConfig.number_of_quests,
            animation_image_duration: updatedConfig.animation_image_duration,
            animation_message_duration: updatedConfig.animation_message_duration,
            end_station: updatedConfig.end_station,
            default_time: updatedConfig.default_time,
            scenario_version: updatedConfig.scenario_version,
            default_time_malus: updatedConfig.default_time_malus,
            combo_2_quests: updatedConfig.combo_2_quests,
            combo_4_quests: updatedConfig.combo_4_quests,
            combo_6_quests: updatedConfig.combo_6_quests,
            malus_points: updatedConfig.malus_points,
            malus_station_number: updatedConfig.malus_station_number,
            late_malus_points: updatedConfig.late_malus_points
          },
          game_media_images: {
            background_image: getRelativeUrl(updatedConfig.background_image),
            game_visual: getRelativeUrl(updatedConfig.game_visual),
            malus_container: getRelativeUrl(updatedConfig.malus_container),
            malus_image: getRelativeUrl(updatedConfig.malus_image),
            combo_image: getRelativeUrl(updatedConfig.combo_image),
            team_name_container_image: getRelativeUrl(updatedConfig.team_name_container_image),
            timer_container_image: getRelativeUrl(updatedConfig.timer_container_image),
            quest_counter_image: getRelativeUrl(updatedConfig.quest_counter_image),
            score_image: getRelativeUrl(updatedConfig.score_image),
            late_malus_image: getRelativeUrl(updatedConfig.late_malus_image),
            top_1_image: getRelativeUrl(updatedConfig.top_1_image),
            top_3_image: getRelativeUrl(updatedConfig.top_3_image),
            top_10_image: getRelativeUrl(updatedConfig.top_10_image)
          },
          game_sounds: {
            top_1_sound: getRelativeUrl(updatedConfig.top_1_sound),
            top_3_sound: getRelativeUrl(updatedConfig.top_3_sound),
            top_10_sound: getRelativeUrl(updatedConfig.top_10_sound),
            success_sound: getRelativeUrl(updatedConfig.success_sound),
            cheating_sound: getRelativeUrl(updatedConfig.cheating_sound),
            malus_sound: getRelativeUrl(updatedConfig.malus_sound),
            late_malus_sound: getRelativeUrl(updatedConfig.late_malus_sound)
          },
          levels: updatedConfig.levels,
          quests: updatedConfig.quests.map(q => ({
            ...q,
            main_image: getRelativeUrl(q.main_image),
            sound: getRelativeUrl(q.sound),
            image_1: getRelativeUrl(q.image_1),
            image_2: getRelativeUrl(q.image_2),
            image_3: getRelativeUrl(q.image_3),
            image_4: getRelativeUrl(q.image_4)
          })),
          overscores: updatedConfig.overscores
        },
        translations
      };

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
      a.download = `tagquest-${scenarioUniqid || 'scenario'}.zip`;
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
    const result = validateTagquestConfig(config, scenarioTitle, scenarioDescription);
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

    setPublishSteps([
      { label: 'Save configuration', status: 'doing' },
      { label: 'Publish to Taghunter', status: 'todo' },
      { label: 'Collect media files', status: 'todo' },
      { label: 'Upload media files', status: 'todo' },
    ]);

    try {
      updateStep(0, 'doing');

      const versionParts = config.scenario_version.split('.');
      const majorVersion = parseInt(versionParts[0] || '1', 10);
      const minorVersion = parseInt(versionParts[1] || '0', 10);
      const newVersion = `${majorVersion}.${minorVersion + 1}`;

      const updatedConfig = {
        ...config,
        scenario_version: newVersion
      };
      setConfig(updatedConfig);

      const updatedTranslations = {
        ...translations,
        [currentLanguage]: {
          title: updatedConfig.title,
          description: scenarioDescription,
          story: scenarioStory,
          levels: updatedConfig.levels,
          quests: updatedConfig.quests.map((q, index) => ({ index: index.toString(), name: q.name })),
          overscores: updatedConfig.overscores.map(o => ({
            overscore_step: o.overscore_step,
            name_overscore_step: o.name_overscore_step
          }))
        }
      };

      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const { data: completeScenario, error: updateError } = await supabase
        .from('scenarios')
        .update({
          title: scenarioTitle,
          description: scenarioDescription,
          data: {
            game_meta: updatedConfig,
            quests: updatedConfig.quests,
            default_language: currentLanguage,
            available_languages: availableLanguages,
            translations: updatedTranslations
          },
          medias: {
            images: Object.fromEntries(
              Object.entries(updatedConfig).filter(([key]) =>
                key.endsWith('_image') && updatedConfig[key as keyof TagquestConfigData]
              )
            ),
            sounds: {
              top_1_sound: updatedConfig.top_1_sound,
              top_3_sound: updatedConfig.top_3_sound,
              top_10_sound: updatedConfig.top_10_sound,
              success_sound: updatedConfig.success_sound,
              cheating_sound: updatedConfig.cheating_sound,
              malus_sound: updatedConfig.malus_sound,
              late_malus_sound: updatedConfig.late_malus_sound
            },
            levels: updatedConfig.levels,
            quests: updatedConfig.quests,
            overscores: updatedConfig.overscores
          },
          updated_at: currentDate
        })
        .eq('id', scenarioId)
        .select()
        .single();

      if (updateError) throw updateError;
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

      const authHeaders = authService.getAuthHeaders() as Record<string, string>;

      const response = await fetch(`${API_BASE_URL}/scenarios.php?action=create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders.Authorization ? { 'Authorization': authHeaders.Authorization } : {}),
        },
        body: JSON.stringify({
          email: clientEmail,
          client_id: clientId,
          is_admin: isAdmin && !asClient ? '1' : '0',
          uniqid: scenarioUniqid,
          status: scenarioStatus,
          title: scenarioTitle || config.title || 'Untitled Scenario',
          description: scenarioDescription || config.title || 'No description provided',
          game_type: gameType,
          scenario_type: scenarioType,
          data: completeScenario.data || {},
          medias: completeScenario.medias || {},
          scenario_layout: scenarioLayout || []
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

      if (!responseData.success) {
        throw new Error(responseData.message || 'Unknown error from server');
      }

      updateStep(1, 'done');
      updateStep(2, 'doing');

      setPublishProgress('Collecting media files...');
      const mediaToUpload: { fieldName: string; url: string; fileName: string }[] = [];

      const imageFields = [
        'background_image', 'game_visual', 'malus_container', 'malus_image', 'combo_image',
        'team_name_container_image', 'timer_container_image', 'quest_counter_image', 'score_image', 'late_malus_image',
        'top_1_image', 'top_3_image', 'top_10_image'
      ];
      const soundFields = [
        'top_1_sound', 'top_3_sound', 'top_10_sound', 'success_sound', 'cheating_sound', 'malus_sound', 'late_malus_sound'
      ];

      imageFields.forEach(field => {
        const fileName = updatedConfig[field as keyof TagquestConfigData];
        if (fileName && typeof fileName === 'string') {
          mediaToUpload.push({ fieldName: field, url: getMediaUrlUtil(scenarioUniqid || scenarioId, fileName), fileName });
        }
      });

      soundFields.forEach(field => {
        const fileName = updatedConfig[field as keyof TagquestConfigData];
        if (fileName && typeof fileName === 'string') {
          mediaToUpload.push({ fieldName: field, url: getMediaUrlUtil(scenarioUniqid || scenarioId, fileName), fileName });
        }
      });

      updatedConfig.quests.forEach((quest, qIdx) => {
        if (quest.main_image) {
          mediaToUpload.push({
            fieldName: `quest_${qIdx}_main_image`,
            url: getMediaUrlUtil(scenarioUniqid || scenarioId, quest.main_image),
            fileName: quest.main_image
          });
        }
        if (quest.sound) {
          mediaToUpload.push({
            fieldName: `quest_${qIdx}_sound`,
            url: getMediaUrlUtil(scenarioUniqid || scenarioId, quest.sound),
            fileName: quest.sound
          });
        }
        ['image_1', 'image_2', 'image_3', 'image_4'].forEach((imgKey, imgIdx) => {
          const img = quest[imgKey as keyof Quest];
          if (img && typeof img === 'string') {
            mediaToUpload.push({
              fieldName: `quest_${qIdx}_image_${imgIdx + 1}`,
              url: getMediaUrlUtil(scenarioUniqid || scenarioId, img),
              fileName: img
            });
          }
        });
      });

      const uniqueMedia = Array.from(
        new Map(mediaToUpload.map(item => [item.fileName, item])).values()
      );

      console.log(`Total media files collected: ${uniqueMedia.length}`);

      updateStep(2, 'done', `Collected ${uniqueMedia.length} media files`);

      let mediaToUploadFiltered = uniqueMedia;
      let alreadyUploadedCount = 0;

      if (!publishAllMedia) {
        const uploadedFilenames = getUploadedFilenames(scenarioUniqid || scenarioId);
        mediaToUploadFiltered = uniqueMedia.filter(m => !uploadedFilenames.has(m.fileName));
        alreadyUploadedCount = uniqueMedia.length - mediaToUploadFiltered.length;
        console.log(`${alreadyUploadedCount} files already uploaded, ${mediaToUploadFiltered.length} new files to upload`);
      } else {
        console.log('Publishing all media files (forced), uploading all ' + uniqueMedia.length + ' files');
      }

      updateStep(3, 'doing', `Upload media files (0/${mediaToUploadFiltered.length})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} already uploaded` : ''}`);

      if (mediaToUploadFiltered.length > 0) {
        for (let i = 0; i < mediaToUploadFiltered.length; i++) {
          const media = mediaToUploadFiltered[i];
          updateStep(3, 'doing', `Upload media files (${i + 1}/${mediaToUploadFiltered.length})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} already uploaded` : ''}`);
          setPublishProgress(`Uploading media ${i + 1}/${mediaToUploadFiltered.length}: ${media.fileName}...`);
          console.log(`Uploading ${media.fileName}...`);

          try {
            const response = await fetch(media.url);
            if (!response.ok) throw new Error(`Failed to fetch ${media.fileName}`);
            const blob = await response.blob();
            const file = new File([blob], media.fileName, { type: blob.type });

            const formData = new FormData();
            formData.append('file', file);
            formData.append('uniqid', scenarioUniqid);
            formData.append('email', clientEmail);

            const uploadHeaders = authService.getAuthHeaders() as Record<string, string>;
            const uploadResponse = await fetch(`${API_BASE_URL}/scenarios.php?action=upload_media`, {
              method: 'POST',
              headers: uploadHeaders.Authorization
                ? { 'Authorization': uploadHeaders.Authorization }
                : {},
              body: formData
            });

            const uploadResult = await uploadResponse.json();
            if (!uploadResponse.ok || !uploadResult.success) {
              console.warn(`Failed to upload ${media.fileName}:`, uploadResult.message);
            } else {
              console.log(`Successfully uploaded ${media.fileName}`);
              markUploaded(scenarioUniqid || scenarioId, media.fileName);
            }
          } catch (err) {
            console.warn(`Failed to upload ${media.fileName}:`, err);
          }
        }
      }

      const totalCount = alreadyUploadedCount + mediaToUploadFiltered.length;
      updateStep(3, 'done', `Upload media files (${totalCount}/${totalCount})${alreadyUploadedCount > 0 ? ` - ${alreadyUploadedCount} skipped` : ''}`);

      setShowPublishConfirm(false);
      setPublishProgress('');
      setPublishSteps([]);
      setPublishAllMedia(false);

      const successMessage = publishAllMedia
        ? `Scenario "${config.title}" has been successfully published! All ${mediaToUploadFiltered.length} media files were uploaded.`
        : `Scenario "${config.title}" has been successfully published! ${mediaToUploadFiltered.length} new/changed media files were uploaded${alreadyUploadedCount > 0 ? `, ${alreadyUploadedCount} files were skipped (already uploaded)` : ''}.`;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading configuration...</div>
      </div>
    );
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navigationSections = [
    { id: 'basic', label: 'Basic Settings' },
    { id: 'scenario_setting', label: 'Scenario Settings' },
    { id: 'story', label: 'Story' },
    { id: 'timing', label: 'Timing & Animation' },
    { id: 'styling', label: 'Styling' },
    { id: 'images', label: 'Images' },
    { id: 'rankings', label: 'Rankings' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'malus-combo', label: 'Malus/Combo' },
    { id: 'levels', label: 'Levels' },
    { id: 'quests', label: 'Quests' },
    { id: 'texts', label: 'Texts' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">{scenarioTitle}</h1>
            <p className="text-slate-400">Tagquest Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
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

        {/* Basic Settings */}
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
                    Scenario Version
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

        {/* Scenario Setting */}
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
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Number of Quests
                  </label>
                  <input
                    type="number"
                    value={config.number_of_quests}
                    onChange={(e) => updateField('number_of_quests', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Story Section */}
        <div id="story" className="bg-slate-800 rounded-lg border border-slate-700">
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

        {/* Timing & Animation */}
        <div id="timing" className="bg-slate-800 rounded-lg border border-slate-700">
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
                    Animation Message Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.animation_message_duration}
                    onChange={(e) => updateField('animation_message_duration', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    End Station
                  </label>
                  <input
                    type="number"
                    value={config.end_station}
                    onChange={(e) => updateField('end_station', e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Styling */}
        <div id="styling" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('styling')}
          >
            <h3 className="text-xl font-semibold text-white">Styling</h3>
            {collapsedSections['styling'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['styling'] && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Font
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={config.font}
                      onChange={(e) => updateField('font', e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    >
                      {[...predefinedFonts, ...customFonts].map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
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

                  <div className="mt-3 p-4 bg-slate-900 border border-slate-700 rounded-lg">
                    <p className="text-xs text-slate-400 mb-2">Preview:</p>
                    <p
                      style={{
                        fontFamily: config.font,
                        fontSize: '24px',
                        fontWeight: 'bold'
                      }}
                      className="text-white"
                    >
                      {config.title || 'Tagquest Game Title'}
                    </p>
                  </div>

                  {showCustomFontInput && (
                    <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded-lg">
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newCustomFont}
                          onChange={(e) => setNewCustomFont(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addCustomFont()}
                          placeholder="Enter font name (e.g., Roboto)"
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={addCustomFont}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                        >
                          Add
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">
                        Make sure the font is installed on the system or loaded via @font-face
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Font Color
                  </label>
                  <input
                    type="color"
                    value={config.font_color}
                    onChange={(e) => updateField('font_color', e.target.value)}
                    className="w-full h-10 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Level Font Color
                  </label>
                  <input
                    type="color"
                    value={config.level_font_color}
                    onChange={(e) => updateField('level_font_color', e.target.value)}
                    className="w-full h-10 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Images Section */}
        <div id="images" className="bg-slate-800 rounded-lg border border-slate-700">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Background Image', 'background_image', config.background_image)}
                {renderImageUpload('Game Visual', 'game_visual', config.game_visual)}
              </div>

              <div className="mb-4 p-4 bg-slate-700/30 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDefaultImages}
                    onChange={(e) => handleUseDefaultImages(e.target.checked)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-300">Use Default Images</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Malus Container', 'malus_container', config.malus_container)}
                {renderImageUpload('Combos Container', 'combo_image', config.combo_image)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Team Name Container', 'team_name_container_image', config.team_name_container_image)}
                {renderImageUpload('Timer Container', 'timer_container_image', config.timer_container_image)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Quest Counter Image', 'quest_counter_image', config.quest_counter_image)}
                {renderImageUpload('Score Image', 'score_image', config.score_image)}
              </div>
            </div>
          )}
        </div>

        {/* Rankings Section */}
        <div id="rankings" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('rankings')}
          >
            <h3 className="text-xl font-semibold text-white">Rankings</h3>
            {collapsedSections['rankings'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['rankings'] && (
            <div className="px-6 pb-6 space-y-6">
              {/* Images Subsection */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <h4 className="text-lg font-semibold text-white mb-4">Images</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderImageUpload('Top 1 Image', 'top_1_image', config.top_1_image)}
                    {renderImageUpload('Top 3 Image', 'top_3_image', config.top_3_image)}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderImageUpload('Top 10 Image', 'top_10_image', config.top_10_image)}
                  </div>
                </div>
              </div>

              {/* Sounds Subsection */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <h4 className="text-lg font-semibold text-white mb-4">Sounds</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderSoundUpload('Top 1 Sound', 'top_1_sound', config.top_1_sound)}
                    {renderSoundUpload('Top 3 Sound', 'top_3_sound', config.top_3_sound)}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderSoundUpload('Top 10 Sound', 'top_10_sound', config.top_10_sound)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sounds Section */}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderSoundUpload('Cheating Sound', 'cheating_sound', config.cheating_sound)}
                {renderSoundUpload('Success Sound', 'success_sound', config.success_sound)}
              </div>
            </div>
          )}
        </div>

        {/* Malus/Combo Section */}
        <div id="malus-combo" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('malus-combo')}
          >
            <h3 className="text-xl font-semibold text-white">Malus / Combo</h3>
            {collapsedSections['malus-combo'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['malus-combo'] && (
            <div className="px-6 pb-6 space-y-6">
              {/* Combo Subsection */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <h4 className="text-lg font-semibold text-white mb-4">Combo</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      2 Quests
                    </label>
                    <input
                      type="number"
                      value={config.combo_2_quests}
                      onChange={(e) => updateField('combo_2_quests', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      4 Quests
                    </label>
                    <input
                      type="number"
                      value={config.combo_4_quests}
                      onChange={(e) => updateField('combo_4_quests', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      6 Quests
                    </label>
                    <input
                      type="number"
                      value={config.combo_6_quests}
                      onChange={(e) => updateField('combo_6_quests', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Malus Subsection */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <h4 className="text-lg font-semibold text-white mb-4">Malus</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Malus Points
                    </label>
                    <input
                      type="number"
                      value={config.malus_points}
                      onChange={(e) => updateField('malus_points', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Station Number
                    </label>
                    <input
                      type="number"
                      value={config.malus_station_number}
                      onChange={(e) => updateField('malus_station_number', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Late Malus Points
                    </label>
                    <input
                      type="number"
                      value={config.late_malus_points}
                      onChange={(e) => updateField('late_malus_points', e.target.value)}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {renderImageUpload('Malus Image', 'malus_image', config.malus_image)}
                  {renderImageUpload('Late Malus Image', 'late_malus_image', config.late_malus_image)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {renderSoundUpload('Malus Sound', 'malus_sound', config.malus_sound)}
                  {renderSoundUpload('Late Malus Sound', 'late_malus_sound', config.late_malus_sound)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Levels Section */}
        <div id="levels" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('levels')}
          >
            <h3 className="text-xl font-semibold text-white">Levels</h3>
            {collapsedSections['levels'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['levels'] && (
            <div className="px-6 pb-6 space-y-4">
              {Object.entries(config.levels).map(([key, level]) => (
                <div key={key} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-white">Level {key}</h4>
                    <button
                      onClick={() => removeLevel(key)}
                      className="p-2 text-red-400 hover:text-red-300 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Points
                      </label>
                      <input
                        type="number"
                        value={level.points}
                        onChange={(e) => updateLevel(key, 'points', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        Name
                        <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                          {currentLanguage.toUpperCase()}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={level.name}
                        onChange={(e) => updateLevel(key, 'name', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        Description
                        <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                          {currentLanguage.toUpperCase()}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={level.description}
                        onChange={(e) => updateLevel(key, 'description', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addLevel}
                className="w-full py-3 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-slate-500 hover:text-slate-300 transition flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                Add Level
              </button>
            </div>
          )}
        </div>

        {/* Quests Section */}
        <div id="quests" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('quests')}
          >
            <h3 className="text-xl font-semibold text-white">Quests</h3>
            {collapsedSections['quests'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['quests'] && (
            <div className="px-6 pb-6 space-y-4">
              {config.quests.map((quest, index) => (
                <div key={index} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-white">Quest {index + 1}</h4>
                    <button
                      onClick={() => removeQuest(index)}
                      className="p-2 text-red-400 hover:text-red-300 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                          Name
                          <span className="px-2 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded border border-blue-600/30">
                            {currentLanguage.toUpperCase()}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={quest.name}
                          onChange={(e) => updateQuest(index, 'name', e.target.value)}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Points
                        </label>
                        <input
                          type="number"
                          value={quest.points}
                          onChange={(e) => updateQuest(index, 'points', e.target.value)}
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h5 className="text-md font-semibold text-white mb-3">Main Quest Image</h5>
                      {renderQuestImage('Main Image', index, 'main_image', quest.main_image)}
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h5 className="text-md font-semibold text-white mb-3">Additional Images</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderQuestImage('Image 1', index, 'image_1', quest.image_1)}
                        {renderQuestImage('Image 2', index, 'image_2', quest.image_2)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {renderQuestImage('Image 3', index, 'image_3', quest.image_3)}
                        {renderQuestImage('Image 4', index, 'image_4', quest.image_4)}
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h5 className="text-md font-semibold text-white mb-3">Sound</h5>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Quest Sound
                        </label>
                        {quest.sound ? (
                          <div className="space-y-2">
                            <div className="relative rounded-lg bg-slate-900 border border-slate-700 p-4">
                              <audio controls className="w-full mb-2">
                                <source src={getMediaUrl(quest.sound)} />
                                Your browser does not support the audio element.
                              </audio>
                              <button
                                onClick={() => {
                                  const updatedQuests = [...config.quests];
                                  updatedQuests[index] = { ...updatedQuests[index], sound: '' };
                                  setConfig({ ...config, quests: updatedQuests });
                                }}
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
                            className="border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 border-slate-700 hover:border-blue-400"
                            onClick={() => handleQuestSoundClick(index)}
                          >
                            <Upload size={32} className="mx-auto mb-2 text-slate-400" />
                            <p className="text-sm text-slate-400">Drag & drop or click to select</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addQuest}
                className="w-full py-3 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-slate-500 hover:text-slate-300 transition flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                Add Quest
              </button>
            </div>
          )}
        </div>

        {/* Texts Section */}
        <div id="texts" className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('texts')}
          >
            <h3 className="text-xl font-semibold text-white">Texts</h3>
            {collapsedSections['texts'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['texts'] && (
          <div className="px-6 pb-6 space-y-6">
            <div className="mb-4 p-4 bg-slate-700/30 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDefaultTexts}
                  onChange={(e) => handleUseDefaultTexts(e.target.checked)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-slate-300">Use Default Texts</span>
              </label>
            </div>

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

        <div className="flex flex-col gap-4 pt-4">
          <div className="flex items-center gap-4 flex-wrap">
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
              className="px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>

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

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

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

      {showAddLanguageModal && (
        <AddLanguageModal
          onClose={() => setShowAddLanguageModal(false)}
          onAdd={handleAddLanguage}
          existingLanguages={availableLanguages}
        />
      )}

      <ClientEmailModal
        isOpen={showClientEmailModal}
        onSubmit={doPublish}
        onCancel={() => setShowClientEmailModal(false)}
        title="Publish Scenario"
        description="Enter the client email address to publish this scenario under"
      />

      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="relative max-w-6xl max-h-[90vh] bg-slate-800 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-700">
              <h3 className="text-xl font-semibold text-white">{imagePreview.title}</h3>
              <button
                onClick={() => setImagePreview(null)}
                className="p-2 text-slate-400 hover:text-white transition"
              >
                <Trash2 size={24} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={imagePreview.url}
                alt={imagePreview.title}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
