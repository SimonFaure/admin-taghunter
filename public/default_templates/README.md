# Tagquest default template

Place the canonical default template PNG here as `tagquest_template.png`.

Requirements:
- 16:9 aspect ratio (e.g., 1920×1080, 3840×2160, 5692×3200)
- Transparent background
- Frame artwork positioned so text overlays line up with the coordinates in
  `src/scenarios/bodies/tagquest/defaultLayout.ts`

The studio web app serves the file at `/default_templates/tagquest_template.png`
and the playground's Vite public/ has its own copy at the same URL path. Keep
both copies in sync.

Authors who upload a custom template can fetch this default as a spec via the
"Download default template" button in the Tagquest images section of the
scenario editor.
