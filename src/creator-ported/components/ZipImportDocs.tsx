import { ArrowLeft, FileArchive, FolderTree, File, Image, Music, Video } from 'lucide-react';

interface ZipImportDocsProps {
  onBack: () => void;
}

export function ZipImportDocs({ onBack }: ZipImportDocsProps) {
  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="bg-slate-800 rounded-xl shadow-lg p-8 border border-slate-700">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <FileArchive className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">ZIP Import Documentation</h1>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="prose max-w-none">
          {/* Required Structure */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-blue-400" />
              Required Structure
            </h2>
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
          </section>

          {/* Key CSV Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <File className="w-6 h-6 text-green-400" />
              Key CSV Files
            </h2>

            {/* main_export_file.csv */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">1. main_export_file.csv (REQUIRED)</h3>
              <p className="text-gray-600 mb-3">Master index file listing all games in the export:</p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-gray-800">
{`type,slug
game,my-mystery-game
game,another-tagquest-game`}
                </pre>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">type:</span>
                  <span className="text-gray-600">Must be "game" for games to import</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">slug:</span>
                  <span className="text-gray-600">Folder name under games/ (e.g., "my-mystery-game")</span>
                </div>
              </div>
              <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-600 p-4">
                <p className="text-sm text-yellow-900">
                  <strong>Note:</strong> Only rows with type="game" will be processed. The slug must match the folder name in games/.
                </p>
              </div>
            </div>

            {/* game.csv */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">2. game.csv (REQUIRED)</h3>
              <p className="text-gray-600 mb-3">Single row with basic game information:</p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-gray-800">
{`uniqid,title,type,origin
687e1f9566051,My Game,mystery,custom`}
                </pre>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">uniqid:</span>
                  <span className="text-gray-600">Unique identifier (e.g., 687e1f9566051)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">title:</span>
                  <span className="text-gray-600">Display name of the scenario</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">type:</span>
                  <span className="text-gray-600">Game type: mystery, tagquest, or survival</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 min-w-24">origin:</span>
                  <span className="text-gray-600">Scenario type: custom, mystery, tagquest (defaults to custom)</span>
                </div>
              </div>
            </div>

            {/* game_meta.csv */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">3. game_meta.csv (REQUIRED)</h3>
              <p className="text-gray-600 mb-3">Key-value pairs for configuration:</p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-gray-800">
{`key,value
scenario_version,1.0
game_public,kids
background_image,bg.png
enigma_success,success.mp3
overscore_step_1,100
name_overscore_step_1,Bronze
image_overscore_step_1,bronze.png`}
                </pre>
              </div>
              <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-600 p-4">
                <p className="text-sm text-yellow-900">
                  <strong>Important:</strong> Media filenames should be just the filename (e.g., <code className="bg-yellow-100 px-2 py-1 rounded">bg.png</code>),
                  not full paths. Files must exist in the <code className="bg-yellow-100 px-2 py-1 rounded">media/</code> folder.
                </p>
              </div>
            </div>

            {/* game_enigmas.csv */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">4. game_enigmas.csv (Mystery Only)</h3>
              <p className="text-gray-600 mb-3">One row per enigma:</p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-gray-800">
{`number,text,good_answer_points,wrong_answer_points,good_answer_image
1,Question text?,10,0,answer.png
2,Another question?,10,0,answer2.png`}
                </pre>
              </div>
            </div>
          </section>

          {/* CSV to Database Field Mapping */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <File className="w-6 h-6 text-blue-400" />
              CSV to Database Field Mapping
            </h2>
            <p className="text-slate-300 mb-4">
              This section shows how CSV fields are mapped to the database schema during import.
            </p>

            {/* game.csv Mapping */}
            <div className="mb-6 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">game.csv → Database</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">CSV Field</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Database Column</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">uniqid</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.uniqid</code></td>
                      <td className="py-2 px-3">Unique identifier (e.g., 687e1f9566051)</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">title</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.title</code></td>
                      <td className="py-2 px-3">Scenario display name</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">type</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.game_type</code></td>
                      <td className="py-2 px-3">Game type (mystery, tagquest, tracks)</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">origin</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.scenario_type</code></td>
                      <td className="py-2 px-3">Scenario type (product, custom)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* game_meta.csv Mapping */}
            <div className="mb-6 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">game_meta.csv → Database</h3>
              <p className="text-slate-400 mb-3 text-sm">
                Most fields go into <code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.data.game_meta</code>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">CSV Field (key)</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Database Path</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">scenario</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.description</code></td>
                      <td className="py-2 px-3">Text</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">scenario_version</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.scenario_version</code></td>
                      <td className="py-2 px-3">Text</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">game_public</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.game_public</code></td>
                      <td className="py-2 px-3">Text (kids, mini_kids, ado_adultes)</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">font</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.font</code></td>
                      <td className="py-2 px-3">Text</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">font_color</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.font_color</code></td>
                      <td className="py-2 px-3">Hex color</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">default_time</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.default_time</code></td>
                      <td className="py-2 px-3">Number (seconds)</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">number_of_enigmas</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.number_of_enigmas</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">score_full_game</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.score_full_game</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">overscore_steps</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">data.game_meta.overscore_steps</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-500 mt-3 text-xs italic">
                Note: All other game_meta fields are stored in data.game_meta with the same key name
              </p>
            </div>

            {/* Image Fields Mapping */}
            <div className="mb-6 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">Image Fields → Media Storage</h3>
              <p className="text-slate-400 mb-3 text-sm">
                Image filenames from game_meta.csv are uploaded to storage and mapped to <code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.media.images</code>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">game_meta.csv Key</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Media Storage Path</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Usage</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">game_visual</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.game_visual</code></td>
                      <td className="py-2 px-3">Main game thumbnail</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">background_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.background_image</code></td>
                      <td className="py-2 px-3">Game background</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">game_instructions_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.game_instructions_image</code></td>
                      <td className="py-2 px-3">Instructions screen</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_1_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.top_1_image</code></td>
                      <td className="py-2 px-3">First place badge</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_3_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.top_3_image</code></td>
                      <td className="py-2 px-3">Top 3 badge</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_10_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.top_10_image</code></td>
                      <td className="py-2 px-3">Top 10 badge</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">levels_gauge_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.images.levels_gauge_image</code></td>
                      <td className="py-2 px-3">Progress gauge</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">image_overscore_step_N</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.overscores[N].image</code></td>
                      <td className="py-2 px-3">Overscore tier badge</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 bg-amber-900/20 border-l-4 border-amber-500 p-3 rounded">
                <p className="text-sm text-amber-300">
                  <strong>Important:</strong> All image filenames in CSV must match files in the <code className="bg-slate-800 px-1 rounded">media/</code> folder.
                  During import, files are uploaded to Supabase Storage at path <code className="bg-slate-800 px-1 rounded">{'{'}scenario_id{'}'}/{'{'}filename{'}'}</code>
                </p>
              </div>
            </div>

            {/* Sound Fields Mapping */}
            <div className="mb-6 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">Sound Fields → Media Storage</h3>
              <p className="text-slate-400 mb-3 text-sm">
                Audio filenames from game_meta.csv are uploaded to storage and mapped to <code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.media.sounds</code>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">game_meta.csv Key</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Media Storage Path</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Usage</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">enigma_success</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.enigma_success</code></td>
                      <td className="py-2 px-3">Correct answer sound</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">enigma_error</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.enigma_error</code></td>
                      <td className="py-2 px-3">Wrong answer sound</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">enigma_no_answer</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.enigma_no_answer</code></td>
                      <td className="py-2 px-3">No answer sound</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_1_sound</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.top_1_sound</code></td>
                      <td className="py-2 px-3">First place fanfare</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_3_sound</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.top_3_sound</code></td>
                      <td className="py-2 px-3">Top 3 sound</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">top_10_sound</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.top_10_sound</code></td>
                      <td className="py-2 px-3">Top 10 sound</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">final_image_sound</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.sounds.final_image_sound</code></td>
                      <td className="py-2 px-3">Final screen music</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Enigma Fields Mapping */}
            <div className="mb-6 bg-slate-900/50 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">game_enigmas.csv → Database</h3>
              <p className="text-slate-400 mb-3 text-sm">
                Enigma data is stored in <code className="bg-slate-800 px-2 py-1 rounded text-green-400">scenarios.data.game_meta.enigmas</code> array
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">CSV Field</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Database Path</th>
                      <th className="text-left py-2 px-3 text-slate-300 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">number</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">enigmas[].number</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">text</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">enigmas[].text</code></td>
                      <td className="py-2 px-3">Text</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">good_answer_points</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">enigmas[].good_answer_points</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">wrong_answer_points</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">enigmas[].wrong_answer_points</code></td>
                      <td className="py-2 px-3">Number</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-blue-400">good_answer_image</code></td>
                      <td className="py-2 px-3"><code className="bg-slate-800 px-2 py-1 rounded text-green-400">media.enigmas[].good_answer_image</code></td>
                      <td className="py-2 px-3">Filename → Storage</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-500 mt-3 text-xs italic">
                Note: Enigma images are uploaded to storage and referenced in scenarios.media.enigmas array
              </p>
            </div>
          </section>

          {/* Game Type Specific CSVs */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Game Type Specific Files</h2>

            {/* Mystery */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Mystery Games</h3>
              <p className="text-gray-600 mb-3">Required CSV files for mystery games:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li><code className="bg-gray-100 px-2 py-1 rounded">game.csv</code> - Main game definition</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_meta.csv</code> - Configuration and media references</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_enigmas.csv</code> - Enigma definitions</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_media_images.csv</code> - Image metadata</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_sounds.csv</code> - Sound metadata</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_user_meta.csv</code> - User settings</li>
              </ul>
            </div>

            {/* Tagquest */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Tagquest Games</h3>
              <p className="text-gray-600 mb-3">Required CSV files for tagquest games:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-600 ml-4">
                <li><code className="bg-gray-100 px-2 py-1 rounded">game.csv</code> - Main game definition</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_meta.csv</code> - Configuration and media references</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_media_images.csv</code> - Image metadata</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_sounds.csv</code> - Sound metadata</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_images.csv</code> - Image definitions</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_images_balises.csv</code> - Beacon/tag data</li>
                <li><code className="bg-gray-100 px-2 py-1 rounded">game_images_divisions.csv</code> - Division data</li>
              </ul>
            </div>

            <div className="bg-green-50 border-l-4 border-green-600 p-4">
              <p className="text-sm text-green-900">
                <strong>Tip:</strong> The game type is automatically detected from the <code className="bg-green-100 px-2 py-1 rounded">type</code> field in game.csv
              </p>
            </div>
          </section>

          {/* Media Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Image className="w-6 h-6 text-purple-600" />
              Media Files
            </h2>
            <p className="text-gray-600 mb-4">All media files must be placed in the <code className="bg-gray-100 px-2 py-1 rounded">media/</code> folder.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Image className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-800">Images</h3>
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>.jpg / .jpeg</li>
                  <li>.png</li>
                  <li>.gif</li>
                  <li>.webp</li>
                </ul>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-800">Audio</h3>
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>.mp3</li>
                  <li>.wav</li>
                  <li>.ogg</li>
                </ul>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-5 h-5 text-red-600" />
                  <h3 className="font-semibold text-gray-800">Video</h3>
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>.mp4</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 bg-purple-50 border-l-4 border-purple-600 p-4">
              <p className="text-sm text-purple-900 mb-2">
                <strong>Filename Sanitization:</strong>
              </p>
              <div className="font-mono text-xs bg-purple-100 p-2 rounded">
                Original: "Été @ Paris! (2024).png"<br />
                Sanitized: "Ete_Paris_2024.png"
              </div>
              <p className="text-sm text-purple-900 mt-2">
                Accented characters are removed and special characters are replaced with underscores.
              </p>
            </div>
          </section>

          {/* Import Process */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Import Process</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Upload ZIP file</h3>
                  <p className="text-gray-600 text-sm">Navigate to Configuration → Import from Zip and select your file</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Validation</h3>
                  <p className="text-gray-600 text-sm">System validates structure and finds games/ folder</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Parse CSV files</h3>
                  <p className="text-gray-600 text-sm">Extracts game data, metadata, and enigma definitions</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Check for existing scenario</h3>
                  <p className="text-gray-600 text-sm">Looks for matching uniqid to update or create new</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  5
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Upload media files</h3>
                  <p className="text-gray-600 text-sm">Uploads all media to cloud storage (this takes the most time)</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  6
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Map media references</h3>
                  <p className="text-gray-600 text-sm">Links filenames to scenario configuration</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 mb-1">Complete</h3>
                  <p className="text-gray-600 text-sm">Scenario is ready to use</p>
                </div>
              </div>
            </div>
          </section>

          {/* Progress Indicators */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Progress Indicators</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">0-10%</div>
                <div className="flex-1 text-gray-600">Loading and validating ZIP structure</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">10-20%</div>
                <div className="flex-1 text-gray-600">Parsing game CSV files</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">20-30%</div>
                <div className="flex-1 text-gray-600">Parsing metadata</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">30-40%</div>
                <div className="flex-1 text-gray-600">Parsing enigmas</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">40-50%</div>
                <div className="flex-1 text-gray-600">Creating/updating scenario in database</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">50-90%</div>
                <div className="flex-1 text-gray-600">Uploading media files (bulk of time)</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 text-sm font-semibold text-gray-600">90-100%</div>
                <div className="flex-1 text-gray-600">Mapping media references and finalizing</div>
              </div>
            </div>
          </section>

          {/* Existing Scenarios */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Updating Existing Scenarios</h2>
            <p className="text-gray-600 mb-4">
              If a scenario with the same <code className="bg-gray-100 px-2 py-1 rounded">uniqid</code> already exists:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Old media files are deleted from cloud storage</li>
              <li>Scenario data is updated with new data from ZIP</li>
              <li>New media files are uploaded to replace old ones</li>
              <li>Scenario ID remains the same (not a new scenario)</li>
            </ul>
          </section>

          {/* Best Practices */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Best Practices</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-50 border-l-4 border-green-600 p-4">
                <h3 className="font-semibold text-green-900 mb-2">Do:</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>✓ Use meaningful uniqids</li>
                  <li>✓ Test with small files first</li>
                  <li>✓ Optimize media files</li>
                  <li>✓ Use consistent naming</li>
                  <li>✓ Keep original ZIPs as backups</li>
                </ul>
              </div>

              <div className="bg-red-50 border-l-4 border-red-600 p-4">
                <h3 className="font-semibold text-red-900 mb-2">Don't:</h3>
                <ul className="text-sm text-red-800 space-y-1">
                  <li>✗ Use special characters in filenames</li>
                  <li>✗ Include paths in CSV media references</li>
                  <li>✗ Upload very large uncompressed files</li>
                  <li>✗ Forget to include required CSV files</li>
                  <li>✗ Mix different games in one ZIP</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
