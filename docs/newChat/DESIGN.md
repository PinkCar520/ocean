```markdown
# Design System Strategy: The Kinetic Minimalist

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"Kinetic Minimalism."** 

While enterprise AI often feels cold, clinical, or overly static, this system bridges the gap between high-stakes intelligence and human energy. We are moving away from the "standard SaaS dashboard" and toward an editorial, high-fidelity experience. 

The system breaks the "template" look by utilizing intentional asymmetry, generous white space (breathing room), and a "Typography-First" hierarchy. We don't use boxes to contain ideas; we use space and tonal shifts to guide the eye. The energy comes from the primary vibrant orange, used sparingly as a "laser-focused" accent rather than a heavy brand wash.

---

## 2. Color Theory & Tonal Architecture
We define brand presence through sophisticated containment and light-play rather than rigid lines.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit the use of 1px solid borders for sectioning or layout containment. 
Boundaries must be defined solely through background color shifts. For example, a side navigation panel should use `surface_container_low` against a `surface` main content area. Contrast is created through value, not strokes.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine, semi-translucent paper.
- **Base Layer:** `surface` (#fcf9f8) for the overall application canvas.
- **Primary Containers:** `surface_container_low` (#f6f3f2) for secondary layout areas (e.g., sidebars).
- **Floating Content:** `surface_container_lowest` (#ffffff) for the highest-priority cards or active work areas.
- **Nesting Logic:** Each inner container should move one step "up" or "down" the tier to define hierarchy without a border.

### The "Glass & Gradient" Rule
To elevate the "out-of-the-box" feel, use **Glassmorphism** for floating elements (overlays, popovers, or floating action buttons). 
- Use semi-transparent `surface` colors with a 12px to 20px `backdrop-blur`.
- Use a **Signature Texture** for Primary CTAs: A subtle linear gradient transitioning from `primary` (#a33800) to `primary_container` (#cc4900) at a 135° angle. This adds "soul" and depth to the vibrant orange.

---

## 3. Typography: Editorial Authority
The typography uses a dual-sans approach to balance technical precision with approachable warmth.

*   **The Display Choice (Manrope):** Used for `display-` and `headline-` scales. Manrope’s geometric yet slightly softened curves provide an "Engineered Humanism." Use wide letter-spacing (-0.02em) for larger headers to create an expensive, editorial feel.
*   **The Utility Choice (Inter):** Used for `title-`, `body-`, and `label-` scales. Inter is the workhorse. It ensures maximum readability in dense AI data environments.

**Hierarchy as Brand Identity:** 
High contrast in scale is mandatory. A `display-lg` header should feel significantly more authoritative than the `body-md` text beneath it, creating a "New York Times Tech" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
We reject the traditional "drop shadow." Depth is achieved through **Tonal Layering** and **Ambient Light.**

*   **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` section to create a soft, natural lift. This is "Zero-Elevation Depth."
*   **Ambient Shadows:** If an element must float (e.g., a Modal), use a shadow tinted with `on_surface` at 4%–6% opacity with a blur of 32px to 64px. It should look like a soft glow of light, not a black smudge.
*   **The "Ghost Border" Fallback:** If accessibility requires a container edge, use a "Ghost Border": `outline_variant` (#e2bfb3) at **15% opacity**. High-contrast, 100% opaque borders are forbidden.

---

## 5. Component Logic
Components follow a strict `DEFAULT: 0.5rem` (8px) corner radius to feel "friendly yet professional."

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`) with `on_primary` text. No border.
- **Secondary:** `surface_container_high` background with `on_surface` text.
- **Tertiary:** Transparent background, `primary` text, with a subtle `surface_variant` hover state.

### Input Fields
- **State:** No bottom-line only inputs. Use a full-fill `surface_container_highest` with a ghost border.
- **Focus:** Transition the ghost border to a 2px `surface_tint` (#a73a00) and a soft orange outer glow (4px blur).

### Cards & Lists
- **The No-Divider Rule:** Explicitly forbid horizontal divider lines in lists. Use `0.75rem` vertical white space or a 2% color shift on hover to separate items.
- **AI-Output Cards:** Use a `surface_container_lowest` fill with a subtle glassmorphism effect to distinguish AI-generated content from user inputs.

### AI Suggestion Chips
- **Style:** Use `secondary_fixed` (#ffdbce) backgrounds with `on_secondary_fixed_variant` text. These should feel distinct from primary actions—soft, suggestive, and non-intrusive.

---

## 6. Do’s and Don’ts

### Do
- **Do use asymmetrical layouts.** Place a large `display-md` headline on the left with significant empty space on the right to create an "open" feel.
- **Do use "Surface-on-Surface" nesting.** Create hierarchy through subtle color shifts (e.g., White card on a Light Gray background).
- **Do use "Inter" for all data-heavy tables.** It is optimized for legibility at small sizes.

### Don’t
- **Don't use 1px solid borders.** This is the fastest way to make the platform look "cheap" or "templated."
- **Don't use pure black (#000).** Always use `on_surface` (#1c1b1b) for text to maintain the sophisticated, high-fidelity tone.
- **Don't over-saturate with Orange.** The orange (`primary`) is the "spark." If everything is orange, nothing is important. Use it only for critical actions and active states.
- **Don't use standard shadows.** Avoid any shadow with more than 10% opacity. If it looks like a shadow, it’s too heavy. It should look like "depth."

---
*Director's Final Note: Precision is your best tool. In a minimalist system, every pixel of padding and every choice of tonal shift carries the weight of the brand. If a design feels "busy," remove a line and add 16px of space.*```