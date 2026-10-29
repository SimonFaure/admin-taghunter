# Taghunter Studio — Clash scenario import format (v1)

You are writing a **Clash** scenario that a Taghunter admin will import into Taghunter Studio
(Scenarios → **Import JSON**). Your output is one file, `scenario.json`. If you also have the
images, the admin zips them together with the JSON (see §6).

The import creates a **draft** scenario. The admin can then edit it in Studio, place the map
markers in the Layout editor, upload any missing images, and publish it.

---

## 1. What a Clash game is (context for writing good content)

- Players carry SportIdent chips and are split into **2 to 4 clans** (teams of many players).
- The play area is divided into **territories** (2–12, typically 8). Each territory is a set of
  physical **stations** (also called balises), identified by **station numbers** (1, 2, 3 …).
- A clan validates a territory by punching **all** of that territory's stations and then reading
  its chip at the clan's device. Whichever clan has validated a territory the most times
  **controls** it. A tie means the territory is neutral.
- Each controlled territory pays its clan **points per minute** (`points`) for as long as the
  clan holds it. Territories with more stations should usually be worth more.
- **The Purge** (optional): one special station (`purge_station`, default 25). Each clan can
  punch it once per game to reset the leading clan's strongest territory to neutral.
- The game is shown on a big screen: a full-screen **map** (`map_image`) with clan **banners**
  over controlled territories, a name/gauge label under each territory, a timer, a clan ranking
  panel and an event feed ("Wolves conquered the Forest").

---

## 2. Top-level structure of `scenario.json`

```json
{
  "format": "taghunter-scenario",
  "format_version": 1,
  "game_type": "clash",
  "default_language": "fr",
  "available_languages": ["fr", "en"],
  "game_meta": { }
}
```

| Key | Required | Notes |
|---|---|---|
| `format` | recommended | Always `"taghunter-scenario"`. |
| `format_version` | recommended | Always `1`. |
| `game_type` | **yes** | Always `"clash"`. |
| `default_language` | **yes** | One of `en fr es de it pt nl pl ru ja zh ar`. Usually `"fr"`. |
| `available_languages` | no | Every language the texts are written in, including the default one. |
| `game_meta` | **yes** | All the scenario content. See §3. |

### Text fields ("Localized")

Every player-facing text (marked **L** below) accepts either form:

- a plain string, which is stored as the default language: `"title": "La Guerre des Clans"`
- an object keyed by language code: `"title": { "fr": "La Guerre des Clans", "en": "Clan War" }`

Use the object form when you write more than one language.

### Media fields

A media field holds a **bare filename**, such as `"map.jpg"`. It is never a path or a URL. The
file must be included in the ZIP (§6). If the file is missing from the upload, the field is left
empty and a warning is shown; the admin then uploads it in the editor. You may leave every media
field out and send the JSON on its own.

Accepted extensions:

- images: `png jpg jpeg webp gif svg`
- sounds: `mp3 wav ogg m4a`
- fonts: `ttf otf woff woff2`

---

## 3. `game_meta` reference

### 3.1 General

| Key | Type | Default | Notes |
|---|---|---|---|
| `title` | **L**, **required** | — | Must be set in the default language. |
| `description` | **L** | — | Short catalog pitch (1–3 sentences). |
| `story` | **L** | — | Longer narrative or intro for the players. |
| `default_time` | number (minutes) | `60` | Game duration. |
| `audience_bands` | string[] | `[]` | Any of `age_4_5`, `age_6_7`, `age_8_10`, `age_11_12`, `age_13_plus`, `age_adultes`. |
| `univers` | string[] | `[]` | Free theme tags, e.g. `["médiéval", "fantasy"]`. |
| `difficulty` | integer 1–5 | — | |
| `font` | string | `"Arial"` | Font family name for the big screen. |
| `custom_fonts` | array | `[]` | `[{ "family": "MyFont", "faces": [{ "filename": "myfont.ttf", "weight": 400, "style": "normal" }] }]`. Font files go in the ZIP. |

### 3.2 `clans` (required, 2 to 4 entries)

```json
{ "id": "clan_1", "name": { "fr": "Les Loups" }, "color": "#c0392b",
  "banner": "wolves_banner.png", "logo": "wolves_logo.png", "score_card": "wolves_card.png" }
```

