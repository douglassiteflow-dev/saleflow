---
name: prompt-generator
description: Generates creative, atmosphere-rich design prompts for frontend artifacts, landing pages, slides, and web UIs. Use when you need inspiration or a detailed creative brief before building. Pairs with frontend-design and theme-factory skills.
disable-model-invocation: true
---

# Prompt Generator

Generate a creative design prompt by following these steps exactly:

## Step 1: Select a Design Style

RANDOMLY SELECT a design style from the list below. Use a genuine random selection method — do NOT default to any favorite or frequently chosen style. Actually randomize. You may also identify a professional style not on this list if it better fits the context.

**Available Design Styles:**
- Neobrutalist (raw, bold, confrontational with structured impact)
- Swiss/International (grid-based, systematic, ultra-clean typography)
- Editorial (magazine-inspired, sophisticated typography, article-focused)
- Glassmorphism (translucent layers, blurred backgrounds, depth)
- Retro-futuristic (80s vision of the future, refined nostalgia)
- Bauhaus (geometric simplicity, primary shapes, form follows function)
- Art Deco (elegant patterns, luxury, vintage sophistication)
- Minimal (extreme reduction, maximum whitespace, essential only)
- Flat (no depth, solid colors, simple icons, clean)
- Material (Google-inspired, cards, subtle shadows, motion)
- Neumorphic (soft shadows, extruded elements, tactile)
- Monochromatic (single color variations, tonal depth)
- Scandinavian (hygge, natural materials, warm minimalism)
- Japandi (Japanese-Scandinavian fusion, zen meets hygge)
- Dark Mode First (designed for dark interfaces, high contrast elegance)
- Modernist (clean lines, functional beauty, timeless)
- Organic/Fluid (flowing shapes, natural curves, sophisticated blob forms)
- Corporate Professional (trust-building, established, refined)
- Tech Forward (innovative, clean, future-focused)
- Luxury Minimal (premium restraint, high-end simplicity)
- Neo-Geo (refined geometric patterns, mathematical beauty)
- Kinetic (motion-driven, dynamic but controlled)
- Gradient Modern (sophisticated color transitions, depth through gradients)
- Typography First (type as the hero, letterforms as design)
- Metropolitan (urban sophistication, cultural depth)

## Step 2: Consider Context

If the user provided arguments (`$ARGUMENTS`), tailor the prompt to that context — a specific artifact type, audience, industry, or mood. If no arguments, generate a prompt for a general-purpose web artifact.

The prompt should be usable as direct input to the **frontend-design** skill or any frontend generation tool. It should inspire distinctive, non-generic output.

## Step 3: Write the Prompt

Create a prompt that is **EXACTLY THREE PARAGRAPHS**. Focus on conveying the **FEELING** and **ATMOSPHERE** of the chosen style:

**Paragraph 1 — Concept & Emotion:**
State the chosen style and ask the AI to conceive an innovative concept for the artifact. Describe the core emotional qualities this style evokes — what mood should visitors experience on arrival? How should visual hierarchy and flow guide them emotionally? Include a note to incorporate colorful elements as appropriate to enhance emotional impact.

**Paragraph 2 — Design Philosophy & Interaction:**
Explain the design philosophy through emotion and user experience. How should typography feel — authoritative, welcoming, cutting-edge? What sensation should interactions and animations create — smooth and liquid, snappy and precise, gentle and organic? Describe how the emotional journey should progress from first impression through final call-to-action, creating a narrative arc.

**Paragraph 3 — Abstract References & Inspiration:**
Provide abstract reference points that capture this aesthetic's essence — the feeling of certain spaces, cultural movements, artistic periods, architectural styles, or design philosophies. Reference the emotional qualities of premium experiences, sophisticated environments, or refined craftsmanship that should inspire the design. Explain how these abstract references should influence the visual sophistication of the result. Do NOT name specific brands or platforms.

## Output Format

Present the generated prompt clearly, preceded by the selected style name. The prompt must focus on feeling, atmosphere, and abstract quality — not technical specs. Keep references conceptual to allow maximum creative interpretation.

```
**Style:** [Selected Style Name]

[Three-paragraph prompt here]
```

After presenting the prompt, ask the user if they want to:
1. **Use it** — apply it with `/frontend-design` or start building
2. **Regenerate** — roll a new random style
3. **Tweak** — adjust the mood, audience, or artifact type
