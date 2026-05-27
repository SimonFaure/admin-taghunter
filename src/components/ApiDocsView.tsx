import { Code, FileJson, Lock, Users, FileText, Activity, ShoppingCart, Smartphone, Image, File, Settings, CreditCard, Package, Wrench, LayoutGrid as Layout, Gamepad2, Rocket, UploadCloud, Database, AlertTriangle, ExternalLink, Server, Monitor, BookOpen } from 'lucide-react';
import { useState } from 'react';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth?: boolean;
  creator?: boolean;
  playground?: boolean;
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

interface ApiDocsViewProps {
  onNavigate?: (tab: string) => void;
}

export default function ApiDocsView({ onNavigate }: ApiDocsViewProps) {
  const [docTab, setDocTab] = useState<'guides' | 'reference'>('guides');
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const scrollToPlayground = () => {
    const el = document.getElementById('section-taghunter-playground-api');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const apiSections: ApiSection[] = [
    {
      title: 'Admin Authentication',
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
      title: 'Admin Users',
      icon: <Users className="w-5 h-5" />,
      color: 'bg-slate-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/admin_users.php?action=list',
          description: 'Get all admin users',
          auth: true,
          response: '{ "admins": [{ "id": 1, "email": "admin@example.com", "name": "Admin Name", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00" }] }',
        },
        {
          method: 'POST',
          path: '/backend/api/admin_users.php?action=create',
          description: 'Create new admin user',
          auth: true,
          body: [
            { name: 'email', type: 'string', description: 'Admin email (required, must be valid email)' },
            { name: 'password', type: 'string', description: 'Admin password (required, minimum 8 characters)' },
            { name: 'name', type: 'string', description: 'Admin name (optional)' },
          ],
          response: '{ "admin": { "id": 1, "email": "admin@example.com", "name": "Admin Name", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/admin_users.php?action=update',
          description: 'Update existing admin user',
          auth: true,
          body: [
            { name: 'id', type: 'integer', description: 'Admin ID (required)' },
            { name: 'email', type: 'string', description: 'Admin email (optional, must be valid email)' },
            { name: 'password', type: 'string', description: 'Admin password (optional, minimum 8 characters)' },
            { name: 'name', type: 'string', description: 'Admin name (optional)' },
          ],
          response: '{ "admin": { "id": 1, "email": "updated@example.com", "name": "Updated Name", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T11:00:00" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/admin_users.php?action=delete',
          description: 'Delete admin user (cannot delete own account)',
          auth: true,
          body: [
            { name: 'id', type: 'integer', description: 'Admin ID (required)' },
          ],
          response: '{ "success": true }',
        },
      ],
    },
    {
      title: 'Client Authentication (Secure)',
      icon: <Lock className="w-5 h-5" />,
      color: 'bg-indigo-500',
      endpoints: [
        {
          method: 'POST',
          path: '/backend/api/secure_auth.php?action=request-code',
          description: 'Request OTP code or magic link for passwordless authentication',
          auth: false,
          body: [
            { name: 'email', type: 'string', description: 'Client or admin email address' },
            { name: 'type', type: 'string', description: '"otp" or "magic_link" (default: otp)' },
          ],
          response: '{ "success": true, "message": "Code sent to your email", "expires_in": 900 }',
        },
        {
          method: 'POST',
          path: '/backend/api/secure_auth.php?action=verify-code',
          description: 'Verify OTP code and receive authentication token',
          auth: false,
          body: [
            { name: 'email', type: 'string', description: 'Client or admin email address' },
            { name: 'code', type: 'string', description: '6-digit OTP code' },
          ],
          response: '{ "success": true, "data": { "token": "auth_token_here", "expires_at": "2024-01-15T10:30:00Z", "user_id": "uuid-here", "user_type": "client", "email": "client@example.com", "name": "Client Name" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/secure_auth.php?action=validate',
          description: 'Validate authentication token',
          auth: false,
          body: [
            { name: 'token', type: 'string', description: 'Authentication token (or send as X-Auth-Token header)' },
          ],
          response: '{ "valid": true, "user_id": "uuid-here", "user_type": "client", "email": "client@example.com", "name": "Client Name", "expires_at": "2024-01-15T10:30:00Z" }',
        },
        {
          method: 'POST',
          path: '/backend/api/secure_auth.php?action=refresh',
          description: 'Refresh authentication token before expiry',
          auth: false,
          body: [
            { name: 'token', type: 'string', description: 'Current authentication token' },
          ],
          response: '{ "success": true, "data": { "token": "new_auth_token_here", "expires_at": "2024-01-15T12:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/secure_auth.php?action=logout',
          description: 'Revoke authentication token',
          auth: false,
          body: [
            { name: 'token', type: 'string', description: 'Authentication token to revoke' },
          ],
          response: '{ "success": true, "message": "Logged out successfully" }',
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
          method: 'GET',
          path: '/backend/api/clients.php?action=creator_list&email={email}',
          description: 'Get all clients (Creator API - admin only)',
          auth: false,
          creator: true,
          params: [{ name: 'email', type: 'string', description: 'Admin email for authentication' }],
          response: '{ "success": true, "data": [{ "id": 1, "email": "client@example.com", "name": "Client Name", "company": "Acme Corp", "phone": "+1234567890", "notes": "VIP client", "license_type": "premium", "billing_up_to_date": true, "playground_version": "1.0.0", "creator_version": "1.0.0", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }], "message": "Clients retrieved successfully" }',
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
          response: '{ "scenarios": [{ "id": 1, "client_id": 1, "title": "Scenario Title", "description": "Scenario description", "game_data": "{\\"key\\":\\"value\\"}", "game_type": "puzzle", "uniqid": "scenario_674fb123a45e6", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/scenarios.php?action=get&id={id}',
          description: 'Get single scenario by ID',
          auth: true,
          params: [{ name: 'id', type: 'integer', description: 'Scenario ID' }],
          response: '{ "scenario": { "id": 1, "client_id": 1, "title": "Scenario Title", "description": "Scenario description", "game_data": "{\\"key\\":\\"value\\"}", "game_type": "puzzle", "uniqid": "scenario_674fb123a45e6", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenarios.php?action=create',
          description: 'Create new scenario from Taghunter Creator (email-based auth)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'User email (client or admin) for authentication (required)' },
            { name: 'scenarioData', type: 'JSON string', description: 'Scenario data object containing title, description, uniqid, game_type, scenario_type, data, media, scenario_layout (required)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "title": "New Scenario", "description": "Description", "client_id": 1, "data": "{\\"key\\":\\"value\\"}", "medias": "{}", "game_type": "puzzle", "scenario_type": "multiplayer", "scenario_layout": "[]", "uniqid": "scenario_674fb123a45e6", "created_at": "2024-01-15T10:30:00Z" }, "message": "Scenario created successfully" }',
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
          response: '{ "success": true, "scenario": { "id": 1, "title": "Updated Scenario", "description": "Updated description", "updated_at": "2024-01-15T11:00:00Z" }, "message": "Scenario updated successfully" }',
        },
        {
          method: 'POST/DELETE',
          path: '/backend/api/scenarios.php?action=delete',
          description: 'Delete scenario',
          auth: true,
          body: [{ name: 'id', type: 'integer', description: 'Scenario ID' }],
          response: '{ "success": true, "message": "Scenario deleted successfully" }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenarios.php?action=upload_media',
          description: 'Upload individual media file to scenario (from Creator)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'User email (client or admin) for authentication (required)' },
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier (required)' },
            { name: 'file', type: 'file', description: 'Media file to upload (required)' },
          ],
          response: '{ "success": true, "data": { "name": "icon.png", "path": "/media/scenarios/scenario_674fb123a45e6/icon.png", "url": "https://studio.taghunter.fr/media/scenarios/scenario_674fb123a45e6/icon.png" }, "message": "File uploaded successfully" }',
        },
      ],
    },
    {
      title: 'Scenario Files',
      icon: <File className="w-5 h-5" />,
      color: 'bg-rose-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/scenario_files.php?action=list&scenario_id={id}',
          description: 'Get all files associated with a scenario',
          auth: true,
          params: [{ name: 'scenario_id', type: 'integer', description: 'Scenario ID' }],
          response: '{ "files": [{ "id": 1, "scenario_id": 1, "name": "Document", "file_path": "scenario_674fb123a45e6/files/document_1234567890.pdf", "file_size": 524288, "mime_type": "application/pdf", "created_at": "2024-01-15T10:30:00" }] }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenario_files.php?action=upload',
          description: 'Upload a file to a scenario (from Creator - email-based auth)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'User email (client or admin) for authentication (required)' },
            { name: 'scenario_id', type: 'integer', description: 'Scenario ID (required)' },
            { name: 'name', type: 'string', description: 'Display name for the file (required)' },
            { name: 'file', type: 'file', description: 'File to upload (required, max 50MB)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "scenario_id": 1, "name": "Document", "file_path": "scenario_674fb123a45e6/files/document_1234567890.pdf", "file_size": 524288, "mime_type": "application/pdf", "created_at": "2024-01-15T10:30:00" }, "message": "File uploaded successfully" }',
        },
        {
          method: 'POST',
          path: '/backend/api/scenario_files.php?action=delete',
          description: 'Delete a scenario file (from Creator - email-based auth)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'User email (client or admin) for authentication (required)' },
            { name: 'id', type: 'integer', description: 'File ID (required)' }
          ],
          response: '{ "success": true, "message": "File deleted successfully" }',
        },
        {
          method: 'GET',
          path: '/backend/api/scenario_files.php?action=download_zip&uniqid={uniqid}&email={email}',
          description: 'Download all scenario files as a zip archive (for playground/client use)',
          auth: false,
          params: [
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier' },
            { name: 'email', type: 'string', description: 'Client email address (must have access to scenario)' },
          ],
          response: '(Binary zip file with all scenario files)',
        },
      ],
    },
    {
      title: 'Media',
      icon: <Image className="w-5 h-5" />,
      color: 'bg-violet-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/media.php?action=list',
          description: 'Get all media files from all scenarios',
          auth: true,
          response: '{ "media": [{ "id": "md5hash", "name": "video.mp4", "scenario_uniqid": "scenario_674fb123a45e6", "path": "/media/scenarios/scenario_674fb123a45e6/video.mp4", "url": "https://studio.taghunter.fr/media/scenarios/scenario_674fb123a45e6/video.mp4", "size": 1048576, "mime_type": "video/mp4", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/media.php?action=get&uniqid={uniqid}&filename={filename}',
          description: 'Get a single media file by scenario uniqid and filename',
          auth: true,
          params: [
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier' },
            { name: 'filename', type: 'string', description: 'Media filename' },
          ],
          response: '{ "media": { "id": "md5hash", "name": "video.mp4", "scenario_uniqid": "scenario_674fb123a45e6", "path": "/media/scenarios/scenario_674fb123a45e6/video.mp4", "url": "https://studio.taghunter.fr/media/scenarios/scenario_674fb123a45e6/video.mp4", "size": 1048576, "mime_type": "video/mp4", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00" } }',
        },
        {
          method: 'GET',
          path: '/backend/api/media.php?action=scenarios&uniqid={uniqid}',
          description: 'Get scenarios that use media files from a specific scenario uniqid',
          auth: true,
          params: [
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier' },
          ],
          response: '{ "scenarios": [{ "id": 1, "title": "Scenario Title", "description": "Description", "game_type": "puzzle", "uniqid": "scenario_674fb123a45e6", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'POST',
          path: '/backend/api/media.php?action=delete',
          description: 'Delete a media file (supports bulk delete by calling multiple times)',
          auth: true,
          body: [
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier (required)' },
            { name: 'filename', type: 'string', description: 'Media filename (required)' },
          ],
          response: '{ "success": true, "message": "Media file deleted successfully" }',
        },
      ],
    },
    {
      title: 'Client Scenarios',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'bg-amber-500',
      endpoints: [
        {
          method: 'POST',
          path: '/backend/api/client_scenarios.php?action=add',
          description: 'Add a product scenario to a client',
          auth: true,
          body: [
            { name: 'client_id', type: 'integer', description: 'Client ID (required)' },
            { name: 'scenario_id', type: 'integer', description: 'Product scenario ID (required)' },
          ],
          response: '{ "success": true, "message": "Scenario added to client successfully" }',
        },
        {
          method: 'POST',
          path: '/backend/api/client_scenarios.php?action=remove',
          description: 'Remove a product scenario from a client',
          auth: true,
          body: [
            { name: 'client_id', type: 'integer', description: 'Client ID (required)' },
            { name: 'scenario_id', type: 'integer', description: 'Product scenario ID (required)' },
          ],
          response: '{ "success": true, "message": "Scenario removed from client successfully" }',
        },
        {
          method: 'GET',
          path: '/backend/api/client_scenarios.php?action=list&client_id={id}',
          description: 'Get all product scenarios assigned to a client',
          auth: true,
          params: [{ name: 'client_id', type: 'integer', description: 'Client ID' }],
          response: '[{ "id": 1, "client_id": 1, "scenario_id": 5, "granted_at": "2024-01-15T10:30:00Z", "granted_by": 1, "granted_by_email": "admin@example.com", "title": "Product Scenario", "description": "...", "game_type": "puzzle", "uniqid": "scenario_674fb123a45e6" }]',
        },
      ],
    },
    {
      title: 'Client Cards',
      icon: <CreditCard className="w-5 h-5" />,
      color: 'bg-slate-600',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/cards.php?action=get_metadata',
          description: 'Get cards file metadata for authenticated client',
          auth: true,
          response: '{ "data": { "id": 1, "client_id": "uuid", "version": 1, "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z", "has_file": true } }',
        },
        {
          method: 'GET',
          path: '/backend/api/cards.php?action=get_data',
          description: 'Get parsed cards data from CSV file (client only). CSV must have headers: key_name, color, key_number, id',
          auth: true,
          response: '{ "success": true, "data": [{ "key_name": "Key 1", "color": "red", "key_number": "001", "id": "uuid-here" }], "headers": ["key_name", "color", "key_number", "id"], "count": 1 }',
        },
        {
          method: 'POST',
          path: '/backend/api/cards.php?action=upload',
          description: 'Upload a CSV cards file (client only). File must have headers: key_name, color, key_number, id',
          auth: true,
          body: [
            { name: 'file', type: 'file', description: 'CSV file with headers: key_name, color, key_number, id (required)' },
          ],
          response: '{ "success": true, "version": 2 }',
        },
        {
          method: 'GET',
          path: '/backend/api/cards.php?action=download',
          description: 'Download the cards CSV file (client only)',
          auth: true,
          response: '(Binary CSV file with Content-Type: text/csv)',
        },
        {
          method: 'DELETE',
          path: '/backend/api/cards.php?action=delete',
          description: 'Delete the cards file and metadata (client only)',
          auth: true,
          response: '{ "success": true }',
        },
      ],
    },
    {
      title: 'Client Devices',
      icon: <Smartphone className="w-5 h-5" />,
      color: 'bg-stone-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/devices.php?action=list',
          description: 'Get all devices for authenticated client',
          auth: true,
          response: '{ "devices": [{ "id": 1, "client_id": "uuid", "device_uniq": "device-123", "playground_version": "1.0.0", "cards_file_version": 1, "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
      ],
    },
    {
      title: 'TagHunter Playground API',
      icon: <Gamepad2 className="w-5 h-5" />,
      color: 'bg-cyan-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_user_scenarios&email={email}',
          description: 'Get all scenarios available to a user based on their license type',
          auth: false,
          playground: true,
          params: [{ name: 'email', type: 'string', description: 'Client email address' }],
          response: '{ "client": { "id": 1, "email": "client@example.com", "licence_type": "premium", "company_name": "Acme Corp" }, "scenarios": [{ "id": 1, "title": "Scenario Title", "description": "Description", "game_type": "puzzle", "uniqid": "scenario_674fb123a45e6" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_available_scenarios&email={email}',
          description: 'Get product scenarios that the user has not yet purchased (access license only)',
          auth: false,
          playground: true,
          params: [{ name: 'email', type: 'string', description: 'Client email address' }],
          response: '{ "scenarios": [{ "id": 5, "title": "Product Scenario", "description": "Available for purchase", "game_type": "puzzle", "scenario_type": "product", "uniqid": "scenario_674fb123a45e6" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_scenario_game_data&email={email}&uniqid={uniqid}',
          description: 'Get game data and media information for a specific scenario (client must have access)',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier' },
          ],
          response: '{ "scenario": { "id": 1, "name": "Scenario Title", "uniqid": "scenario_674fb123a45e6", "scenario_type": "custom" }, "game_data": { "game_meta": { "font": "Arial", "title": "Game Title", "levels": {} }, "translations": { "fr": {} } }, "medias": { "images": { "game_visual": "game_visual.png" }, "levels": {}, "sounds": {}, "videos": {}, "enigmas": [] } }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_available_scenario_data&email={email}&uniqid={uniqid}',
          description: 'Get scenario metadata and media information without full game data (lightweight)',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier' },
          ],
          response: '{ "scenario": { "id": 1, "name": "Scenario Title", "uniqid": "scenario_674fb123a45e6", "scenario_type": "custom", "available_for_purchase": true }, "medias": { "images": { "game_visual": "game_visual.png" }, "levels": {}, "sounds": {}, "videos": {}, "enigmas": [] } }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_media&email={email}&uniqid={uniqid}&filename={filename}',
          description: 'Get media file for a scenario (client must have access). Files are served from media/scenarios/{uniqid}/{filename}.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
            { name: 'uniqid', type: 'string', description: 'Scenario unique identifier — maps to the folder media/scenarios/{uniqid}/' },
            { name: 'filename', type: 'string', description: 'Media filename inside the scenario folder' },
          ],
          response: '(Binary file content with appropriate Content-Type header — file served from media/scenarios/{uniqid}/{filename})',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_billing_status&email={email}',
          description: 'Get the billing status and license type for a client',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "billing_up_to_date": true, "license_type": "premium" }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_cards_version&email={email}',
          description: 'Get the current cards file version for a client',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "version": 3, "updated_at": "2024-01-15T10:30:00Z" }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_patterns&email={email}',
          description: 'Get all default patterns plus patterns owned by the client.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "patterns": [{ "id": 1, "name": "Default Pattern", "game_type": "taghunter", "version": "1.0", "is_default": true, "owner_type": "admin", "pattern_uniqid": "pat_abc123", "pattern_slug": "default-pattern", "description": null, "created_at": "2024-01-15T10:30:00Z" }], "count": 1 }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_layouts&email={email}',
          description: 'Get all active default layouts (admin-owned).',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "layouts": [{ "id": 1, "game_type": "taghunter", "status": "published", "version": "1.0", "owner_type": "admin", "layout_uniqid": "lay_abc123", "scenario_uniqid": null, "created_at": "2024-01-15T10:30:00Z" }], "count": 1 }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_cards&email={email}',
          description: 'Get the full cards list for a client parsed from their latest CSV file',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "cards": [{ "key_name": "Tag Alpha", "color": "#FF0000", "key_number": "1", "id": "card_001" }], "version": 3, "count": 150 }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_on_demand_cards&email={email}',
          description: 'Get all active on-demand cards assigned to a client (excludes expired assignments)',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
          ],
          response: '{ "cards": [{ "id": "uuid", "pool_card_id": "uuid", "end_date": "2025-12-31", "assigned_at": "2024-01-15T10:30:00Z", "key_name": "Tag Alpha", "color": "#FF0000", "key_number": "1", "card_id": "card_001" }], "count": 5 }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=get_user_data_update&email={email}',
          description: 'Aggregate endpoint returning all data a client needs to check for updates: published scenarios (custom + product), default and custom patterns, cards version, on-demand cards flag, active layouts, and billing status. Designed to be called on app launch or sync.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client or admin email address' },
          ],
          response: '{ "custom_scenarios": [{ "title": "My Scenario", "uniqid": "scenario_abc123", "version": "1.2", "game_type": "taghunter" }], "product_scenarios": [{ "title": "Product Scenario", "uniqid": "scenario_def456", "version": "2.0", "game_type": "taghunter" }], "default_patterns": [{ "name": "Default Pattern", "game_type": "taghunter", "version": "1.0", "pattern_uniqid": "pattern_abc123" }], "custom_patterns": [{ "name": "My Pattern", "game_type": "taghunter", "version": "1.0", "pattern_uniqid": "pattern_def456" }], "cards_version": 3, "has_on_demand_cards": true, "layouts": [{ "id": 1, "version": "1.0", "game_type": "taghunter" }], "billing_up_to_date": true, "license_type": "premium" }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=download_pattern&email={email}&pattern_uniqid={pattern_uniqid}',
          description: 'Download full pattern data by pattern_uniqid. Returns the complete pattern_data JSON. Access is granted for default patterns (all users) and custom patterns owned by the requesting client.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client or admin email address' },
            { name: 'pattern_uniqid', type: 'string', description: 'Unique identifier of the pattern to download' },
          ],
          response: '{ "name": "My Pattern", "game_type": "taghunter", "version": "1.0", "pattern_uniqid": "pattern_abc123", "pattern_slug": "my-pattern", "description": "...", "is_default": false, "pattern_data": { ... } }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=download_cards&email={email}&version={version}',
          description: 'Download a specific version of the client cards file as a JSON array. The version must match an existing entry in the client cards metadata.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client email address' },
            { name: 'version', type: 'integer', description: 'Cards file version number to download' },
          ],
          response: '{ "version": 3, "count": 150, "cards": [{ "key_name": "Tag Alpha", "color": "#FF0000", "key_number": "1", "id": "card_001" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/playground.php?action=download_layout&email={email}&layout_id={layout_id}',
          description: 'Download a layout by ID as a JSON object. Only active layouts are returned. Returns id, layout_uniqid, game_type, version, scenario_uniqid, and the full layout_data JSON.',
          auth: false,
          playground: true,
          params: [
            { name: 'email', type: 'string', description: 'Client or admin email address' },
            { name: 'layout_id', type: 'integer', description: 'ID of the layout to download' },
          ],
          response: '{ "id": 1, "layout_uniqid": "layout_abc123", "game_type": "taghunter", "version": "1.0", "scenario_uniqid": null, "layout_data": { ... } }',
        },
      ],
    },
    {
      title: 'Dashboard',
      icon: <Activity className="w-5 h-5" />,
      color: 'bg-emerald-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/dashboard.php?action=stats',
          description: 'Get dashboard statistics including clients, scenarios, media storage, and API requests',
          auth: true,
          response: '{ "clients": { "total": 25, "change": "+12%" }, "scenarios": { "total": 150, "change": "+8%" }, "storage": { "total": "2.5 GB", "change": "+15%" }, "apiRequests": { "total": 5000, "change": "+23%" } }',
        },
      ],
    },
    {
      title: 'Statistics',
      icon: <Activity className="w-5 h-5" />,
      color: 'bg-pink-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/statistics.php?action=overview',
          description: 'Get statistics overview with games, clients, and top performers',
          auth: true,
          response: '{ "overview": { "total_games": 150, "unique_clients": 25, "avg_duration": 45.5, "completion_rate": 85.5 }, "games_per_day": [...], "top_scenarios": [...], "top_clients": [...] }',
        },
        {
          method: 'GET',
          path: '/backend/api/statistics.php?action=recent',
          description: 'Get recent launched games with pagination',
          auth: true,
          params: [
            { name: 'limit', type: 'integer', description: 'Number of games to return (default: 50)' },
            { name: 'offset', type: 'integer', description: 'Offset for pagination (default: 0)' },
          ],
          response: '{ "games": [...], "total": 150, "limit": 50, "offset": 0 }',
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
          description: 'Get API logs with pagination and request parameters',
          auth: true,
          params: [
            { name: 'limit', type: 'integer', description: 'Number of logs to return (default: 100)' },
            { name: 'offset', type: 'integer', description: 'Offset for pagination (default: 0)' },
          ],
          response: '{ "logs": [{ "timestamp": "2024-01-15T10:30:00Z", "endpoint": "clients", "method": "POST", "action": "create", "user_id": 1, "ip": "127.0.0.1", "user_agent": "Mozilla/5.0...", "data": { "email": "test@example.com" }, "response": { "success": true }, "status_code": 200 }], "total": 500, "limit": 100, "offset": 0 }',
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
          description: 'Check if email exists and determine user type (client or admin)',
          auth: false,
          creator: true,
          params: [{ name: 'email', type: 'string', description: 'Email address to check' }],
          response: '{ "data": { "exists": true, "is_admin": false, "client_id": 123 } }',
        },
      ],
    },
    {
      title: 'Default Configuration',
      icon: <Settings className="w-5 h-5" />,
      color: 'bg-gray-500',
      endpoints: [
        {
          method: 'POST',
          path: '/backend/api/default_config.php?action=create',
          description: 'Create or update a default configuration (admin only)',
          auth: true,
          body: [
            { name: 'user_email', type: 'string', description: 'Admin email for verification (required)' },
            { name: 'meta', type: 'string', description: 'Configuration metadata name (required, unique)' },
            { name: 'version', type: 'integer', description: 'Configuration version number (required)' },
            { name: 'value', type: 'JSON', description: 'Configuration value as JSON object or array (required)' },
          ],
          response: '{ "success": true, "meta": "app_config", "version": 1, "action": "created" }',
        },
        {
          method: 'GET',
          path: '/backend/api/default_config.php?action=get&meta={meta}',
          description: 'Get a specific configuration by meta name, or all configurations if meta is omitted (admin only)',
          auth: true,
          params: [{ name: 'meta', type: 'string', description: 'Configuration metadata name (optional)' }],
          response: '{ "success": true, "config": { "id": "uuid", "meta": "app_config", "value": { "key": "value" }, "version": 1, "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'DELETE',
          path: '/backend/api/default_config.php?action=delete',
          description: 'Delete a default configuration by meta name (admin only)',
          auth: true,
          body: [
            { name: 'meta', type: 'string', description: 'Configuration metadata name (required)' },
          ],
          response: '{ "success": true, "message": "Configuration deleted" }',
        },
      ],
    },
    {
      title: 'Layouts',
      icon: <Layout className="w-5 h-5" />,
      color: 'bg-teal-600',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/layouts.php?action=list',
          description: 'Get all layouts (admins see all, clients see their own). Filterable by game_type and status.',
          auth: true,
          params: [
            { name: 'game_type', type: 'string', description: 'Filter by game type (optional)' },
            { name: 'status', type: 'string', description: 'Filter by status: draft, active, or archived (optional)' },
          ],
          response: '{ "data": [{ "id": 1, "layout_data": "{}", "game_type": "TagHunter", "scenario_uniqid": "scenario_674fb123a45e6", "status": "active", "version": "1.0", "owner_type": "client", "owner_id": 5, "created_by_email": "client@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/layouts.php?action=get&id={id}',
          description: 'Get a specific layout by ID',
          auth: true,
          params: [
            { name: 'id', type: 'integer', description: 'Layout ID (required)' },
          ],
          response: '{ "data": { "id": 1, "layout_data": "{}", "game_type": "TagHunter", "scenario_uniqid": "scenario_674fb123a45e6", "status": "active", "version": "1.0", "owner_type": "client", "owner_id": 5, "created_by_email": "client@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/layouts.php?action=upload',
          description: 'Upload a layout from Taghunter Creator (email-based authentication, no session required)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'Email of admin or client (required)' },
            { name: 'name', type: 'string', description: 'Layout name (required)' },
            { name: 'game_type', type: 'string', description: 'Game type (required)' },
            { name: 'layout_data', type: 'JSON', description: 'Layout JSON data (required)' },
            { name: 'status', type: 'string', description: 'Layout status: draft, active, or archived (required)' },
            { name: 'version', type: 'string', description: 'Layout version (optional, default: 1.0)' },
            { name: 'scenario_uniqid', type: 'string', description: 'Associated scenario unique identifier (optional)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "layout_data": "{}", "game_type": "TagHunter", "scenario_uniqid": "scenario_674fb123a45e6", "status": "draft", "version": "1.0", "owner_type": "client", "owner_id": 5, "created_by_email": "client@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'DELETE',
          path: '/backend/api/layouts.php?action=delete&id={id}',
          description: 'Delete a layout (owner or admin only)',
          auth: true,
          params: [
            { name: 'id', type: 'integer', description: 'Layout ID (required)' },
          ],
          response: '{ "success": true, "message": "Layout deleted successfully" }',
        },
      ],
    },
    {
      title: 'Patterns',
      icon: <Package className="w-5 h-5" />,
      color: 'bg-violet-500',
      endpoints: [
        {
          method: 'GET',
          path: '/backend/api/patterns.php?action=list',
          description: 'Get all patterns (admins see all, clients see default + own patterns)',
          auth: true,
          params: [
            { name: 'game_type', type: 'string', description: 'Filter by game type (optional)' },
          ],
          response: '{ "data": [{ "id": 1, "name": "Pattern Name", "description": "Pattern description", "game_type": "TagHunter", "pattern_data": "{}", "is_default": true, "owner_type": "admin", "owner_id": 1, "created_by_email": "admin@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" }] }',
        },
        {
          method: 'GET',
          path: '/backend/api/patterns.php?action=get&id={id}',
          description: 'Get a specific pattern by ID',
          auth: true,
          params: [
            { name: 'id', type: 'integer', description: 'Pattern ID (required)' },
          ],
          response: '{ "data": { "id": 1, "name": "Pattern Name", "description": "Pattern description", "game_type": "TagHunter", "pattern_data": "{}", "is_default": true, "owner_type": "admin", "owner_id": 1, "created_by_email": "admin@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/patterns.php?action=upload',
          description: 'Upload a pattern from Taghunter Creator (no authentication required)',
          auth: false,
          creator: true,
          body: [
            { name: 'email', type: 'string', description: 'Email of admin or client (required)' },
            { name: 'name', type: 'string', description: 'Pattern name (required)' },
            { name: 'game_type', type: 'string', description: 'Game type (required)' },
            { name: 'version', type: 'string', description: 'Pattern version (required)' },
            { name: 'pattern_data', type: 'JSON', description: 'Pattern JSON data (required)' },
            { name: 'is_default', type: 'boolean', description: 'Make pattern default/available to all (optional)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "name": "Pattern Name", "description": null, "game_type": "TagHunter", "version": "1.0", "pattern_data": "{}", "is_default": false, "owner_type": "client", "owner_id": 5, "created_by_email": "client@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'POST',
          path: '/backend/api/patterns.php?action=create',
          description: 'Create a new pattern (authenticated users)',
          auth: true,
          body: [
            { name: 'name', type: 'string', description: 'Pattern name (required)' },
            { name: 'game_type', type: 'string', description: 'Game type (required)' },
            { name: 'pattern_data', type: 'JSON', description: 'Pattern JSON data (required)' },
            { name: 'description', type: 'string', description: 'Pattern description (optional)' },
            { name: 'is_default', type: 'boolean', description: 'Make pattern default (admin only, optional)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "name": "Pattern Name", "description": "Pattern description", "game_type": "TagHunter", "pattern_data": "{}", "is_default": false, "owner_type": "admin", "owner_id": 1, "created_by_email": "admin@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T10:30:00Z" } }',
        },
        {
          method: 'PUT',
          path: '/backend/api/patterns.php?action=update&id={id}',
          description: 'Update an existing pattern (owner or admin only)',
          auth: true,
          params: [
            { name: 'id', type: 'integer', description: 'Pattern ID (required)' },
          ],
          body: [
            { name: 'name', type: 'string', description: 'Pattern name (optional)' },
            { name: 'game_type', type: 'string', description: 'Game type (optional)' },
            { name: 'pattern_data', type: 'JSON', description: 'Pattern JSON data (optional)' },
            { name: 'description', type: 'string', description: 'Pattern description (optional)' },
            { name: 'is_default', type: 'boolean', description: 'Make pattern default (admin only, optional)' },
          ],
          response: '{ "success": true, "data": { "id": 1, "name": "Updated Pattern", "description": "Updated description", "game_type": "TagHunter", "pattern_data": "{}", "is_default": false, "owner_type": "admin", "owner_id": 1, "created_by_email": "admin@example.com", "created_at": "2024-01-15T10:30:00Z", "updated_at": "2024-01-15T11:00:00Z" } }',
        },
        {
          method: 'DELETE',
          path: '/backend/api/patterns.php?action=delete&id={id}',
          description: 'Delete a pattern (owner or admin only)',
          auth: true,
          params: [
            { name: 'id', type: 'integer', description: 'Pattern ID (required)' },
          ],
          response: '{ "success": true, "message": "Pattern deleted successfully" }',
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
      {/* Top-level tab switch: conceptual guides vs the endpoint reference. */}
      <div className="border-b border-gray-200 mb-8">
        <div className="flex gap-1">
          <button
            onClick={() => setDocTab('guides')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              docTab === 'guides'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Guides
          </button>
          <button
            onClick={() => setDocTab('reference')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              docTab === 'reference'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Code className="w-4 h-4" />
            API Reference
          </button>
        </div>
      </div>

      {docTab === 'guides' && <DeploymentGuide onNavigate={onNavigate} />}

      {docTab === 'reference' && (
        <>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-gray-600 text-lg">
            Complete reference for TagHunter Admin API endpoints
          </p>
          <button
            onClick={scrollToPlayground}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <Gamepad2 className="w-4 h-4" />
            Playground Endpoints
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <h2 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Authentication
        </h2>
        <p className="text-blue-800 text-sm">
          Endpoints marked with a lock require authentication via session cookie. Include{' '}
          <code className="bg-blue-100 px-2 py-0.5 rounded">credentials: 'include'</code> in fetch requests.
        </p>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
        <h2 className="font-semibold text-orange-900 mb-2 flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Taghunter Creator Endpoints
        </h2>
        <p className="text-orange-800 text-sm">
          Endpoints marked with the <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
            <Wrench className="w-3 h-3" />
            Creator
          </span> badge are specifically designed for use with the Taghunter Creator application.
          These endpoints use email-based authentication instead of session cookies and return standardized responses with <code className="bg-orange-100 px-2 py-0.5 rounded">success</code>, <code className="bg-orange-100 px-2 py-0.5 rounded">data</code>, and <code className="bg-orange-100 px-2 py-0.5 rounded">message</code> fields.
        </p>
      </div>

      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mb-8">
        <h2 className="font-semibold text-cyan-900 mb-2 flex items-center gap-2">
          <Gamepad2 className="w-4 h-4" />
          Taghunter Playground Endpoints
        </h2>
        <p className="text-cyan-800 text-sm">
          Endpoints marked with the <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-300">
            <Gamepad2 className="w-3 h-3" />
            Playground
          </span> badge are designed for use with the Taghunter Playground mobile application.
          These endpoints are public (no session required) and identify users by email address. They provide all data needed by the app including scenarios, patterns, layouts, cards, and billing status.
        </p>
      </div>

      {apiSections.map((section, sectionIdx) => (
        <div
          key={sectionIdx}
          id={`section-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
          className="mb-12"
        >
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <code className="text-sm font-mono text-gray-700 break-all">
                            {endpoint.path}
                          </code>
                          {endpoint.auth && (
                            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          {endpoint.creator && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300 flex-shrink-0">
                              <Wrench className="w-3 h-3" />
                              Creator
                            </span>
                          )}
                          {endpoint.playground && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-300 flex-shrink-0">
                              <Gamepad2 className="w-3 h-3" />
                              Playground
                            </span>
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
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(endpoint.response), null, 2);
                              } catch {
                                return endpoint.response;
                              }
                            })()}
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
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guides tab: how TagHunter ships to production and how playground versions
// are cut. App-release scope only (studio web deploy + playground builds).
// ---------------------------------------------------------------------------

function GuideSection({
  icon,
  color,
  title,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className={`${color} p-2 rounded-lg text-white`}>{icon}</div>
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 text-sm text-gray-700 space-y-2 pt-0.5">{children}</div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[0.8em] font-mono break-all">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function DeploymentGuide({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Rocket className="w-7 h-7 text-gray-700" />
        <h2 className="text-2xl font-bold text-gray-900">Deployment &amp; Versioning</h2>
      </div>
      <p className="text-gray-600 mb-8 max-w-3xl">
        How TagHunter ships to production. The studio web app and the playground app follow two very
        different release models — read the concepts first, then jump to the runbook for whatever
        you're shipping.
      </p>

      {/* Concepts */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-10">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <FileJson className="w-4 h-4" />
          Concepts to know first
        </h3>
        <ul className="space-y-3 text-sm text-slate-700">
          <li>
            <strong>Studio web app (this admin) — unversioned.</strong> There's no version number;
            whatever files sit on the server are what's live. You ship by building locally and
            uploading the result. It's continuous deployment, done by hand.
          </li>
          <li>
            <strong>Playground app (desktop + mobile) — semver-versioned.</strong> The version lives
            in <Mono>taghunter_playground/src-tauri/tauri.conf.json</Mono> (<Mono>version</Mono>, e.g.{' '}
            <Mono>1.1.0</Mono>). Every build is a discrete release tracked in the{' '}
            <strong>Releases</strong> tab.
          </li>
          <li>
            <strong>“latest”.</strong> Exactly one release per platform is flagged latest — that's the
            build the auto-updater offers to everyone.
          </li>
          <li>
            <strong>Minimum supported version (the “floor”).</strong> A hard block: any client older
            than the floor is forced to update before it can run. Raise it only for breaking changes.
          </li>
          <li>
            <strong>Updater signature.</strong> Every desktop build ships with a <Mono>.sig</Mono> file.
            The app verifies it against the public key baked into <Mono>tauri.conf.json</Mono>, so only
            builds you signed can install.
          </li>
        </ul>
      </div>

      {/* Runbook 1 — studio web deploy */}
      <GuideSection
        icon={<Server className="w-5 h-5" />}
        color="bg-blue-500"
        title="Deploying the studio web app"
      >
        <div className="space-y-4 mb-4">
          <Step n={1}>
            <p>
              <strong>Build the frontend.</strong> From <Mono>studio-taghunter/</Mono> run{' '}
              <Mono>npm run build</Mono>. Vite writes the production bundle to <Mono>dist/</Mono>.
            </p>
          </Step>
          <Step n={2}>
            <p>
              <strong>Upload over SFTP.</strong> Copy the <em>contents</em> of <Mono>dist/</Mono> to the
              web root, and any changed PHP under <Mono>backend/</Mono> to the matching path on the
              server. The server layout mirrors the repo: built frontend at the root,{' '}
              <Mono>backend/</Mono> alongside it (so the API stays at <Mono>/backend/api</Mono>).
            </p>
          </Step>
          <Step n={3}>
            <p>
              <strong>Apply DB changes by hand.</strong> There is no migration runner on the PHP side.
              If your change added a file under <Mono>backend/database/*.sql</Mono>, run it in
              phpMyAdmin against the production database. (This is unlike the playground, whose SQLite
              schema is managed by tracked sqlx migrations.)
            </p>
          </Step>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Never overwrite these — they hold live data or prod-only config
          </h4>
          <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
            <li>
              <Mono>media/</Mono> — scenario media uploads
            </li>
            <li>
              <Mono>cards/</Mono> — per-client CSV card files
            </li>
            <li>
              <Mono>backend/releases/</Mono> — uploaded playground build artifacts
            </li>
            <li>
              <Mono>backend/config/database.php</Mono> and any prod <Mono>.env</Mono> / <Mono>.htaccess</Mono>
            </li>
          </ul>
          <p className="text-sm text-red-800 mt-2">
            Configure your SFTP client to skip these paths, or upload only the specific files you
            changed.
          </p>
        </div>
      </GuideSection>

      {/* Runbook 2 — playground desktop release */}
      <GuideSection
        icon={<Monitor className="w-5 h-5" />}
        color="bg-emerald-500"
        title="Releasing a new playground desktop version"
      >
        <div className="space-y-4">
          <Step n={1}>
            <p>
              <strong>Bump the version.</strong> Edit <Mono>version</Mono> in{' '}
              <Mono>taghunter_playground/src-tauri/tauri.conf.json</Mono> to the new semver{' '}
              (<Mono>x.y.z</Mono>). This is the number clients compare against.
            </p>
          </Step>
          <Step n={2}>
            <p>
              <strong>Build &amp; sign.</strong> The signing key must be in the environment so{' '}
              <Mono>tauri build</Mono> emits the <Mono>.sig</Mono> next to the artifact:
            </p>
            <CodeBlock>{`# PowerShell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\\.tauri\\playground_updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # key was generated without a password
npm run tauri:build`}</CodeBlock>
          </Step>
          <Step n={3}>
            <p>
              <strong>Publish in studio.</strong> Open <strong>Releases → New desktop release</strong>.
              Upload the updater artifact and its <Mono>.sig</Mono>, set the version, the minimum
              supported floor, and release notes, then mark it latest.
            </p>
          </Step>
          <Step n={4}>
            <p>
              <strong>Clients self-update</strong> on next launch (or via Settings → Updates). The
              manifest the app polls is served by <Mono>backend/api/playground_update.php</Mono>;
              artifacts are stored under <Mono>backend/releases/</Mono>.
            </p>
          </Step>
        </div>
        <button
          onClick={() => onNavigate?.('releases')}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UploadCloud className="w-4 h-4" />
          Go to Releases
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </GuideSection>

      {/* Runbook 3 — playground mobile release */}
      <GuideSection
        icon={<Smartphone className="w-5 h-5" />}
        color="bg-cyan-500"
        title="Releasing a playground mobile version"
      >
        <p className="text-sm text-gray-700 mb-4">
          Mobile builds (Android / iOS) can't self-install — they show the same update screens but
          deep-link to the app store instead of downloading an artifact.
        </p>
        <div className="space-y-4">
          <Step n={1}>
            <p>
              <strong>Publish the build to the store</strong> (Google Play / App Store) the usual way —
              this happens outside studio.
            </p>
          </Step>
          <Step n={2}>
            <p>
              <strong>Register it in studio.</strong> Open <strong>Releases → New mobile release</strong>{' '}
              and set the version, platform, the store URL, the minimum supported floor, and notes.
            </p>
          </Step>
          <Step n={3}>
            <p>
              <strong>Outdated clients</strong> are then pointed at that store link when they're below
              the floor or behind latest.
            </p>
          </Step>
        </div>
      </GuideSection>

      {/* Caveats */}
      <GuideSection
        icon={<AlertTriangle className="w-5 h-5" />}
        color="bg-amber-500"
        title="Caveats &amp; known gaps"
      >
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-4 text-sm text-amber-900">
          <div>
            <p className="font-semibold mb-1">The updater key has no password.</p>
            <p>
              The signing key was generated without one. Before real distribution, regenerate it{' '}
              <em>with</em> a password (<Mono>tauri signer generate -p &lt;password&gt;</Mono>), update{' '}
              <Mono>pubkey</Mono> in <Mono>tauri.conf.json</Mono>, and ship that build manually —
              auto-update only rolls forward from a build that already carries the new public key.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">
              <Mono>1.1.0</Mono> is the first updater-capable build.
            </p>
            <p>
              The original <Mono>1.0.0</Mono> has no updater plugin and can't auto-update; existing{' '}
              <Mono>1.0.0</Mono> users must install <Mono>1.1.0</Mono> by hand. Every build from{' '}
              <Mono>1.1.0</Mono> onward updates itself.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">Not OS-code-signed yet.</p>
            <p>
              Windows SmartScreen and macOS Gatekeeper warn on first install and on each update. The
              Tauri updater signature still proves the artifact's authenticity — the OS just doesn't
              recognise the publisher. Acquiring OS code-signing certificates is a deferred follow-up.
            </p>
          </div>
        </div>
      </GuideSection>

      <div className="flex items-start gap-2 text-xs text-gray-500 border-t border-gray-200 pt-4">
        <Database className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Scope: app releases and web deploy. Content versioning (scenario / pattern / layout / cards
          version bumps that drive client re-sync) is a separate workflow and isn't covered here.
        </p>
      </div>
    </div>
  );
}
