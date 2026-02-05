# Client Cards & Devices Feature

This feature allows clients to upload CSV card files and track connected devices through the My Tools page.

## Overview

The system has been redesigned to:
1. Store CSV files on disk in a structured folder system
2. Track only metadata in the database (version numbers, timestamps)
3. Maintain a devices table to track which devices are using the cards
4. Validate that only CSV files can be uploaded

## Database Setup

Run the migration script to create the required tables:

```bash
php backend/apply_cards_migration.php
```

This creates two tables:

### client_cards_metadata
- `id` - Auto-incrementing primary key
- `client_id` - Reference to the client (UNIQUE)
- `version` - Integer version number (increments on each upload)
- `created_at` - Timestamp
- `updated_at` - Timestamp

### devices
- `id` - Auto-incrementing primary key
- `client_id` - Reference to the client
- `playground_version` - Version of the playground app
- `cards_file_version` - Version of cards file the device is using
- `device_uniq` - Unique device identifier (UNIQUE)
- `created_at` - Timestamp
- `updated_at` - Timestamp

## File Storage

CSV files are stored in a structured folder system:

```
cards/
  {client_id}/
    cards.csv
```

- Each client gets their own folder
- Only one file per client (cards.csv)
- Protected by .htaccess (direct access denied)
- Excluded from version control via .gitignore

## API Endpoints

### Cards API (`backend/api/cards.php`)

All endpoints require client authentication (session-based).

#### Get Metadata
```
GET /backend/api/cards.php?action=get_metadata
```
Returns version info and whether a file exists.

#### Upload File
```
POST /backend/api/cards.php?action=upload
Content-Type: multipart/form-data
Body: file (CSV file)
```
Validates file type, saves to disk, increments version.

#### Download File
```
GET /backend/api/cards.php?action=download
```
Returns the CSV file as a download.

#### Delete File
```
DELETE /backend/api/cards.php?action=delete
```
Removes the file and metadata.

### Devices API (`backend/api/devices.php`)

All endpoints require client authentication (session-based).

#### List Devices
```
GET /backend/api/devices.php?action=list
```
Returns all devices for the authenticated client.

#### Register Device
```
POST /backend/api/devices.php?action=register
Body: {
  "device_uniq": "unique-device-id",
  "playground_version": "1.0.0",
  "cards_file_version": 1
}
```
Creates or updates a device registration.

#### Update Device
```
PUT /backend/api/devices.php?action=update
Body: {
  "device_uniq": "unique-device-id",
  "playground_version": "1.0.1",
  "cards_file_version": 2
}
```
Updates device information.

#### Delete Device
```
DELETE /backend/api/devices.php?action=delete&device_uniq=xxx
```
Removes a device from the system.

## Frontend Integration

The My Tools page (`/src/components/client/MyToolsView.tsx`) provides:

### Cards Section
- File upload via drag-and-drop or click
- Validation that only CSV files are accepted
- Display of current file version and last update time
- Download button to retrieve the current CSV
- Delete button to remove the file

### Devices Section
- Table showing all connected devices
- Displays device ID, playground version, cards file version, and last connection time
- Auto-populates as devices connect via the API

## Security Features

1. **File Type Validation**
   - Extension check (.csv only)
   - MIME type validation
   - Both client-side and server-side validation

2. **File Storage Security**
   - Files stored outside web root access
   - Protected by .htaccess
   - Only accessible through authenticated API endpoints

3. **Authentication**
   - All endpoints require valid client session
   - Client ID is retrieved from session, not user input
   - Cannot access other clients' files

4. **Version Tracking**
   - Each upload increments the version number
   - Devices can check if they have the latest version
   - Historical tracking via timestamps

## Usage Flow

1. **Client uploads CSV file**
   - File is validated (must be .csv)
   - Saved to `cards/{client_id}/cards.csv`
   - Version incremented in database
   - Old file is replaced

2. **Device connects**
   - Device calls register endpoint with its unique ID
   - System records playground version and cards version
   - Device appears in client's My Tools page

3. **Device checks for updates**
   - Device queries its current cards_file_version
   - Compares with latest version in metadata
   - Downloads new file if version is outdated

4. **Client manages devices**
   - Views all connected devices
   - Sees which version each device is using
   - Can delete the cards file to reset everything

## Technical Notes

- Uses PHP/MySQL backend (not Supabase)
- Session-based authentication via `$_SESSION['client_id']`
- All operations are logged via `Logger::log()`
- File operations include proper error handling
- Frontend uses FormData for file uploads
- Blob download for retrieving CSV files

## Migration from Old System

If you had the old system with card data in the database:
- The migration script drops the old `client_cards` table
- You'll need to re-upload CSV files
- Old card data is not migrated (file-based system is source of truth)
