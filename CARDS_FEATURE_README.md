# Client Cards Feature

This feature allows clients to import and manage their game card collections through the My Tools page.

## Database Setup

To set up the cards feature, run the migration script:

```bash
php backend/apply_cards_migration.php
```

This will create the `client_cards` table with the following structure:

- `id` - Auto-incrementing primary key
- `client_id` - Reference to the client (from session)
- `card_name` - Name of the card
- `card_type` - Type/category of the card
- `card_rarity` - Rarity level
- `card_power` - Power/strength value
- `card_description` - Card description
- `additional_data` - JSON field for any extra columns in the CSV
- `import_batch` - UUID to group cards from the same import
- `created_at` - Timestamp
- `updated_at` - Timestamp

## API Endpoints

All endpoints are in `backend/api/cards.php` and require client authentication (session-based).

### List Cards
```
GET /backend/api/cards.php?action=list
```

Returns all cards for the authenticated client.

### Import Cards
```
POST /backend/api/cards.php?action=import
Body: {
  "cards": [...],
  "batchId": "uuid"
}
```

Deletes existing cards and imports new ones. Each card should have:
- card_name
- card_type
- card_rarity
- card_power
- card_description
- additional_data (optional object)

### Delete All Cards
```
DELETE /backend/api/cards.php?action=delete_all
```

Deletes all cards for the authenticated client.

## Frontend Integration

The cards feature is integrated into the My Tools page (`/src/components/client/MyToolsView.tsx`).

### CSV Import
Users can import cards by:
1. Dragging and dropping a CSV file onto the upload area
2. Clicking the upload area to browse for a file

The CSV parser is flexible and handles:
- Quoted fields with commas
- Headers in any order
- Common column name variations (Name/Card/Title, Type/Category, etc.)
- Extra columns are stored in `additional_data`

Expected CSV format:
```csv
Name,Type,Rarity,Power,Description
Dragon,Fire,Legendary,100,A powerful fire dragon
Wizard,Magic,Rare,75,Casts powerful spells
```

### Display
- Cards are shown in a table format
- Search functionality filters by name, type, or rarity
- Shows total card count
- Empty state when no cards are imported

## Technical Details

### Backend (PHP/MySQL)
- Uses session-based authentication
- Client ID is retrieved from `$_SESSION['client_id']`
- All operations are logged via `Logger::log()`
- Proper error handling and HTTP status codes

### Frontend (React/TypeScript)
- Uses fetch API with credentials: 'include' for session cookies
- Improved CSV parsing handles edge cases
- Real-time loading states
- Detailed error messages
- Console logging for debugging

## Notes

- Each import replaces all existing cards for that client
- The `import_batch` field can be used to track which cards came from the same upload
- Additional CSV columns beyond the standard 5 are preserved in `additional_data`
- The feature uses PHP/MySQL backend, not Supabase (as configured in .env with VITE_AUTH_MODE=php)
