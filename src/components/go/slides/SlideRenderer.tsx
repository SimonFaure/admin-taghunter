/**
 * One Players-Instructions / briefing slide, drawn.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS DUPLICATED VERBATIM IN BOTH PROJECTS - KEEP THEM IN SYNC:    │
 * │   studio-taghunter/src/components/go/slides/SlideRenderer.tsx            │
 * │   taghunter-go/src/components/SlideRenderer.tsx                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Same convention as `fonts/catalog.ts`: the two apps are independent Vite
 * builds with no shared package, and what the author sees in Studio MUST be what
 * the player gets on the phone - so the drawing code is copied, not
 * re-implemented.
 *
 * Deliberately dependency-free (React only, inline styles, no Tailwind, no i18n,
 * no blob resolution): it takes an ALREADY-RESOLVED text string and an
 * ALREADY-RESOLVED image URL. That's what lets the file be byte-identical in
 * both projects despite their different helpers.
 *
 * A slide is a localized text block over a background that is either a solid
 * colour or an image. Design: memory project_go_spot_players_instructions_carousel.
 */

/** The slide fields `go.php` ships in the bundle and returns to Studio. */
export interface CarouselSlideStyle {
  /** Catalog font family, e.g. "Zombie". Null = inherit the scenario's font. */
  font_family?: string | null;
  /** "#rrggbb". Null = white. */
  font_color?: string | null;
  /**
   * Text size as a PERCENTAGE OF THE SLIDE'S WIDTH, rendered in container units.
   * Because the slide has a fixed aspect ratio, the same number gives the same
   * proportion on any phone and in Studio's preview at any scale.
   */
  font_size_pct?: number | null;
  text_align?: 'left' | 'center' | 'right' | null;
  /** Where the text block sits vertically. */
  text_anchor?: 'top' | 'middle' | 'bottom' | null;
  /** 0-100: opacity of the dark veil behind the text, for readability on photos. */
  scrim?: number | null;
  /** "#rrggbb". Also the letterbox colour behind a `contain` image. */
  background_color?: string | null;
  /** cover = crop to fill; contain = letterbox the whole image. */
  background_fit?: 'cover' | 'contain' | null;
}

/** The aspect ratio of the inline carousel card, in both apps. */
export const SLIDE_ASPECT = '4 / 5';

/** Fallbacks, so a half-authored slide still renders something sane. */
const DEFAULT_BG = '#0f172a'; // slate-900
const DEFAULT_FG = '#ffffff';
const DEFAULT_SIZE_PCT = 7;

interface Props {
  slide: CarouselSlideStyle;
  /** The slide's text, already resolved for the viewer's language. */
  text: string;
  /** The background image, already resolved to a displayable (blob) URL. */
  imageUrl: string | null;
  /**
   * 'card'  — fixed 4:5, the inline carousel under the scenario description.
   * 'fill'  — fills its parent (which must be a flex column), for the
   *           full-screen briefing.
   */
  variant?: 'card' | 'fill';
  /** Passed through so each app can add its own rounding / ring / spacing. */
  className?: string;
}

export function SlideRenderer({ slide, text, imageUrl, variant = 'card', className }: Props) {
  const align = slide.text_align ?? 'center';
  const anchor = slide.text_anchor ?? 'middle';
  const scrim = Math.max(0, Math.min(100, slide.scrim ?? 0));
  const sizePct = slide.font_size_pct ?? DEFAULT_SIZE_PCT;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        backgroundColor: slide.background_color || DEFAULT_BG,
        // Sizes below are expressed in `cqw` (percent of THIS box's width), so
        // the text keeps its proportion whatever the slide is rendered at.
        containerType: 'inline-size',
        // 'fill' GROWS as a flex item rather than asking for `height: 100%`:
        // every child here is absolutely positioned, so when the parent's height
        // is not definite (the briefing sits under a `min-h-full` shell) a
        // percentage height resolved to auto -> 0px, and the whole slide - image
        // and text - vanished, leaving only the scenario background showing
        // through (retours sept #54). The parent must be a flex column.
        ...(variant === 'card' ? { aspectRatio: SLIDE_ASPECT } : { flex: '1 1 0%', minHeight: 0 }),
      }}
      className={className}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: slide.background_fit === 'contain' ? 'contain' : 'cover',
          }}
        />
      )}

      {/* The text block. Anchored with flex rather than absolute offsets so a
          long translation grows into the slide instead of overflowing it. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent:
            anchor === 'top' ? 'flex-start' : anchor === 'bottom' ? 'flex-end' : 'center',
        }}
      >
        {text && (
          <div
            style={{
              // The scrim sits on the text's own box (not the whole slide), so
              // it rescues readability without dimming the artwork.
              backgroundColor: scrim > 0 ? `rgba(0,0,0,${scrim / 100})` : undefined,
              padding: '4cqw 5cqw',
              textAlign: align,
              color: slide.font_color || DEFAULT_FG,
              fontFamily: slide.font_family
                ? `"${slide.font_family}", system-ui, sans-serif`
                : undefined,
              fontSize: `${sizePct}cqw`,
              lineHeight: 1.25,
              // Authors write instructions with real line breaks.
              whiteSpace: 'pre-line',
              // Never let one long word push the slide sideways.
              overflowWrap: 'break-word',
            }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
