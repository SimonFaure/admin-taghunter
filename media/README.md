# Media Directory

This directory stores media files uploaded for scenarios. Each scenario has its own subdirectory based on its `uniqid`.

## Structure

```
media/
├── {uniqid1}/
│   ├── background.png
│   ├── logo.svg
│   └── font.woff2
├── {uniqid2}/
│   └── image.jpg
└── ...
```

## File Organization

- Each scenario's media files are stored in `/media/{uniqid}/`
- Original filenames are preserved (with sanitization for security)
- Files are accessible via: `https://admin.taghunter.fr/media/{uniqid}/{filename}`

## Access Control

- CORS is enabled for all media files
- Proper MIME types are configured for various file formats
- Files are cached for 1 year for better performance
- Directory browsing is disabled for security

## File Size Limits

- Maximum file size: 50MB per file
- This limit can be adjusted in `backend/api/scenarios.php` (upload_media action)

## Security

- Filenames are sanitized to prevent directory traversal attacks
- Ownership is verified before allowing uploads (userEmail must match scenario owner)
- Only authenticated scenarios can receive media uploads
