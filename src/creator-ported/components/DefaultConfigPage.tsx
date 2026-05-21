import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Upload, ChevronDown, ChevronUp, Send, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { Alert } from './Alert';
import { ClientEmailModal } from './ClientEmailModal';
import { ConfirmDialog, PublishStep } from './ConfirmDialog';
import { authService } from '../services/authService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface DefaultConfig {
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
  malus_container: string;
  malus_image: string;
  combo_image: string;
  team_name_container_image: string;
  quest_counter_image: string;
  score_image: string;
  timer_container_image: string;
}

interface DefaultConfigPageProps {
  onBack: () => void;
  gameType?: 'tagquest' | 'mystery' | 'tracks';
}

export function DefaultConfigPage({ onBack, gameType = 'tagquest' }: DefaultConfigPageProps) {
  const [config, setConfig] = useState<DefaultConfig>({
    team_title: 'Équipe',
    pdf_title: 'TagQuest',
    auto_reset: false,
    delay_auto_reset: '5',
    text_player_starts: 'Début de la partie',
    text_card_not_empty: 'La carte n\'est pas vide',
    text_team_starts_card_not_empty: 'L\'équipe démarre avec une carte non vide',
    text_card_not_corresponding: 'Carte non reconnue',
    text_team_ended: 'L\'équipe a terminé',
    text_all_team_ended: 'Toutes les équipes ont terminé',
    text_scenario_ended: 'Le scénario est terminé',
    text_team_reached_new_level: 'Nouveau niveau atteint!',
    text_card_empty: 'Carte vide',
    text_late_malus: 'Malus de retard',
    text_team_enters_top_ranking: 'Entrée dans le classement',
    text_team_enters_podium: 'Entrée sur le podium!',
    text_team_first_place: 'Première place!',
    text_following_top_podium: 'Suite au classement',
    text_if_error: 'Erreur',
    text_is_card_empty: 'Carte vide?',
    message_display_time: '2',
    animation_display_time: '1',
    malus_container: '',
    malus_image: '',
    combo_image: '',
    team_name_container_image: '',
    quest_counter_image: '',
    score_image: '',
    timer_container_image: ''
  });

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOverField, setDragOverField] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1.0);
  const [publishing, setPublishing] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [showClientEmailModal, setShowClientEmailModal] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);

  useEffect(() => {
    loadDefaultConfig();
    loadUserEmail();

    // Debug admin status
    const token = authService.getToken();
    console.log('DefaultConfigPage - Admin status check:', {
      isAdmin: authService.isAdmin(),
      tokenExists: !!token,
      tokenIsAdmin: token?.is_admin,
      email: authService.getEmail()
    });
  }, []);

  const loadUserEmail = () => {
    try {
      console.log('Loading user email from auth service...');
      const email = authService.getEmail() || '';
      console.log('Authenticated user email:', email || '(not logged in)');
      setUserEmail(email);
    } catch (error) {
      console.error('Error loading user email:', error);
    }
  };

  const loadDefaultConfig = async () => {
    try {
      const { data, error } = await db
        .from('default_config')
        .select('value, version')
        .eq('meta', `${gameType}_default_data`)
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        setConfig({ ...config, ...data.value });
      }
      if (data?.version) {
        setCurrentVersion(Number(data.version));
      }
    } catch (error) {
      console.error('Error loading default config:', error);
      setAlert({
        type: 'error',
        message: 'Failed to load default configuration'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateField = (field: keyof DefaultConfig, value: string | boolean) => {
    setConfig({ ...config, [field]: value });
  };

  const handleImageUpload = async (field: keyof DefaultConfig, file: File) => {
    try {
      const fileName = `${field}_${Date.now()}_${file.name}`;
      const storagePath = `default_images/${fileName}`;

      const { error: uploadError } = await db.storage
        .from('game-media')
        .upload(storagePath, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = db.storage
        .from('game-media')
        .getPublicUrl(storagePath);

      updateField(field, urlData.publicUrl);

      setAlert({
        type: 'success',
        message: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      setAlert({
        type: 'error',
        message: 'Failed to upload image'
      });
    }
  };

  const handleImageDrop = async (e: React.DragEvent, field: keyof DefaultConfig) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (!imageFile) {
      setAlert({
        type: 'error',
        message: 'Please drop an image file'
      });
      return;
    }

    await handleImageUpload(field, imageFile);
  };

  const handleImageDragOver = (e: React.DragEvent, field: keyof DefaultConfig) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverField !== field) {
      setDragOverField(field);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverField(null);
  };

  const handleImageClick = (field: keyof DefaultConfig) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await handleImageUpload(field, file);
      }
    };
    input.click();
  };

  const deleteImage = (field: keyof DefaultConfig) => {
    updateField(field, '');
  };

  const renderImageUpload = (label: string, field: keyof DefaultConfig, value: string) => (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      {value ? (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
            <img
              src={value}
              alt={label}
              className="w-full h-48 object-cover"
            />
            <button
              onClick={() => deleteImage(field)}
              className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              title="Delete image"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer bg-slate-900 ${
            dragOverField === field
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-700 hover:border-blue-400'
          }`}
          onDrop={(e) => handleImageDrop(e, field)}
          onDragOver={(e) => handleImageDragOver(e, field)}
          onDragLeave={handleDragLeave}
          onClick={() => handleImageClick(field)}
        >
          <Upload size={32} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-400">Drag & drop or click to select</p>
        </div>
      )}
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const newVersion = Number((currentVersion + 0.1).toFixed(1));

      const { error } = await db
        .from('default_config')
        .upsert({
          meta: `${gameType}_default_data`,
          value: config,
          version: newVersion,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'meta'
        });

      if (error) throw error;

      setCurrentVersion(newVersion);
      setAlert({
        type: 'success',
        message: `Default configuration saved successfully (v${newVersion})`
      });
    } catch (error) {
      console.error('Error saving default config:', error);
      setAlert({
        type: 'error',
        message: 'Failed to save default configuration'
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!userEmail) {
      console.error('Publish failed: User is not authenticated');
      setAlert({
        type: 'error',
        message: 'You must be logged in to publish configurations.'
      });
      return;
    }

    const authToken = authService.getToken();
    if (!authToken || !authToken.token) {
      console.error('Publish failed: No valid authentication token');
      setAlert({
        type: 'error',
        message: 'Authentication token not found. Please log out and log back in.'
      });
      return;
    }

    if (Date.now() >= authToken.expires_at * 1000) {
      console.error('Publish failed: Authentication token expired');
      setAlert({
        type: 'error',
        message: 'Your session has expired. Please log out and log back in.'
      });
      authService.logout();
      return;
    }

    const userClientId = authService.getClientId();
    if (!userClientId) {
      setAlert({
        type: 'error',
        message: 'Could not retrieve user information. Please try logging in again.'
      });
      return;
    }

    await doPublish(userEmail, userClientId);
  };

  const handlePublishAsClient = async () => {
    const authToken = authService.getToken();
    if (!authToken || !authToken.token) {
      console.error('Publish failed: No valid authentication token');
      setAlert({
        type: 'error',
        message: 'Authentication token not found. Please log out and log back in.'
      });
      return;
    }

    if (Date.now() >= authToken.expires_at * 1000) {
      console.error('Publish failed: Authentication token expired');
      setAlert({
        type: 'error',
        message: 'Your session has expired. Please log out and log back in.'
      });
      authService.logout();
      return;
    }

    setShowClientEmailModal(true);
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

  const doPublish = async (clientEmail: string, clientId: string) => {
    setShowClientEmailModal(false);
    console.log('=== Starting Default Config Publish ===');
    console.log('Client Email:', clientEmail);
    console.log('Client ID:', clientId);
    console.log('Game Type:', gameType);
    console.log('Current Version:', currentVersion);

    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
      setAlert({
        type: 'error',
        message: 'You are not logged in or your session has expired. Please log in again.'
      });
      return;
    }

    setShowPublishConfirm(true);
    setPublishing(true);

    // Initialize steps
    setPublishSteps([
      { label: 'Save configuration', status: 'doing' },
      { label: 'Publish to Taghunter', status: 'todo' },
    ]);
    try {
      console.log('Saving configuration before publish...');
      await handleSave();
      updateStep(0, 'done');
      updateStep(1, 'doing');

      const newVersion = currentVersion + 0.1;
      const payload = {
        user_email: clientEmail,
        meta: `${gameType}_default_data`,
        version: newVersion,
        value: config
      };

      console.log('Publishing to Taghunter server...');
      console.log('Payload:', {
        user_email: clientEmail,
        meta: payload.meta,
        version: payload.version,
        configKeys: Object.keys(config)
      });

      const authHeaders = authService.getAuthHeaders() as Record<string, string>;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeaders.Authorization) {
        headers['Authorization'] = authHeaders.Authorization;
      } else {
        throw new Error('Authentication token is missing. Please log in again.');
      }

      const apiUrl = `${API_BASE_URL}/default_config.php?action=create`;
      console.log('=== API URL ===');
      console.log(apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response body:', responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response as JSON');
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        console.error('Publish failed:', response.status, responseText);
        const errorMsg = responseData.error || responseData.details || `Failed to publish configuration (${response.status})`;

        // Check if it's an authentication error
        if (response.status === 401 || errorMsg.includes('Unauthorized') || errorMsg.includes('Invalid or expired token')) {
          throw new Error('Authentication failed. Your session may have expired. Please log out and log in again.');
        }

        throw new Error(errorMsg);
      }

      updateStep(1, 'done');
      console.log('Default configuration published successfully');
      setCurrentVersion(newVersion);

      setShowPublishConfirm(false);
      setPublishSteps([]);

      setAlert({
        type: 'success',
        message: 'Default configuration published successfully to Taghunter server'
      });
    } catch (error) {
      console.error('Error publishing default config:', error);
      setPublishSteps([]);
      setAlert({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to publish default configuration'
      });
    } finally {
      setPublishing(false);
      console.log('=== Default Config Publish Complete ===');
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto p-6">
        <div className="text-center text-slate-400">Loading default configuration...</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      <ClientEmailModal
        isOpen={showClientEmailModal}
        onSubmit={doPublish}
        onCancel={() => setShowClientEmailModal(false)}
        title="Publish Default Configuration"
        description="Enter the client email address to publish this default configuration under"
      />

      <ConfirmDialog
        isOpen={showPublishConfirm}
        onCancel={() => {
          if (!publishing) {
            setShowPublishConfirm(false);
            setPublishSteps([]);
          }
        }}
        onConfirm={() => {}}
        title="Publishing Default Configuration"
        message={publishing ? "Publishing your default configuration..." : ""}
        confirmText="OK"
        variant="info"
        steps={publishSteps}
        isProcessing={publishing}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg transition"
          >
            <ArrowLeft className="text-slate-400" size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Default Configuration - {gameType === 'tagquest' ? 'TagQuest' : gameType === 'mystery' ? 'Mystery' : 'Tracks'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">Version {currentVersion.toFixed(1)}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || publishing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Defaults'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Send size={20} />
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
          {authService.isAdmin() && (
            <button
              onClick={handlePublishAsClient}
              disabled={publishing || saving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
            >
              <Send size={20} />
              {publishing ? 'Publishing...' : 'Publish as Client'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('images')}
          >
            <h3 className="text-xl font-semibold text-white">Default Images</h3>
            {collapsedSections['images'] ? <ChevronDown size={24} className="text-slate-400" /> : <ChevronUp size={24} className="text-slate-400" />}
          </div>
          {!collapsedSections['images'] && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Malus Container', 'malus_container', config.malus_container)}
                {renderImageUpload('Combos Container', 'combo_image', config.combo_image)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Team Name Container', 'team_name_container_image', config.team_name_container_image)}
                {renderImageUpload('Quest Counter Image', 'quest_counter_image', config.quest_counter_image)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderImageUpload('Score Image', 'score_image', config.score_image)}
                {renderImageUpload('Timer Container', 'timer_container_image', config.timer_container_image)}
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div
            className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-750 transition"
            onClick={() => toggleSection('texts')}
          >
            <h3 className="text-xl font-semibold text-white">Default Texts</h3>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Team Title</label>
                      <input
                        type="text"
                        value={config.team_title}
                        onChange={(e) => updateField('team_title', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">PDF Title</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Delay Auto Reset (seconds)</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Player Starts</label>
                      <input
                        type="text"
                        value={config.text_player_starts}
                        onChange={(e) => updateField('text_player_starts', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Card Not Empty</label>
                      <input
                        type="text"
                        value={config.text_card_not_empty}
                        onChange={(e) => updateField('text_card_not_empty', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team Starts with Card Not Empty</label>
                      <input
                        type="text"
                        value={config.text_team_starts_card_not_empty}
                        onChange={(e) => updateField('text_team_starts_card_not_empty', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Card Not Corresponding to Any Team</label>
                      <input
                        type="text"
                        value={config.text_card_not_corresponding}
                        onChange={(e) => updateField('text_card_not_corresponding', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team Ended</label>
                      <input
                        type="text"
                        value={config.text_team_ended}
                        onChange={(e) => updateField('text_team_ended', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text All Team Ended</label>
                      <input
                        type="text"
                        value={config.text_all_team_ended}
                        onChange={(e) => updateField('text_all_team_ended', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Scenario Ended</label>
                      <input
                        type="text"
                        value={config.text_scenario_ended}
                        onChange={(e) => updateField('text_scenario_ended', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team Reached New Level</label>
                      <input
                        type="text"
                        value={config.text_team_reached_new_level}
                        onChange={(e) => updateField('text_team_reached_new_level', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Card Empty</label>
                      <input
                        type="text"
                        value={config.text_card_empty}
                        onChange={(e) => updateField('text_card_empty', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Late Malus</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team Enters Top Ranking</label>
                      <input
                        type="text"
                        value={config.text_team_enters_top_ranking}
                        onChange={(e) => updateField('text_team_enters_top_ranking', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team Enters Podium</label>
                      <input
                        type="text"
                        value={config.text_team_enters_podium}
                        onChange={(e) => updateField('text_team_enters_podium', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Team in First Place</label>
                      <input
                        type="text"
                        value={config.text_team_first_place}
                        onChange={(e) => updateField('text_team_first_place', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Following Top or Podium Entrance</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text If Error</label>
                      <input
                        type="text"
                        value={config.text_if_error}
                        onChange={(e) => updateField('text_if_error', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Text Is Card Empty</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-2">Message Display Time (seconds)</label>
                      <input
                        type="number"
                        value={config.message_display_time}
                        onChange={(e) => updateField('message_display_time', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Animation Display Time (seconds)</label>
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
      </div>
    </div>
  );
}