| Key | Type | Notes |
|---|---|---|
| `id` | string | Optional. Generated as `clan_1`, `clan_2` … when missing. |
| `name` | **L** | Clan name. Short, 1–3 words. |
| `color` | `#rrggbb` | Clan colour, used for gauges and ranking. Pick clearly different colours. Defaults: `#c0392b`, `#2980b9`, `#27ae60`, `#8e44ad`. |
| `banner` | image | Flag drawn over territories this clan controls. Square-ish, transparent PNG. Needed before publishing. |
| `logo` | image | Emblem shown in the ranking and the event feed. Square, transparent PNG. Needed before publishing. |
| `score_card` | image | Optional frame behind this clan's ranking row. |

### 3.3 `territories` (required, 2 to 12 entries; 8 is the standard)

```json
{ "id": "territory_1", "name": { "fr": "La Forêt Noire" }, "points": 5, "balises": [1, 2, 3, 4, 5],
  "banner_position": { "left": 20, "top": 14 },
  "label_position":  { "left": 20, "top": 26 },
  "purge_position":  { "left": 20, "top": 38 } }
```

| Key | Type | Notes |
|---|---|---|
| `id` | string | Optional. Generated as `territory_1` … when missing. |
| `name` | **L** | Territory name, shown on the map. Keep it short. |
| `points` | number ≥ 0 | Points per minute while controlled. |
| `balises` | integer[] | **Required, at least 1.** Station numbers that make up this territory. |
| `banner_position` | `{left, top}` | Optional. Centre of the clan banner, in % of the map (0–100). |
| `label_position` | `{left, top}` | Optional. Centre of the name and gauge label, in % of the map. |
| `purge_position` | `{left, top}` | Optional. Centre of the purge marker, in % of the map. |

**Hard rules.** The import is rejected if any of these is broken:

- Every territory has at least one station.
- No station number appears in two territories.
- No territory uses the `purge_station` number.
- All station numbers are positive integers.

The standard layout is 24 stations across 8 territories, split 5/4/4/3/3/2/2/1, with points
5/4/4/3/3/2/2/1. That is: T1 = `[1,2,3,4,5]`, T2 = `[6,7,8,9]`, T3 = `[10,11,12,13]`,
T4 = `[14,15,16]`, T5 = `[17,18,19]`, T6 = `[20,21]`, T7 = `[22,23]`, T8 = `[24]`, and the purge
on station 25. Use station numbers from 1 to 30; the import warns about numbers the Taghunter
station list doesn't know.

If you leave positions out, the Layout editor places the markers in a default grid. Only give
positions when you know where each territory sits on `map_image`.

### 3.4 The Purge

| Key | Type | Default | Notes |
|---|---|---|---|
| `purge_station` | integer | `25` | Must not be used by any territory. |
| `purge_image` | image | — | Marker for the purge target. **Without it, the purge is disabled** at launch. |
| `purge_sound` | sound | — | Plays on every screen when a purge fires. |

### 3.5 Big-screen images (all optional unless marked)

| Key | Notes |
|---|---|
| `game_visual` | **Needed before publishing.** Cover image for the catalog and registration screen. Landscape, 16:9. |
| `game_visual_intl` | Cover variant without French text, used for other languages. |
| `map_image` | **Needed before publishing.** Full-screen territory map. Landscape, 16:9, e.g. 1920×1080. |
| `frame_ranking` | Frame behind the clan-ranking panel. |
| `frame_territory_name` | Frame behind each territory name. |
| `frame_gauge` | Frame around each territory gauge. |
| `frame_event` | Frame behind the event-feed banner. |
| `frame_timer` | Frame behind the timer. |
| `frame_separator` | Separator bar in the event feed. |

### 3.6 Event and message texts (all **L**, optional)

