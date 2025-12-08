# Backend Setup Instructions

This PHP backend connects your React admin panel to your MySQL database.

## Installation Steps

### 1. Upload Files to Server

Upload the entire `backend` folder to your server at: `public_html/backend/`

Your file structure should be:
```
public_html/
├── backend/
│   ├── .htaccess
│   ├── config/
│   │   └── database.php
│   ├── database/
│   │   ├── Database.php
│   │   └── migration.sql
│   └── api/
│       └── auth.php
├── index.html
└── assets/
```

### 2. Run Database Migrations

Connect to your database and run the SQL migration files in order:

**Option A: Using phpMyAdmin**
1. Log into phpMyAdmin
2. Select your database: `dboqjtvuf38s1n`
3. Go to the SQL tab
4. Run each migration file in this order:
   - Copy and paste contents of `migration.sql` → Click "Go"
   - Copy and paste contents of `add_roles_migration.sql` → Click "Go"
   - Copy and paste contents of `launched_games_migration.sql` → Click "Go"
   - Copy and paste contents of `api_logs.sql` → Click "Go"
   - Copy and paste contents of `add_game_fields_migration.sql` → Click "Go"

**Option B: Using MySQL command line**
```bash
mysql -u u0vswg9avwvro -p dboqjtvuf38s1n < backend/database/migration.sql
mysql -u u0vswg9avwvro -p dboqjtvuf38s1n < backend/database/add_roles_migration.sql
mysql -u u0vswg9avwvro -p dboqjtvuf38s1n < backend/database/launched_games_migration.sql
mysql -u u0vswg9avwvro -p dboqjtvuf38s1n < backend/database/api_logs.sql
mysql -u u0vswg9avwvro -p dboqjtvuf38s1n < backend/database/add_game_fields_migration.sql
```

This will create all necessary tables and add a default admin user.

### 3. Default Login Credentials

After running the migration, you can log in with:
- **Email:** admin@taghunter.fr
- **Password:** admin123

**IMPORTANT:** Change this password immediately after first login!

### 4. Security Notes

- The `backend/config/` and `backend/database/` directories are protected by `.htaccess`
- Only the `backend/api/` directory is accessible via HTTP
- Sessions are used for authentication with secure, HTTP-only cookies
- Always use HTTPS in production

## API Endpoints

All endpoints are accessed via: `https://admin.taghunter.fr/backend/api/auth.php`

### Login
```
POST /backend/api/auth.php?action=login
Body: {"email": "admin@taghunter.fr", "password": "admin123"}
```

### Logout
```
POST /backend/api/auth.php?action=logout
```

### Check Auth Status
```
GET /backend/api/auth.php?action=check
```

## Troubleshooting

### CORS Issues
If you get CORS errors, verify:
1. Your frontend URL matches: `https://admin.taghunter.fr`
2. The `.htaccess` file is present in the backend folder

### Database Connection Issues
1. Verify credentials in `config/database.php`
2. Check that your MySQL server is running
3. Ensure your database user has proper permissions

### Session Issues
1. Verify PHP sessions are enabled on your server
2. Check that the session directory is writable
3. Ensure cookies are enabled in your browser
