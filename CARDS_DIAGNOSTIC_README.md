# Cards Feature Diagnostic Guide

## Problem
Getting "No cards file found" error even though files exist in the `cards/{client_id}/` directory.

## Root Cause
The cards system requires TWO things to work:
1. **Physical CSV file** in `cards/{client_id}/cards_v{version}.csv`
2. **Database metadata entry** in `client_cards_metadata` table

If the file exists but there's no database metadata, the API will return "No cards file found".

## Diagnostic Tools

### 1. Browser Console Logs
Open your browser's developer console when viewing the cards page. You'll see detailed logs:

**Frontend logs:**
- `[cardsApi] getCardsMetadata` - Shows URL, headers, response
- `[cardsApi] getCardsData` - Shows URL, headers, response
- `========== LOADING CARDS ==========` sections

**Look for:**
- What `client_id` is being used in requests
- Response status codes
- Error messages

### 2. Backend API Logs
Check `/backend/logs/api_logs.txt` for detailed server-side logs showing:
- Which client_id was queried
- Whether metadata was found in database
- File paths being checked
- Whether files exist

### 3. Debug Endpoints

#### Check Filesystem
```
https://admin.taghunter.fr/backend/api/cards.php?action=check_filesystem&client_id={CLIENT_ID}
```
Shows:
- What files exist in the client's directory
- File paths, sizes, permissions
- No database lookup required

#### Debug Metadata
```
https://admin.taghunter.fr/backend/api/cards.php?action=debug_metadata&client_id={CLIENT_ID}
```
or
```
https://admin.taghunter.fr/backend/api/cards.php?action=debug_metadata
```
(without client_id to see all clients)

Shows:
- Database table structure
- All metadata records
- What files exist on disk for all clients
- Comparison between database and filesystem

### 4. PHP Diagnostic Scripts

#### Check Data Consistency
```bash
cd backend
php check_cards_data.php
```

This script:
- Lists all metadata in database
- Lists all files on disk
- Identifies mismatches
- Shows which clients have files but no metadata
- Shows which clients have metadata but no files

#### Sync Metadata
```bash
cd backend
php sync_cards_metadata.php
```

This script:
- Scans the `cards/` directory
- Creates missing metadata entries for existing files
- Renames files to proper version format if needed
- Only works for clients that exist in the `clients` table

## Common Issues & Solutions

### Issue 1: Files exist but no database metadata
**Symptom:** Files in `cards/{client_id}/` but "No cards file found" error

**Solution:**
```bash
cd backend
php sync_cards_metadata.php
```

### Issue 2: Wrong client_id being used
**Symptom:** Browser logs show client_id=1 but you're viewing a different client

**Check:**
1. Browser console logs - what client_id is in the URL?
2. Is the page URL correct? Should be `/clients/{correct_client_id}`
3. For client login: Is the token valid? Check localStorage

### Issue 3: File naming mismatch
**Symptom:** Metadata version doesn't match filename

**Expected format:** `cards_v{version}.csv` (e.g., `cards_v1.csv`, `cards_v2.csv`)

**Fix:** Rename file or update metadata version to match

### Issue 4: Permissions
**Symptom:** Files exist but not readable

**Check:**
```bash
ls -la cards/{client_id}/
```

**Fix:**
```bash
chmod 644 cards/{client_id}/*.csv
chmod 755 cards/{client_id}
```

## Step-by-Step Troubleshooting

1. **Check browser console**
   - Open DevTools Console tab
   - Navigate to cards page
   - Look for error messages in the logs

2. **Verify client_id**
   - What client_id is shown in browser logs?
   - Is this the correct client?

3. **Check database**
   ```bash
   cd backend
   php check_cards_data.php
   ```

4. **Check filesystem**
   ```bash
   ls -la ../cards/
   ```

5. **Sync if needed**
   ```bash
   php sync_cards_metadata.php
   ```

6. **Test the endpoints directly**
   - Use debug_metadata endpoint in browser
   - Use check_filesystem endpoint in browser

7. **Check backend logs**
   ```bash
   tail -f logs/api_logs.txt
   ```

## Expected File Structure

```
cards/
├── 1/
│   └── cards_v1.csv
├── 2/
│   └── cards_v1.csv
└── 3/
    ├── cards_v1.csv
    └── cards_v2.csv
```

## Expected Database Structure

Table: `client_cards_metadata`

| id | client_id | version | created_at | updated_at |
|----|-----------|---------|------------|------------|
| 1  | 1         | 1       | timestamp  | timestamp  |
| 2  | 2         | 1       | timestamp  | timestamp  |
| 3  | 3         | 2       | timestamp  | timestamp  |

## Next Steps

1. Open browser console and check what's being logged
2. Run `php backend/check_cards_data.php` to see the current state
3. Share the output with the development team
4. If files exist but no metadata, run the sync script
