// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit, Trash2, Eye, FileArchive, Book } from 'lucide-react';
import { supabase } from '../lib/db';
import { getMediaUrl } from '../utils/mediaUrl';
import { ConfirmDialog } from './ConfirmDialog';

interface Scenario {
  id: string;
  uniqid?: string;
  title: string;
  game_type: 'mystery' | 'tagquest' | 'tracks';
  slug: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  scenario_type: 'product' | 'custom';
  default_pattern_id?: string | null;
  created_at: string;
  updated_at: string;
  data?: {
    game_visual?: string;
    background_image?: string;
    [key: string]: any;
  };
  media?: {
    images?: {
      game_visual?: string;
      background_image?: string;
      [key: string]: string;
    };
    [key: string]: any;
  };
}

interface ScenarioListProps {
  onCreateNew: () => void;
  onEdit: (scenario: Scenario) => void;
  onConfigure: (scenario: Scenario) => void;
  onImport: () => void;
  onViewDocs: () => void;
}

export function ScenarioList({ onCreateNew, onEdit, onConfigure, onImport, onViewDocs }: ScenarioListProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; scenario: Scenario | null; isDeleting: boolean }>({
    isOpen: false,
    scenario: null,
    isDeleting: false
  });

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .order('game_type', { ascending: true })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setScenarios(data || []);
    } catch (error) {
      console.error('Error loading scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDialog = (scenario: Scenario) => {
    setDeleteDialog({ isOpen: true, scenario, isDeleting: false });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ isOpen: false, scenario: null, isDeleting: false });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.scenario) return;

    setDeleteDialog(prev => ({ ...prev, isDeleting: true }));

    try {
      const scenarioId = deleteDialog.scenario.id;
      const storageKey = deleteDialog.scenario.uniqid || scenarioId;

      const { data: mediaFiles } = await supabase.storage
        .from('game-media')
        .list(storageKey);

      if (mediaFiles && mediaFiles.length > 0) {
        const filesToDelete = mediaFiles.map(file => `${storageKey}/${file.name}`);
        await supabase.storage.from('game-media').remove(filesToDelete);
      }

      const { error } = await supabase
        .from('scenarios')
        .delete()
        .eq('id', scenarioId);

      if (error) throw error;
      setScenarios(scenarios.filter(s => s.id !== scenarioId));
      closeDeleteDialog();
    } catch (error) {
      console.error('Error deleting scenario:', error);
      setDeleteDialog(prev => ({ ...prev, isDeleting: false }));
    }
  };

  const getGameTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      mystery: 'Mystery',
      tagquest: 'Tag Quest',
      tracks: 'Tracks'
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-600',
      published: 'bg-green-600',
      archived: 'bg-gray-600'
    };
    return colors[status] || 'bg-slate-600';
  };

  const getScenarioImage = (scenario: Scenario) => {
    // Check new media structure first
    if (scenario.media?.images) {
      const imageFile = scenario.media.images.game_visual || scenario.media.images.background_image;
      if (imageFile) {
        return getMediaUrl(scenario.id, imageFile);
      }
    }

    // Fallback to old data structure
    if (scenario.data) {
      // Check for tagquest format (game_meta.game_visual)
      const tagquestImage = scenario.data.game_meta?.game_visual;
      if (tagquestImage) {
        // If it's already a full URL, return it directly
        if (tagquestImage.startsWith('http')) {
          return tagquestImage;
        }
        return getMediaUrl(scenario.id, tagquestImage);
      }

      // Check for mystery format (game_visual)
      const imageFile = scenario.data.game_visual || scenario.data.background_image;
      if (imageFile) {
        // If it's already a full URL, return it directly
        if (imageFile.startsWith('http')) {
          return imageFile;
        }
        return getMediaUrl(scenario.id, imageFile);
      }
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading scenarios...</div>
      </div>
    );
  }

  if (scenarios.length === 0) {
    return (
      <div className="text-center py-20">
        <h2 className="text-3xl font-bold text-white mb-4">Your Scenarios</h2>
        <p className="text-slate-400 mb-8">No scenarios created yet</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onCreateNew}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus size={20} />
            Create Your First Scenario
          </button>
          <button
            onClick={onImport}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <FileArchive size={20} />
            Import from Zip
          </button>
          <button
            onClick={onViewDocs}
            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition flex items-center gap-2"
          >
            <Book size={20} />
            View Import Guide
          </button>
        </div>
      </div>
    );
  }

  const groupedScenarios = scenarios.reduce((acc, scenario) => {
    const type = scenario.game_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(scenario);
    return acc;
  }, {} as Record<string, Scenario[]>);

  const renderScenarioCard = (scenario: Scenario) => {
    const imageUrl = getScenarioImage(scenario);

    return (
      <div
        key={scenario.id}
        className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-600 transition"
      >
        {imageUrl && (
          <div className="w-full aspect-square bg-slate-900">
            <img
              src={imageUrl}
              alt={scenario.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white mb-2">{scenario.title}</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 text-xs rounded bg-blue-600 text-white">
                  {getGameTypeLabel(scenario.game_type)}
                </span>
                <span className={`px-2 py-1 text-xs rounded text-white ${getStatusColor(scenario.status)}`}>
                  {scenario.status}
                </span>
                <span className={`px-2 py-1 text-xs rounded text-white ${scenario.scenario_type === 'product' ? 'bg-amber-600' : 'bg-slate-600'}`}>
                  {scenario.scenario_type}
                </span>
              </div>
            </div>
          </div>

          {scenario.description && (
            <p className="text-slate-400 text-sm mb-4 line-clamp-2">
              {scenario.description}
            </p>
          )}

          <div className="text-slate-500 text-xs mb-4">
            Updated {new Date(scenario.updated_at).toLocaleDateString()}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onConfigure(scenario)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <Eye size={16} />
              Configure
            </button>
            <button
              onClick={() => onEdit(scenario)}
              className="px-3 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={() => openDeleteDialog(scenario)}
              className="px-3 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-white">Your Scenarios</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={onViewDocs}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition flex items-center gap-2"
          >
            <Book size={18} />
            Import Docs
          </button>
          <button
            onClick={onImport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <FileArchive size={18} />
            Import from Zip
          </button>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus size={18} />
            Create New
          </button>
        </div>
      </div>

      {Object.entries(groupedScenarios).map(([gameType, typeScenarios]) => (
        <div key={gameType} className="mb-12">
          <h3 className="text-2xl font-bold text-white mb-4 border-b border-slate-700 pb-2">
            {getGameTypeLabel(gameType)} <span className="text-slate-500 text-lg">({typeScenarios.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {typeScenarios.map((scenario) => renderScenarioCard(scenario))}
          </div>
        </div>
      ))}

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onConfirm={confirmDelete}
        onCancel={closeDeleteDialog}
        title="Delete Scenario"
        message={deleteDialog.scenario ?
          `Are you sure you want to delete "${deleteDialog.scenario.title}"?\n\nThis will permanently delete:\n• The scenario and all its data\n• All associated media files\n• Game configurations\n\nThis action cannot be undone.` :
          ''
        }
        confirmText="Delete Scenario"
        cancelText="Cancel"
        variant="danger"
        isProcessing={deleteDialog.isDeleting}
      />
    </div>
  );
}