When a text is left blank, the app uses its built-in translated default. Two placeholders are
available: `%CLAN%` (shown in the clan's colour) and `%TERRITORY%`.

| Key | When it shows | Example |
|---|---|---|
| `event_text_conquest` | A clan takes a territory | `"%CLAN% s'empare de %TERRITORY% !"` |
| `event_text_attack` | A clan attacks a held territory | `"%CLAN% attaque %TERRITORY% !"` |
| `event_text_neutralized` | A territory becomes neutral | `"%TERRITORY% est neutralisé"` |
| `event_text_purge` | A purge fires | `"%CLAN% a purgé %TERRITORY% !"` |
| `purge_text_already_used` | The clan has already used its purge | |
| `purge_text_own_territory` | The target is the clan's own territory | |
| `purge_text_no_target` | There is no purge target right now | |
| `ranking_title` | Heading of the ranking panel | `"Classement"` |

### 3.7 Look and layout (optional, normally adjusted in the editor)

| Key | Type | Default |
|---|---|---|
| `timer_color`, `ranking_color`, `territory_name_color`, `event_color` | `#rrggbb` | `#ffffff` |
| `banner_size_percentage` | number, % of map width | `5` |
| `purge_size_percentage` | number, % of map width | `4` |
| `gauge_size_percentage` | number, % of map width | `5` |
| `territory_name_scale`, `timer_scale` | number, % (100 = normal) | `100` |
| `timer_position` | `{left, top, width, height}`, %, centre-anchored | top-centre, `{50, 6, 12, 5}` |
| `ranking_position` | `{left, top, width, height}`, %, top-left corner | `{74, 2, 24, 72}` |
| `text_elements` | array of extra map captions: `{ "text": L, "bold": true, "position": {left, top, width, height} }` | `[]` |

Any key not listed in this document is ignored and reported as a warning.

---

## 4. Complete example

```json
{
  "format": "taghunter-scenario",
  "format_version": 1,
  "game_type": "clash",
  "default_language": "fr",
  "available_languages": ["fr", "en"],
  "game_meta": {
    "title": { "fr": "La Guerre des Clans", "en": "War of the Clans" },
    "description": { "fr": "Deux clans se disputent la vallée.", "en": "Two clans fight for the valley." },
    "story": { "fr": "Depuis des siècles…", "en": "For centuries…" },
    "default_time": 60,
    "audience_bands": ["age_11_12", "age_13_plus", "age_adultes"],
    "univers": ["médiéval"],
    "difficulty": 2,
    "game_visual": "cover.jpg",
    "map_image": "map.jpg",
    "purge_station": 25,
    "purge_image": "purge.png",
    "purge_sound": "purge.mp3",
    "clans": [
      { "id": "clan_1", "name": { "fr": "Les Loups", "en": "The Wolves" }, "color": "#c0392b", "banner": "wolves_banner.png", "logo": "wolves_logo.png" },
      { "id": "clan_2", "name": { "fr": "Les Ours", "en": "The Bears" }, "color": "#2980b9", "banner": "bears_banner.png", "logo": "bears_logo.png" }
    ],
    "territories": [
      { "id": "territory_1", "name": { "fr": "La Forêt", "en": "The Forest" }, "points": 5, "balises": [1, 2, 3, 4, 5] },
      { "id": "territory_2", "name": { "fr": "Le Lac", "en": "The Lake" }, "points": 4, "balises": [6, 7, 8, 9] },
      { "id": "territory_3", "name": { "fr": "La Tour", "en": "The Tower" }, "points": 4, "balises": [10, 11, 12, 13] },
      { "id": "territory_4", "name": { "fr": "Le Moulin", "en": "The Mill" }, "points": 3, "balises": [14, 15, 16] },
      { "id": "territory_5", "name": { "fr": "Le Pont", "en": "The Bridge" }, "points": 3, "balises": [17, 18, 19] },
      { "id": "territory_6", "name": { "fr": "La Grotte", "en": "The Cave" }, "points": 2, "balises": [20, 21] },
      { "id": "territory_7", "name": { "fr": "Le Puits", "en": "The Well" }, "points": 2, "balises": [22, 23] },
      { "id": "territory_8", "name": { "fr": "Le Rocher", "en": "The Rock" }, "points": 1, "balises": [24] }
    ],
    "event_text_conquest": { "fr": "%CLAN% s'empare de %TERRITORY% !", "en": "%CLAN% seizes %TERRITORY%!" },
    "event_text_purge": { "fr": "%CLAN% a purgé %TERRITORY% !", "en": "%CLAN% purged %TERRITORY%!" },
    "ranking_title": { "fr": "Classement", "en": "Ranking" }
  }
}
```

---

## 5. Checklist before handing over the file

- [ ] `game_type` is `"clash"` and `title` is filled in the default language.
- [ ] 2–4 clans, each with a name and a distinct `#rrggbb` colour.
- [ ] 2–12 territories, each with at least one station; no station appears twice; none equals `purge_station`.
- [ ] Every language listed in `available_languages` is filled in all **L** fields you used.
- [ ] Every media value is a bare filename that matches a file in the ZIP exactly (or is left out).
- [ ] The output is valid JSON: no comments, no trailing commas.

## 6. Packaging

- **JSON only:** upload `scenario.json` directly. Images can be added later in the editor.
- **With media:** make a ZIP containing `scenario.json` at the root and the files in `media/`:

```
my-clash.zip
├── scenario.json
└── media/
    ├── cover.jpg
    ├── map.jpg
    ├── wolves_banner.png
    └── …
```

Filenames are matched case-insensitively. Accents and spaces are replaced on import, so prefer
simple names such as `wolves_banner.png`.
