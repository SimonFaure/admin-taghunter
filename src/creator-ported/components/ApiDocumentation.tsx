import { useState } from 'react';
import { Copy, Check, Book, Code, ChevronDown, ChevronRight } from 'lucide-react';

interface ApiEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
  requestBody: any;
  exampleRequest: any;
  successResponse: any;
  curlExample: string;
}

export function ApiDocumentation() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<number>>(new Set([0]));

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

  const endpoints: ApiEndpoint[] = [
    {
      name: 'Check Client Email',
      method: 'POST',
      path: '/functions/v1/check-client',
      description: 'Verify if a client email exists in the Taghunter system and retrieve client information',
      requestBody: {
        email: 'string (required) - Client email address to verify'
      },
      exampleRequest: {
        email: 'client@example.com'
      },
      successResponse: {
        exists: true,
        client_id: '12345',
        email: 'client@example.com',
        name: 'Client Name'
      },
      curlExample: `curl -X POST '${supabaseUrl}/functions/v1/check-client' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${anonKey}' \\
  -d '{
    "email": "client@example.com"
  }'`
    },
    {
      name: 'Check Login Status',
      method: 'POST',
      path: '/functions/v1/check-login-status',
      description: 'Check the login status of a client by email',
      requestBody: {
        email: 'string (required) - Client email address'
      },
      exampleRequest: {
        email: 'client@example.com'
      },
      successResponse: {
        logged_in: true,
        last_login: '2024-12-08T10:30:00Z'
      },
      curlExample: `curl -X POST '${supabaseUrl}/functions/v1/check-login-status' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${anonKey}' \\
  -d '{
    "email": "client@example.com"
  }'`
    },
    {
      name: 'Publish Scenario',
      method: 'POST',
      path: '/functions/v1/publish-scenario',
      description: 'Publish a game scenario to the Taghunter platform',
      requestBody: {
        userEmail: 'string (required) - User email address',
        clientId: 'string (optional) - Client ID for associating the scenario',
        title: 'string (required) - Scenario title',
        description: 'string (required) - Scenario description',
        uniqid: 'string (optional) - Unique identifier for the scenario (auto-generated if not provided)',
        game_type: 'string (optional) - Type of game (default: "mystery")',
        scenario_type: 'string (optional) - Type of scenario (default: "custom")',
        data: 'object (optional) - Complete scenario configuration and game data',
        media: 'object (optional) - Media files metadata and references',
        scenario_layout: 'object (optional) - Layout configuration with element positions and sizes'
      },
      exampleRequest: {
        userEmail: 'user@example.com',
        clientId: '12345',
        title: 'Mystery Adventure',
        description: 'An exciting mystery game for kids',
        game_type: 'mystery',
        scenario_type: 'custom',
        data: {
          title: 'Mystery Adventure',
          game_public: 'kids',
          number_of_enigmas: '12',
          levels: {
            '1': {
              points: '10',
              name: 'Level 1',
              description: 'First level'
            }
          },
          enigmas: [
            {
              number: '1',
              text: 'What is 2+2?',
              good_answer_image: 'answer.png',
              good_answer_points: '10',
              wrong_answer_points: '0'
            }
          ]
        },
        media: {
          images: {
            background_image: 'background.jpg',
            game_instructions_image: 'instructions.png'
          }
        },
        scenario_layout: {
          elements: [
            {
              id: 'game_instructions_image',
              name: 'Game Instructions Image',
              filename: 'instructions.png',
              x: 10,
              y: 10,
              width: 30,
              height: 20
            }
          ]
        }
      },
      successResponse: {
        success: true,
        message: 'Scenario published successfully',
        scenario_id: 'abc123'
      },
      curlExample: `curl -X POST '${supabaseUrl}/functions/v1/publish-scenario' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${anonKey}' \\
  -d '{
    "userEmail": "user@example.com",
    "clientId": "12345",
    "title": "Mystery Adventure",
    "description": "An exciting mystery game",
    "game_type": "mystery",
    "scenario_type": "custom",
    "data": {
      "title": "Mystery Adventure",
      "game_public": "kids",
      "number_of_enigmas": "12"
    },
    "media": {
      "images": {
        "background_image": "background.jpg"
      }
    },
    "scenario_layout": {
      "elements": [
        {
          "id": "game_instructions_image",
          "x": 10,
          "y": 10,
          "width": 30,
          "height": 20
        }
      ]
    }
  }'`
    },
    {
      name: 'Upload Media',
      method: 'POST',
      path: '/functions/v1/upload-media',
      description: 'Upload media files (images, sounds) for a published scenario. Files are uploaded one by one after scenario creation.',
      requestBody: {
        file: 'File (required) - Media file to upload (multipart/form-data)',
        uniqid: 'string (required) - Unique identifier of the scenario to associate the media with',
        userEmail: 'string (required) - User email address'
      },
      exampleRequest: {
        file: '[Binary file data]',
        uniqid: 'scenario_674fb123a45e6',
        userEmail: 'user@example.com'
      },
      successResponse: {
        success: true,
        message: 'Media uploaded successfully',
        filename: 'background.jpg',
        url: 'https://studio.taghunter.fr/uploads/scenario_674fb123a45e6/background.jpg'
      },
      curlExample: `curl -X POST '${supabaseUrl}/functions/v1/upload-media' \\
  -H 'Authorization: Bearer ${anonKey}' \\
  -F 'file=@/path/to/image.jpg' \\
  -F 'uniqid=scenario_674fb123a45e6' \\
  -F 'userEmail=user@example.com'`
    },
    {
      name: 'Publish Default Configuration',
      method: 'POST',
      path: '/functions/v1/publish-default-config',
      description: 'Publish default game configuration settings to the Taghunter platform. This endpoint logs all requests to the api_logs table including request/response data, timing, and IP information.',
      requestBody: {
        user_email: 'string (required) - Authenticated user email address',
        meta: 'string (required) - Configuration type identifier (e.g., "tagquest_default_data", "mystery_default_data")',
        version: 'number (required) - Configuration version number',
        value: 'object (required) - Complete default configuration object with all settings'
      },
      exampleRequest: {
        user_email: 'user@example.com',
        meta: 'tagquest_default_data',
        version: 1.1,
        value: {
          team_title: 'Équipe',
          pdf_title: 'TagQuest',
          auto_reset: false,
          delay_auto_reset: '5',
          text_player_starts: 'Début de la partie',
          text_card_not_empty: 'La carte n\'est pas vide',
          message_display_time: '2',
          animation_display_time: '1',
          common_image: '',
          square_image: '',
          score_image: ''
        }
      },
      successResponse: {
        success: true,
        message: 'Default configuration published successfully'
      },
      curlExample: `curl -X POST '${supabaseUrl}/functions/v1/publish-default-config' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${anonKey}' \\
  -d '{
    "user_email": "user@example.com",
    "meta": "tagquest_default_data",
    "version": 1.1,
    "value": {
      "team_title": "Équipe",
      "pdf_title": "TagQuest",
      "auto_reset": false,
      "delay_auto_reset": "5",
      "text_player_starts": "Début de la partie"
    }
  }'`
    },
    {
      name: 'Publish Pattern',
      method: 'POST',
      path: 'https://studio.taghunter.fr/backend/api/patterns.php?action=upload',
      description: 'Publish a pattern configuration to the Taghunter platform. Patterns define the station assignments for game types (mystery, tagquest, tracks). This endpoint logs all requests to the api_logs table.',
      requestBody: {
        email: 'string (required) - User email address',
        name: 'string (required) - Pattern name',
        game_type: 'string (required) - Game type: "mystery", "tagquest", or "tracks"',
        pattern_data: 'array (required) - Array of pattern rows with station assignments',
        version: 'number (required) - Pattern version (e.g., 1.0, 1.1, 2.0)',
        is_default: 'boolean (required) - Whether this is a default pattern (only true for admin users)'
      },
      exampleRequest: {
        email: 'user@example.com',
        name: 'Kids Mystery Pattern',
        game_type: 'mystery',
        pattern_data: [
          {
            index: 1,
            assignments: {
              good_answer: 31,
              wrong_answer: 32
            }
          },
          {
            index: 2,
            assignments: {
              good_answer: 33,
              wrong_answer: 34
            }
          }
        ],
        version: 1.0,
        is_default: false
      },
      successResponse: {
        success: true,
        message: 'Pattern published successfully',
        pattern_id: 123
      },
      curlExample: `curl -X POST 'https://studio.taghunter.fr/backend/api/patterns.php?action=upload' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "email": "user@example.com",
    "name": "Kids Mystery Pattern",
    "game_type": "mystery",
    "pattern_data": [
      {
        "index": 1,
        "assignments": {
          "good_answer": 31,
          "wrong_answer": 32
        }
      }
    ],
    "version": 1.0,
    "is_default": false
  }'`
    },
    {
      name: 'Import Game from Zip',
      method: 'UI',
      path: '/import',
      description: 'Import a complete game scenario from a ZIP file. The ZIP must contain a specific folder structure with CSV files and media assets. This is available through the UI only.',
      requestBody: {
        zipFile: 'File (required) - ZIP file containing the game structure',
        structure: 'Expected structure: folder/games/{game-id}/csv/ and folder/games/{game-id}/media/',
        csvFiles: 'Required CSV files: game.csv, game_meta.csv, game_enigmas.csv (optional: game_sounds.csv)',
        game_csv: 'Contains: uniqid, title, type, origin',
        game_meta_csv: 'Contains: all game configuration including overscore_step_X, name_overscore_step_X, image_overscore_step_X',
        game_enigmas_csv: 'Contains: number, text, good_answer_points, wrong_answer_points, good_answer_image',
        media_folder: 'Media files organized in numbered folders matching CSV references'
      },
      exampleRequest: {
        zipStructure: `
my-game-export.zip
└── export_folder/
    └── games/
        └── 6501abcfebf5b/
            ├── csv/
            │   ├── game.csv
            │   ├── game_meta.csv
            │   ├── game_enigmas.csv
            │   └── game_sounds.csv
            └── media/
                ├── 4763/
                │   └── image1.jpg
                ├── 4764/
                │   └── image2.png
                └── 4765/
                    └── sound1.mp3
        `,
        game_csv_example: `
uniqid,title,type,origin
6501abcfebf5b,Mystery Adventure,mystery,product
        `,
        game_meta_csv_example: `
game_meta,game_meta_value
title,Mystery Adventure
scenario_version,1.0
game_public,kids
overscore_step_1,100
name_overscore_step_1,Bronze
image_overscore_step_1,4763
overscore_step_2,200
name_overscore_step_2,Silver
image_overscore_step_2,4764
        `
      },
      successResponse: {
        success: true,
        message: 'Game imported successfully',
        scenario_id: 'uuid-generated',
        uploaded_media_count: 24,
        parsed_enigmas: 12,
        parsed_overscores: 3
      },
      curlExample: `
# This feature is only available through the Taghunter Playground UI
# Navigate to: Scenarios > Import from Zip
#
# The import process will:
# 1. Parse game.csv to extract basic info (title, type, uniqid, origin)
# 2. Parse game_meta.csv to extract configuration and overscore steps
# 3. Parse game_enigmas.csv to extract enigma data
# 4. Upload all media files from the media/ folder to Supabase storage
# 5. Map media folder numbers to actual filenames
# 6. Create the scenario in the database with all parsed data
# 7. Open the configuration page for final adjustments
      `
    }
  ];

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleEndpoint = (index: number) => {
    const newExpanded = new Set(expandedEndpoints);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEndpoints(newExpanded);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <Book size={32} className="text-blue-500" />
        <h1 className="text-3xl font-bold text-white">API Documentation</h1>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Base URL</h2>
        <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
          <code className="text-blue-400">{supabaseUrl}</code>
        </div>
        <p className="text-slate-400 mt-3 text-sm">
          All API endpoints require the Authorization header with your Supabase anon key.
        </p>
      </div>

      <div className="space-y-6">
        {endpoints.map((endpoint, index) => {
          const isExpanded = expandedEndpoints.has(index);
          return (
            <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div
                className="p-6 cursor-pointer hover:bg-slate-700/50 transition"
                onClick={() => toggleEndpoint(index)}
              >
                <div className="flex items-center gap-3 mb-2">
                  {isExpanded ? (
                    <ChevronDown size={20} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={20} className="text-slate-400 flex-shrink-0" />
                  )}
                  <span className={`px-3 py-1 rounded font-mono text-sm font-semibold ${
                    endpoint.method === 'GET' ? 'bg-green-500/20 text-green-400' :
                    endpoint.method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                    endpoint.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                    endpoint.method === 'UI' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {endpoint.method}
                  </span>
                  <code className="text-lg font-mono text-white">{endpoint.path}</code>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2 ml-8">{endpoint.name}</h3>
                <p className="text-slate-400 ml-8">{endpoint.description}</p>
              </div>

              {isExpanded && (
                <div className="p-6 pt-0 space-y-6 border-t border-slate-700">
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Code size={16} />
                  Request Body
                </h4>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <pre className="text-sm text-slate-300 overflow-x-auto">
                    {Object.entries(endpoint.requestBody).map(([key, value]) => (
                      <div key={key} className="mb-1">
                        <span className="text-blue-400">{key}</span>: <span className="text-slate-400">{value as string}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Code size={16} />
                  Example Request Body
                </h4>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <pre className="text-sm text-green-400 overflow-x-auto">
                    {JSON.stringify(endpoint.exampleRequest, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Code size={16} />
                  Success Response (200)
                </h4>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <pre className="text-sm text-emerald-400 overflow-x-auto">
                    {JSON.stringify(endpoint.successResponse, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Code size={16} />
                    cURL Example
                  </h4>
                  <button
                    onClick={() => copyToClipboard(endpoint.curlExample, index)}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition flex items-center gap-2"
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check size={14} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <pre className="text-sm text-orange-400 overflow-x-auto whitespace-pre-wrap">
                    {endpoint.curlExample}
                  </pre>
                </div>
              </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Authentication</h2>
        <p className="text-slate-400 mb-3">
          All API requests must include the following headers:
        </p>
        <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 space-y-2">
          <div>
            <code className="text-blue-400">Content-Type:</code>{' '}
            <code className="text-slate-300">application/json</code>
          </div>
          <div>
            <code className="text-blue-400">Authorization:</code>{' '}
            <code className="text-slate-300">Bearer YOUR_ANON_KEY</code>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">API Logging</h2>
        <p className="text-slate-400 mb-3">
          All API requests are automatically logged to the database for monitoring and debugging purposes.
        </p>
        <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
          <p className="text-slate-300 text-sm mb-2">Logged information includes:</p>
          <ul className="list-disc list-inside text-slate-400 text-sm space-y-1">
            <li>Endpoint path and HTTP method</li>
            <li>Request body and headers</li>
            <li>Response body and status code</li>
            <li>Response time in milliseconds</li>
            <li>IP address and user agent</li>
            <li>Error messages (if any)</li>
            <li>Timestamp</li>
          </ul>
          <p className="text-slate-400 text-sm mt-3">
            View API logs in the Config page under the API Logs section.
          </p>
        </div>
      </div>

      <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4">Error Responses</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-red-400 mb-2">400 Bad Request</h3>
            <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
              <pre className="text-sm text-red-400">
{`{
  "error": "Missing required fields"
}`}
              </pre>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-red-400 mb-2">500 Internal Server Error</h3>
            <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
              <pre className="text-sm text-red-400">
{`{
  "error": "Internal server error",
  "details": "Error message details"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
