import { Code, FileJson, Lock, Users, FileText, Activity } from 'lucide-react';
import { useState } from 'react';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth?: boolean;
  params?: { name: string; type: string; description: string }[];
  body?: { name: string; type: string; description: string }[];
  response?: string;
}

interface ApiSection {
  title: string;
  icon: React.ReactNode;
  color: string;
  endpoints: Endpoint[];
}

export default function ApiDocsView() {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const apiSections: ApiSection[] = [
    {
      title: 'Authentication',
      icon: <Lock className="w-5 h-5" />,
      color: 'bg-blue-500',
      endpoints: [
        {
          method: 'POST',
          path: '/backend/api/auth.php?action=login',
          description: 'Authenticate admin user and create session',
          auth: false,
          body: [
            { name: 'email', type: 'string', description: 'Admin email address' },
            { name: 'password', type: 'string', description: 'Admin password' },
          ],
          response: '{ "user": { "id": 1, "email": "admin@example.com", "name": "Admin" }, "message": "Login successful" }',
        },
        {
          method: 'POST',
          path: '/backend/api/auth.php?action=logout',
          description: 'End current session',
          auth: true,
          response: '{ "message": "Logout successful" }',
        },
        {
          method: 'GET',
          path: '/backend/api/auth.php?action=check',
          description: 'Check current authentication status',
          auth: false,
          response: '{ "user": { "id": 1, "email": "admin@example.com", "name": "Admin" } }',
        },
      ],
    },
    {
      title: 'Clients',
      icon: <Users className="w-5 h-5" />,
      color: 'bg-green-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/clients.php?action=list',
          description: 'Get all clients',
          auth: true,
          response: '{ "data": [{ "id": 1, "email": "client@example.com", "name": "Client Name", "company": "Acme Corp", "phone": "+1234567890", "notes": "VIP client", "license_type": "premium", "billing_up_to_date": true, "created_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/clients.php?action=get&id={id}',
          description: 'Get single client by ID',
          auth: true,
          params: [{ name: 'id', type: 'integer', description: 'Client ID' }],
          response: '{ "data": { "id": 1, "email": "client@example.com", "name": "Client Name", "company": "Acme Corp", "phone": "+1234567890", "notes": "VIP client", "license_type": "premium", "billing_up_to_date": true, "created_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/clients.php?action=create',
          description: 'Create new client',
          auth: true,
          body: [
            { name: 'email', type: 'string', description: 'Client email (required)' },
            { name: 'name', type: 'string', description: 'Client name (required)' },
            { name: 'company', type: 'string', description: 'Company name (optional)' },
            { name: 'phone', type: 'string', description: 'Phone number (optional)' },
            { name: 'notes', type: 'string', description: 'Notes (optional)' },
            { name: 'license_type', type: 'string', description: '"access" or "premium" (optional)' },
            { name: 'billing_up_to_date', type: 'boolean', description: 'Billing status (optional)' },
          ],
          response: '{ "data": { "id": 1, "email": "client@example.com", "name": "Client Name", "company": "Acme Corp", "phone": "+1234567890", "notes": "VIP client", "license_type": "premium", "billing_up_to_date": true, "created_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'PUT',
          path: '/backend/api/clients.php?action=update',
          description: 'Update existing client',
          auth: true,
          body: [
            { name: 'id', type: 'integer', description: 'Client ID (required)' },
            { name: 'email', type: 'string', description: 'Client email (optional)' },
            { name: 'name', type: 'string', description: 'Client name (optional)' },
            { name: 'company', type: 'string', description: 'Company name (optional)' },
            { name: 'phone', type: 'string', description: 'Phone number (optional)' },
            { name: 'notes', type: 'string', description: 'Notes (optional)' },
            { name: 'license_type', type: 'string', description: '"access" or "premium" (optional)' },
            { name: 'billing_up_to_date', type: 'boolean', description: 'Billing status (optional)' },
          ],
          response: '{ "data": { "id": 1, "email": "updated@example.com", "name": "Updated Name", "company": "Acme Corp", "phone": "+1234567890", "notes": "VIP client", "license_type": "premium", "billing_up_to_date": true, "created_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'DELETE',
          path: '/backend/api/clients.php?action=delete&id={id}',
          description: 'Delete client',
          auth: true,
          params: [{ name: 'id', type: 'integer', description: 'Client ID' }],
          response: '{ "message": "Client deleted successfully" }',
        },
      ],
    },
    {
      title: 'Scenarios',
      icon: <FileText className="w-5 h-5" />,
      color: 'bg-purple-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/scenarios.php?action=list',
          description: 'Get all scenarios or scenarios for a specific client',
          auth: true,
          params: [
            { name: 'client_id', type: 'integer', description: 'Filter by client ID (optional)' },
          ],
          response: '{ "scenarios": [{ "id": 1, "client_id": 1, "title": "Scenario Title", "description": "Scenario description", "media_url": "https://example.com/media.zip", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/scenarios.php?action=get&id={id}',
          description: 'Get single scenario by ID',
          auth: true,
          params: [{ name: 'id', type: 'integer', description: 'Scenario ID' }],
          response: '{ "scenario": { "id": 1, "client_id": 1, "title": "Scenario Title", "description": "Scenario description", "media_url": "https://example.com/media.zip", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenarios.php?action=create',
          description: 'Create new scenario (admin or client)',
          auth: false,
          body: [
            { name: 'client_id', type: 'integer', description: 'Client ID (for admin)' },
            { name: 'userEmail', type: 'string', description: 'Client email (for client app)' },
            { name: 'title', type: 'string', description: 'Scenario title (required)' },
            { name: 'description', type: 'string', description: 'Scenario description (required)' },
            { name: 'scenarioData', type: 'JSON string', description: 'Alternative format for client apps' },
          ],
          response: '{ "success": true, "scenario": { "id": 1, "title": "New Scenario", "description": "Description", "client_id": 1, "created_at": "2024-01-15T10:30:00Z" }, "message": "Scenario created successfully" }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenarios.php?action=update',
          description: 'Update existing scenario',
          auth: true,
          body: [
            { name: 'id', type: 'integer', description: 'Scenario ID (required)' },
            { name: 'title', type: 'string', description: 'Scenario title (optional)' },
            { name: 'description', type: 'string', description: 'Scenario description (optional)' },
            { name: 'zip_file', type: 'file', description: 'Media file upload (optional)' },
          ],
          response: '{ "success": true, "scenario": { "id": 1, "title": "Updated Scenario", "description": "Updated description", "media_url": "https://example.com/media.zip", "updated_at": "2024-01-15T11:00:00Z" }, "message": "Scenario updated successfully" }',
        },
        {
          method: 'POST/DELETE',
          path: '/backend/api/scenarios.php?action=delete',
          description: 'Delete scenario',
          auth: true,
          body: [{ name: 'id', type: 'integer', description: 'Scenario ID' }],
          response: '{ "success": true, "message": "Scenario deleted successfully" }',
        },
      ],
    },
    {
      title: 'Logs',
      icon: <Activity className="w-5 h-5" />,
      color: 'bg-orange-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/logs.php?action=list',
          description: 'Get API logs with pagination',
          auth: true,
          params: [
            { name: 'limit', type: 'integer', description: 'Number of logs to return (default: 100)' },
            { name: 'offset', type: 'integer', description: 'Offset for pagination (default: 0)' },
          ],
          response: '{ "logs": [...], "total": 500, "limit": 100, "offset": 0 }',
        },
        {
          method: 'POST',
          path: '/backend/api/logs.php?action=clear',
          description: 'Clear all logs',
          auth: true,
          response: '{ "success": true, "message": "Logs cleared successfully" }',
        },
      ],
    },
    {
      title: 'Utilities',
      icon: <FileJson className="w-5 h-5" />,
      color: 'bg-teal-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/check_email.php?email={email}',
          description: 'Check if email exists in clients table (PHP backend)',
          auth: true,
          params: [{ name: 'email', type: 'string', description: 'Email address to check' }],
          response: '{ "exists": true }',
        },
      ],
    },
  ];

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'POST':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'PUT':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'DELETE':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const toggleEndpoint = (path: string) => {
    setExpandedEndpoint(expandedEndpoint === path ? null : path);
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Code className="w-8 h-8 text-gray-700" />
          <h1 className="text-3xl font-bold text-gray-900">API Documentation</h1>
        </div>
        <p className="text-gray-600 text-lg">
          Complete reference for TagHunter Admin API endpoints
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
        <h2 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Authentication
        </h2>
        <p className="text-blue-800 text-sm">
          Endpoints marked with a lock require authentication via session cookie. Include{' '}
          <code className="bg-blue-100 px-2 py-0.5 rounded">credentials: 'include'</code> in fetch requests.
        </p>
      </div>

      {apiSections.map((section, sectionIdx) => (
        <div key={sectionIdx} className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className={`${section.color} p-2 rounded-lg text-white`}>
              {section.icon}
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
          </div>

          <div className="space-y-4">
            {section.endpoints.map((endpoint, endpointIdx) => {
              const isExpanded = expandedEndpoint === `${sectionIdx}-${endpointIdx}`;
              return (
                <div
                  key={endpointIdx}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleEndpoint(`${sectionIdx}-${endpointIdx}`)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`px-3 py-1 rounded border font-mono text-xs font-semibold ${getMethodColor(
                          endpoint.method
                        )}`}
                      >
                        {endpoint.method}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono text-gray-700 break-all">
                            {endpoint.path}
                          </code>
                          {endpoint.auth && (
                            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{endpoint.description}</p>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                      {endpoint.params && endpoint.params.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm">
                            Query Parameters
                          </h4>
                          <div className="bg-white rounded border border-gray-200 overflow-hidden">
                            {endpoint.params.map((param, idx) => (
                              <div
                                key={idx}
                                className={`p-3 ${
                                  idx !== 0 ? 'border-t border-gray-200' : ''
                                }`}
                              >
                                <div className="flex items-baseline gap-2 mb-1">
                                  <code className="font-mono text-sm font-semibold text-gray-900">
                                    {param.name}
                                  </code>
                                  <span className="text-xs text-gray-500 font-mono">
                                    {param.type}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{param.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {endpoint.body && endpoint.body.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm">
                            Request Body
                          </h4>
                          <div className="bg-white rounded border border-gray-200 overflow-hidden mb-3">
                            {endpoint.body.map((field, idx) => (
                              <div
                                key={idx}
                                className={`p-3 ${
                                  idx !== 0 ? 'border-t border-gray-200' : ''
                                }`}
                              >
                                <div className="flex items-baseline gap-2 mb-1">
                                  <code className="font-mono text-sm font-semibold text-gray-900">
                                    {field.name}
                                  </code>
                                  <span className="text-xs text-gray-500 font-mono">
                                    {field.type}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{field.description}</p>
                              </div>
                            ))}
                          </div>
                          <div>
                            <h5 className="font-medium text-gray-700 mb-2 text-xs">Example Request Body:</h5>
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono overflow-x-auto">
                              {JSON.stringify(
                                Object.fromEntries(
                                  endpoint.body.map(field => {
                                    if (field.type === 'string') return [field.name, 'example_string'];
                                    if (field.type === 'integer') return [field.name, 1];
                                    if (field.type === 'boolean') return [field.name, true];
                                    if (field.type === 'JSON string') return [field.name, '{"key": "value"}'];
                                    if (field.type === 'file') return [field.name, '(binary file data)'];
                                    return [field.name, 'example_value'];
                                  })
                                ),
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        </div>
                      )}

                      {endpoint.response && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2 text-sm">
                            Success Response (200)
                          </h4>
                          <pre className="bg-gray-900 text-green-100 p-4 rounded text-xs font-mono overflow-x-auto border-2 border-green-600">
                            {JSON.stringify(JSON.parse(endpoint.response), null, 2)}
                          </pre>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2 text-sm">
                          cURL Example
                        </h4>
                        <pre className="bg-gray-900 text-blue-100 p-4 rounded text-xs font-mono overflow-x-auto">
                          {`curl -X ${endpoint.method} '${window.location.origin}${endpoint.path}' \\
  -H 'Content-Type: application/json'${endpoint.auth ? " \\\n  --cookie 'PHPSESSID=your_session_id'" : ''}${
                            endpoint.body && endpoint.body.length > 0
                              ? ` \\\n  -d '${JSON.stringify(
                                  Object.fromEntries(
                                    endpoint.body.map(field => {
                                      if (field.type === 'string') return [field.name, 'example_string'];
                                      if (field.type === 'integer') return [field.name, 1];
                                      if (field.type === 'boolean') return [field.name, true];
                                      return [field.name, 'example_value'];
                                    })
                                  )
                                )}'`
                              : ''
                          }`}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mt-12">
        <h2 className="font-semibold text-gray-900 mb-3">Error Responses</h2>
        <p className="text-gray-700 mb-4 text-sm">
          All endpoints may return error responses in the following format:
        </p>
        <pre className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono">
          {JSON.stringify({ error: 'Error message description' }, null, 2)}
        </pre>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">400</span>
            <span className="text-gray-700">Bad Request - Invalid parameters</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">401</span>
            <span className="text-gray-700">Unauthorized - Authentication required</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">404</span>
            <span className="text-gray-700">Not Found - Resource does not exist</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">405</span>
            <span className="text-gray-700">Method Not Allowed - Wrong HTTP method</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">500</span>
            <span className="text-gray-700">Server Error - Internal server error</span>
          </div>
        </div>
      </div>
    </div>
  );
}
