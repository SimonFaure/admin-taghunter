// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { ArrowLeft, BookOpen, FileArchive, Settings, Play, Database, Upload, Edit, Eye, Trash2, Download, Mail, FolderTree, File, Image, Music, Video, FileText } from 'lucide-react';

interface HelpPageProps {
  onBack: () => void;
}

export function HelpPage({ onBack }: HelpPageProps) {
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="bg-slate-800 rounded-xl shadow-lg p-8 border border-slate-700">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Help & Documentation</h1>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="space-y-8">
          {/* Getting Started */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Play className="w-6 h-6 text-green-400" />
              Getting Started
            </h2>
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <p className="text-slate-300 mb-4">
                Taghunter Playground is a scenario management system for creating and configuring interactive games.
                You can create scenarios from scratch or import existing ones from ZIP files.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Create or Import a Scenario</h3>
                    <p className="text-slate-400 text-sm">
                      Start by creating a new scenario or importing an existing one from a ZIP file
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Configure Your Game</h3>
                    <p className="text-slate-400 text-sm">
                      Set up game settings, add media files, configure enigmas, and customize the layout
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Publish & Play</h3>
                    <p className="text-slate-400 text-sm">
                      Publish your scenario to make it available for gameplay
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Scenario Management */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Database className="w-6 h-6 text-purple-400" />
              Scenario Management
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <div className="flex items-center gap-2 mb-3">
                  <Edit className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-white">Create New Scenario</h3>
                </div>
                <p className="text-slate-400 text-sm">
                  Click "Create New" to start a fresh scenario. Choose a game type (Mystery, Tagquest, or Tracks),
                  add a title, slug, and description.
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <div className="flex items-center gap-2 mb-3">
                  <FileArchive className="w-5 h-5 text-green-400" />
                  <h3 className="font-semibold text-white">Import from ZIP</h3>
                </div>
                <p className="text-slate-400 text-sm">
                  Import pre-configured scenarios from ZIP files. The ZIP must follow a specific structure.
                  Click "Import Docs" for detailed format requirements.
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-semibold text-white">Configure Scenario</h3>
                </div>
                <p className="text-slate-400 text-sm">
                  Click the eye icon on any scenario to open configuration. Set up game parameters,
                  media files, enigmas, and customize the visual layout.
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <div className="flex items-center gap-2 mb-3">
                  <Trash2 className="w-5 h-5 text-red-400" />
                  <h3 className="font-semibold text-white">Delete Scenario</h3>
                </div>
                <p className="text-slate-400 text-sm">
                  Click the trash icon to permanently delete a scenario. This action cannot be undone.
                </p>
              </div>
            </div>
          </section>

          {/* Game Types */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Game Types</h2>
            <div className="space-y-3">
              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <h3 className="font-semibold text-white mb-2">Mystery Games</h3>
                <p className="text-slate-400 text-sm">
                  Interactive mystery-solving games with enigmas, clues, and puzzles. Players solve challenges
                  to progress through the story. Supports custom backgrounds, sounds, and media.
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <h3 className="font-semibold text-white mb-2">Tagquest Games</h3>
                <p className="text-slate-400 text-sm">
                  Location-based adventures where players navigate physical spaces and scan NFC tags or QR codes
                  to unlock content. Perfect for outdoor adventures and scavenger hunts.
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <h3 className="font-semibold text-white mb-2">Tracks Games</h3>
                <p className="text-slate-400 text-sm">
                  Track-based challenges and races. Configuration coming soon.
                </p>
              </div>
            </div>
          </section>

          {/* Configuration Options */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="w-6 h-6 text-orange-400" />
              Configuration Options
            </h2>
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600 space-y-4">
              <div>
                <h3 className="font-semibold text-white mb-2">Media Upload</h3>
                <p className="text-slate-400 text-sm mb-2">
                  Upload images, audio, and video files to use in your scenarios:
                </p>
                <ul className="text-slate-400 text-sm space-y-1 ml-4">
                  <li><strong className="text-white">Images:</strong> JPG, PNG, GIF, WEBP</li>
                  <li><strong className="text-white">Audio:</strong> MP3, WAV, OGG</li>
                  <li><strong className="text-white">Video:</strong> MP4</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2">Enigma Configuration</h3>
                <p className="text-slate-400 text-sm">
                  Create puzzles and challenges for players to solve. Set questions, answers, point values,
                  and associated media for correct/incorrect responses.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2">Layout Editor</h3>
                <p className="text-slate-400 text-sm">
                  Customize the visual layout of your game using a drag-and-drop interface. Position elements,
                  adjust sizes, and preview how your game will look to players.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2">Pattern-Based Configuration</h3>
                <p className="text-slate-400 text-sm">
                  Use pre-defined patterns to quickly set up common game configurations for different age groups
                  (mini kids, kids, ado/adults).
                </p>
              </div>
            </div>
          </section>

          {/* Admin Features */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Admin Features</h2>
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <p className="text-slate-400 text-sm mb-4">
                Admin users have access to additional tools:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    API Documentation
                  </h3>
                  <p className="text-slate-400 text-xs">
                    View complete API reference and integration guides
                  </p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-green-400" />
                    API Logs
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Monitor API requests and troubleshoot issues
                  </p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-purple-400" />
                    Import Logs
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Review ZIP import history and debug failed imports
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ZIP Import Documentation */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <FileArchive className="w-6 h-6 text-blue-400" />
              ZIP Import Documentation
            </h2>

            {/* Required Structure */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-blue-400" />
                Required Structure
              </h3>
              <div className="bg-slate-900/50 rounded-lg p-6 font-mono text-sm overflow-x-auto border border-slate-700">
                <pre className="text-slate-200">
{`your-export.zip
├── main_export_file.csv            # REQUIRED: Master file listing games
└── games/                          # REQUIRED: Main games folder
    └── {slug}/                     # Folder named with game slug
        ├── csv/                    # REQUIRED: All CSV files
        │   ├── game.csv           # REQUIRED: Main game definition
        │   ├── game_meta.csv      # REQUIRED: Configuration & media
        │   ├── game_enigmas.csv   # Mystery: Enigma definitions
        │   ├── game_media_images.csv  # Both: Image metadata
        │   ├── game_sounds.csv    # Both: Sound metadata
        │   ├── game_user_meta.csv # Mystery: User settings
        │   ├── game_images.csv        # Tagquest: Image definitions
        │   ├── game_images_balises.csv    # Tagquest: Beacon data
        │   └── game_images_divisions.csv  # Tagquest: Division data
        └── media/                  # REQUIRED: All media files
            ├── *.png/jpg/gif/webp # Image files
            ├── *.mp3/wav/ogg      # Audio files
            └── *.mp4              # Video files`}
                </pre>
              </div>
              <div className="mt-4 bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm text-blue-300 mb-2">
                  <strong>Important:</strong> Games are now identified by their <strong>slug</strong>, not uniqid.
                </p>
                <p className="text-sm text-blue-300">
                  The <code className="bg-slate-700 px-2 py-1 rounded text-blue-400">main_export_file.csv</code> file must list all games to import with their type and slug.
                </p>
              </div>
            </div>

            {/* Key CSV Files */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
                <File className="w-5 h-5 text-green-400" />
                Key CSV Files
              </h3>

              {/* main_export_file.csv */}
              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 mb-4">
                <h4 className="font-semibold text-white mb-2">1. main_export_file.csv (REQUIRED)</h4>
                <p className="text-slate-400 text-sm mb-3">Master index file listing all games in the export:</p>
                <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-slate-700">
                  <pre className="text-slate-200">
{`type,slug
game,my-mystery-game
game,another-tagquest-game`}
                  </pre>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">type:</span>
                    <span className="text-slate-400">Must be "game" for games to import</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">slug:</span>
                    <span className="text-slate-400">Folder name under games/ (e.g., "my-mystery-game")</span>
                  </div>
                </div>
              </div>

              {/* game.csv */}
              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600 mb-4">
                <h4 className="font-semibold text-white mb-2">2. game.csv (REQUIRED)</h4>
                <p className="text-slate-400 text-sm mb-3">Single row with basic game information:</p>
                <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-slate-700">
                  <pre className="text-slate-200">
{`uniqid,title,type,origin
687e1f9566051,My Game,mystery,custom`}
                  </pre>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">uniqid:</span>
                    <span className="text-slate-400">Unique identifier (e.g., 687e1f9566051)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">title:</span>
                    <span className="text-slate-400">Display name of the scenario</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">type:</span>
                    <span className="text-slate-400">Game type: mystery or tagquest</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-white min-w-20">origin:</span>
                    <span className="text-slate-400">Scenario type: custom, mystery, tagquest (defaults to custom)</span>
                  </div>
                </div>
              </div>

              {/* game_meta.csv */}
              <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                <h4 className="font-semibold text-white mb-2">3. game_meta.csv (REQUIRED)</h4>
                <p className="text-slate-400 text-sm mb-3">Key-value pairs for configuration:</p>
                <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-slate-700">
                  <pre className="text-slate-200">
{`key,value
scenario_version,1.0
game_public,kids
background_image,bg.png
enigma_success,success.mp3
overscore_step_1,100`}
                  </pre>
                </div>
              </div>
            </div>

            {/* CSV Field Mapping Section */}
            <div className="mb-6 bg-blue-900/20 border-l-4 border-blue-500 p-5 rounded">
              <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                CSV Field Mappings Reference
              </h3>
              <p className="text-slate-300 mb-4">
                Quick reference showing how CSV fields map to the database during import.
              </p>

              <div className="space-y-3">
                {/* Mystery-specific fields */}
                <details className="bg-slate-800/50 rounded-lg border border-slate-700">
                  <summary className="cursor-pointer p-4 font-semibold text-white hover:bg-slate-700/30 rounded-lg transition">
                    <span className="bg-purple-600 text-xs px-2 py-1 rounded mr-2">MYSTERY</span>
                    Mystery Game Fields
                  </summary>
                  <div className="p-4 space-y-3 text-sm border-t border-slate-700">
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_meta.csv</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">number_of_enigmas</code> - Total enigmas count</li>
                        <li><code className="text-blue-300">score_full_game</code> - Maximum score possible</li>
                        <li><code className="text-blue-300">overscore_step_N</code> - Score threshold for level N</li>
                        <li><code className="text-blue-300">name_overscore_step_N</code> - Name for achievement level N</li>
                        <li><code className="text-blue-300">image_overscore_step_N</code> - Image file ID for level N</li>
                        <li><code className="text-blue-300">enigma_success</code> - Sound ID for correct answer</li>
                        <li><code className="text-blue-300">enigma_error</code> - Sound ID for wrong answer</li>
                        <li><code className="text-blue-300">enigma_no_answer</code> - Sound ID for no answer</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_enigmas.csv</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">number</code> or <code className="text-blue-300">enigma_number</code> - Enigma ID</li>
                        <li><code className="text-blue-300">text</code> or <code className="text-blue-300">enigma_text</code> - Question text</li>
                        <li><code className="text-blue-300">good_answer_points</code> - Points for correct (default: 10)</li>
                        <li><code className="text-blue-300">wrong_answer_points</code> - Points for wrong (default: 0)</li>
                        <li><code className="text-blue-300">good_answer_image</code> - Success image file</li>
                      </ul>
                    </div>
                  </div>
                </details>

                {/* Tagquest-specific fields */}
                <details className="bg-slate-800/50 rounded-lg border border-slate-700">
                  <summary className="cursor-pointer p-4 font-semibold text-white hover:bg-slate-700/30 rounded-lg transition">
                    <span className="bg-green-600 text-xs px-2 py-1 rounded mr-2">TAGQUEST</span>
                    Tagquest Game Fields
                  </summary>
                  <div className="p-4 space-y-3 text-sm border-t border-slate-700">
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_meta.csv</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">background_image</code> - Background image file ID</li>
                        <li><code className="text-blue-300">malus_image</code> - Time penalty image file ID</li>
                        <li><code className="text-blue-300">late_malus_image</code> - Late penalty image file ID</li>
                        <li><code className="text-blue-300">top_1_image</code> - 1st place image file ID</li>
                        <li><code className="text-blue-300">top_3_image</code> - Top 3 image file ID</li>
                        <li><code className="text-blue-300">top_10_image</code> - Top 10 image file ID</li>
                        <li><code className="text-blue-300">top_1_sound</code> - 1st place sound file ID</li>
                        <li><code className="text-blue-300">top_3_sound</code> - Top 3 sound file ID</li>
                        <li><code className="text-blue-300">top_10_sound</code> - Top 10 sound file ID</li>
                        <li><code className="text-blue-300">final_image_sound</code> - Completion sound file ID</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_images.csv (Quests)</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">image_id</code> / <code className="text-blue-300">full_image_id</code> / <code className="text-blue-300">main_image</code> - Main quest image file ID</li>
                        <li><code className="text-blue-300">image_number</code> / <code className="text-blue-300">number</code> / <code className="text-blue-300">quest_number</code> - Quest ID</li>
                        <li><code className="text-blue-300">image_name</code> / <code className="text-blue-300">name</code> / <code className="text-blue-300">title</code> - Quest name</li>
                        <li><code className="text-blue-300">image_points</code> / <code className="text-blue-300">points</code> / <code className="text-blue-300">point</code> - Points awarded (default: 0)</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_sounds.csv</h5>
                      <p className="text-slate-400 text-xs mb-2">CSV Key → Database Field Mappings:</p>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">late_malus</code> → <code className="text-green-300">late_malus_sound</code></li>
                        <li><code className="text-blue-300">malus</code> → <code className="text-green-300">malus_sound</code></li>
                        <li><code className="text-blue-300">error</code> → <code className="text-green-300">cheating_sound</code></li>
                        <li><code className="text-blue-300">success</code> → <code className="text-green-300">success_sound</code></li>
                        <li><code className="text-blue-300">top_1</code> → <code className="text-green-300">top_1_sound</code></li>
                        <li><code className="text-blue-300">top_3</code> → <code className="text-green-300">top_3_sound</code></li>
                        <li><code className="text-blue-300">top_10</code> → <code className="text-green-300">top_10_sound</code></li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_images_divisions.csv</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">main_image_number</code> / <code className="text-blue-300">quest_number</code> - Quest to add image to</li>
                        <li><code className="text-blue-300">image_id</code> - Additional image file ID</li>
                      </ul>
                    </div>
                  </div>
                </details>

                {/* Common fields */}
                <details className="bg-slate-800/50 rounded-lg border border-slate-700" open>
                  <summary className="cursor-pointer p-4 font-semibold text-white hover:bg-slate-700/30 rounded-lg transition">
                    <span className="bg-blue-600 text-xs px-2 py-1 rounded mr-2">ALL TYPES</span>
                    Common Fields (All Games)
                  </summary>
                  <div className="p-4 space-y-3 text-sm border-t border-slate-700">
                    <div>
                      <h5 className="text-white font-semibold mb-2">game.csv</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">title</code> - Scenario display name</li>
                        <li><code className="text-blue-300">uniqid</code> - Unique identifier for scenario</li>
                        <li><code className="text-blue-300">type</code> - Game type (mystery, tagquest, tracks)</li>
                        <li><code className="text-blue-300">origin</code> - Scenario type (product, custom)</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_meta.csv (Common)</h5>
                      <ul className="space-y-1 text-slate-300 ml-4">
                        <li><code className="text-blue-300">scenario</code> / <code className="text-blue-300">story</code> - Game description/story</li>
                        <li><code className="text-blue-300">scenario_version</code> / <code className="text-blue-300">game_version</code> - Version (default: 1.0)</li>
                        <li><code className="text-blue-300">game_public</code> - Target audience (kids, adults, etc.)</li>
                        <li><code className="text-blue-300">font</code> - Font family (default: Arial)</li>
                        <li><code className="text-blue-300">font_color</code> - Text color (hex)</li>
                        <li><code className="text-blue-300">default_time</code> - Default time limit in seconds (default: 60)</li>
                        <li><code className="text-blue-300">default_time_malus</code> - Time penalty (default: 0)</li>
                        <li><code className="text-blue-300">points_units</code> - Points unit name (default: points)</li>
                      </ul>
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {/* Game Type Specific Files */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white mb-3">Game Type Specific Files</h3>

              <div className="space-y-6">
                {/* Mystery Games */}
                <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                  <h4 className="font-semibold text-white mb-3 text-lg">Mystery Games</h4>

                  <div className="space-y-4">
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_enigmas.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Defines enigmas/puzzles for players to solve:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">number</code> or <code className="text-blue-300">enigma_number</code> - Enigma identifier</li>
                          <li><code className="text-blue-300">text</code> or <code className="text-blue-300">enigma_text</code> - Question/challenge text</li>
                          <li><code className="text-blue-300">good_answer_points</code> - Points for correct answer (default: 10)</li>
                          <li><code className="text-blue-300">wrong_answer_points</code> - Points for wrong answer (default: 0)</li>
                          <li><code className="text-blue-300">good_answer_image</code> - Image shown on correct answer</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_media_images.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Metadata for images used in the game</p>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_sounds.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Sound file metadata and associations</p>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_user_meta.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">User-specific metadata and settings</p>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_meta.csv - Mystery Fields</h5>
                      <p className="text-slate-400 text-sm mb-2">Configuration fields specific to mystery games:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">scenario</code> or <code className="text-blue-300">story</code> - Story description</li>
                          <li><code className="text-blue-300">enigma_success</code> - Sound for correct enigma answer</li>
                          <li><code className="text-blue-300">enigma_error</code> - Sound for wrong enigma answer</li>
                          <li><code className="text-blue-300">enigma_no_answer</code> - Sound when no answer given</li>
                          <li><code className="text-blue-300">overscore_step_1</code>, <code className="text-blue-300">overscore_step_2</code>, etc. - Score thresholds</li>
                          <li><code className="text-blue-300">name_overscore_step_1</code>, etc. - Names for score levels</li>
                          <li><code className="text-blue-300">image_overscore_step_1</code>, etc. - Images for score levels</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tagquest Games */}
                <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                  <h4 className="font-semibold text-white mb-3 text-lg">Tagquest Games</h4>

                  <div className="space-y-4">
                    <div>
                      <h5 className="text-white font-semibold mb-2">game_images.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Defines quests/challenges for players:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">image_id</code> or <code className="text-blue-300">full_image_id</code> or <code className="text-blue-300">main_image</code> - Main image ID</li>
                          <li><code className="text-blue-300">image_points</code> or <code className="text-blue-300">points</code> or <code className="text-blue-300">point</code> - Points awarded</li>
                          <li><code className="text-blue-300">image_name</code> or <code className="text-blue-300">name</code> or <code className="text-blue-300">title</code> - Quest name</li>
                          <li><code className="text-blue-300">image_number</code> or <code className="text-blue-300">number</code> or <code className="text-blue-300">quest_number</code> - Quest identifier</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_images_balises.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Beacon/tag data for location-based gameplay</p>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_images_divisions.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Image division data for splitting quests:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">main_image_number</code> or <code className="text-blue-300">quest_number</code> - Quest to add image to</li>
                          <li><code className="text-blue-300">image_id</code> - Additional image ID to add</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_sounds.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Associates sounds with quests and meta fields:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">image_number</code> - Quest number or meta field name</li>
                          <li><code className="text-blue-300">sound_id</code> - Sound file ID</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_meta.csv - Tagquest Fields</h5>
                      <p className="text-slate-400 text-sm mb-2">Configuration fields specific to tagquest games:</p>
                      <div className="bg-slate-800/50 p-3 rounded text-sm">
                        <ul className="text-slate-300 space-y-1">
                          <li><code className="text-blue-300">background_image</code> - Background image for game screen</li>
                          <li><code className="text-blue-300">malus_image</code> - Image for time penalty</li>
                          <li><code className="text-blue-300">late_malus_image</code> - Image for late penalty</li>
                          <li><code className="text-blue-300">top_1_image</code> - Image for 1st place</li>
                          <li><code className="text-blue-300">top_3_image</code> - Image for top 3</li>
                          <li><code className="text-blue-300">top_10_image</code> - Image for top 10</li>
                          <li><code className="text-blue-300">top_1_sound</code> - Sound for 1st place</li>
                          <li><code className="text-blue-300">top_3_sound</code> - Sound for top 3</li>
                          <li><code className="text-blue-300">top_10_sound</code> - Sound for top 10</li>
                          <li><code className="text-blue-300">final_image_sound</code> - Sound for completion</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-white font-semibold mb-2">game_media_images.csv</h5>
                      <p className="text-slate-400 text-sm mb-2">Metadata for images used in the game</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 bg-green-900/20 border-l-4 border-green-500 p-4 rounded">
                <p className="text-sm text-green-300">
                  <strong>Tip:</strong> The game type is automatically detected from the <code className="bg-slate-700 px-2 py-1 rounded">type</code> field in game.csv
                </p>
              </div>
            </div>

            {/* Media Files */}
            <div>
              <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
                <Image className="w-5 h-5 text-purple-400" />
                Media Files
              </h3>
              <p className="text-slate-400 mb-4 text-sm">All media files must be placed in the <code className="bg-slate-700 px-2 py-1 rounded">media/</code> folder.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Image className="w-5 h-5 text-purple-400" />
                    <h4 className="font-semibold text-white">Images</h4>
                  </div>
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li>.jpg / .jpeg</li>
                    <li>.png</li>
                    <li>.gif</li>
                    <li>.webp</li>
                  </ul>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-5 h-5 text-green-400" />
                    <h4 className="font-semibold text-white">Audio</h4>
                  </div>
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li>.mp3</li>
                    <li>.wav</li>
                    <li>.ogg</li>
                  </ul>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-5 h-5 text-red-400" />
                    <h4 className="font-semibold text-white">Video</h4>
                  </div>
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li>.mp4</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Language & Settings */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Language & Settings</h2>
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-white mb-2">Language Selection</h3>
                  <p className="text-slate-400 text-sm">
                    Use the language selector in the top-right corner to switch between English and French.
                    This affects the entire interface.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-white mb-2">Translation Management</h3>
                  <p className="text-slate-400 text-sm mb-2">
                    In the Settings page, you can:
                  </p>
                  <ul className="text-slate-400 text-sm space-y-1 ml-4">
                    <li><strong className="text-white">Export:</strong> Download current translations as JSON files</li>
                    <li><strong className="text-white">Import:</strong> Upload custom translation files to override defaults</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Tips & Best Practices */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Tips & Best Practices</h2>
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <ul className="space-y-3 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✓</span>
                  <span><strong className="text-white">Test your scenarios:</strong> Always test your games before publishing to ensure everything works correctly</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✓</span>
                  <span><strong className="text-white">Optimize media:</strong> Compress images and videos to reduce load times and storage usage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✓</span>
                  <span><strong className="text-white">Use descriptive names:</strong> Give your scenarios clear titles and slugs for easy identification</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✓</span>
                  <span><strong className="text-white">Backup your work:</strong> Export scenarios as ZIPs to keep backups of your configurations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✓</span>
                  <span><strong className="text-white">Check import logs:</strong> If a ZIP import fails, review the import logs to see what went wrong</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Need More Help */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Need More Help?</h2>
            <div className="bg-blue-900/20 rounded-lg p-6 border border-blue-700">
              <p className="text-slate-300 text-sm mb-4">
                For additional assistance or specific questions:
              </p>
              <ul className="text-slate-300 text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <FileArchive className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0" />
                  <span>Check the <strong className="text-white">ZIP Import Documentation</strong> section above for detailed structure requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <BookOpen className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0" />
                  <span>Admins can view the <strong className="text-white">API Documentation</strong> for technical integration details</span>
                </li>
                <li className="flex items-start gap-2">
                  <Database className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0" />
                  <span>Review <strong className="text-white">API Logs</strong> and <strong className="text-white">Import Logs</strong> to troubleshoot issues</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0" />
                  <span>Contact us at <a href="mailto:contact@taghunter.fr" className="text-blue-400 hover:text-blue-300 underline font-semibold">contact@taghunter.fr</a> for direct support</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
