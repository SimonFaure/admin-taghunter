# Fix Cards Issue - Quick Guide

## The Problem
- Files exist in `cards/1/` directory
- BUT the `client_cards_metadata` table has no entry for client_id=1
- API returns "No cards file found" because it checks the database first

## The Solution

### Step 1: Check the current state
```bash
cd backend
php quick_check.php
```

This will show you:
- If client exists
- If metadata exists
- If files exist on disk

### Step 2: Sync the metadata
```bash
cd backend
php sync_cards_metadata.php
```

This will:
- Scan all files in the `cards/` directory
- Create database metadata entries for any missing clients
- Match the version number from the filename (e.g., `cards_v1.csv` → version 1)

### Step 3: Verify it worked
```bash
php quick_check.php
```

Should now show: ✓ Everything looks good!

## Important Notes

1. **You do NOT need the `client_cards` table** - that's an old table we're not using
2. **We use `client_cards_metadata` table** - stores only version info
3. **Actual data is in CSV files** on disk: `cards/{client_id}/cards_v{version}.csv`

## After Running Sync

Refresh the admin page - you should now see:
- `admin_get_metadata` returns the version info
- `admin_get_data` returns the cards data from the CSV

## If It Still Doesn't Work

Check the backend logs:
```bash
tail -f logs/api_logs.txt
```

Then make a request and see what errors appear.
