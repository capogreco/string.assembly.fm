# Reverb Parameter Mapping Reference

## Arc Value to Reverb Space Mapping

This document provides the exact parameter values for the Arc reverb control using a simplified, artifact-free approach.

### Overview
To eliminate artifacts from delay line changes, this implementation uses:
- **Fixed parameters**: `roomSize` (0.65), `decay` (0.7), `preDelay` (20ms)
- **Variable parameters**: `mix`, `damping`, `diffusion`, `modulation`, `earlyLevel`

### Parameter Mapping

| Arc Value | Mix | Damping | Diffusion | Modulation | Early Level | Description |
|-----------|-----|---------|-----------|------------|-------------|-------------|
| 0% | 0.00 | 0.80 | 0.50 | 0.05 | 0.70 | Dry |
| 10% | 0.09 | 0.73 | 0.55 | 0.12 | 0.64 | Dry |
| 20% | 0.17 | 0.67 | 0.59 | 0.18 | 0.57 | Subtle |
| 30% | 0.25 | 0.60 | 0.64 | 0.24 | 0.51 | Subtle |
| 40% | 0.33 | 0.53 | 0.68 | 0.30 | 0.44 | Present |
| 50% | 0.41 | 0.47 | 0.73 | 0.36 | 0.38 | Present |
| 60% | 0.49 | 0.40 | 0.77 | 0.42 | 0.31 | Spacious |
| 70% | 0.56 | 0.33 | 0.82 | 0.48 | 0.25 | Spacious |
| 80% | 0.64 | 0.27 | 0.86 | 0.54 | 0.18 | Immersive |
| 90% | 0.72 | 0.20 | 0.91 | 0.60 | 0.12 | Extreme Wash |
| 100% | 1.00 | 0.05 | 0.95 | 0.80 | 0.05 | Extreme Wash |

### Fixed Parameters (Throughout Entire Range)
- **roomSize**: 0.65 (medium-large room)
- **decay**: 0.7 (healthy reverb tail)
- **preDelay**: 20ms (natural pre-delay)

### Variable Parameter Formulas
All based on `position = Math.pow(arcValue, 1.2)`:

- **mix**: `position` (linear 0 → 1.0, 100% wet at maximum)
- **damping**: `0.8 - position * 0.75` (darker → extremely bright)
- **diffusion**: `0.5 + position * 0.45` (clear → maximum diffusion)
- **modulation**: `0.05 + position * 0.75` (subtle → extreme wobble)
- **earlyLevel**: `0.7 - position * 0.65` (direct → almost pure late reverb)

## Key Design Decisions

### Non-Linear Scaling
The Arc value is transformed using `position = Math.pow(arcValue, 1.2)` to provide:
- More resolution in the lower range where subtle reverb matters most
- Natural feeling progression throughout the range

### Fixed Parameters for Stability
To completely eliminate artifacts:
- **Room Size**: Fixed at 0.65 (no delay line changes)
- **Decay**: Fixed at 0.7 (stable feedback amount)
- **Pre-delay**: Fixed at 20ms (no buffer jumps)

### Variable Parameters for Character
Safe parameters that shape the reverb character:
- **Mix**: Main wet/dry control with equal-power crossfade
- **Damping**: Controls brightness (0.8→0.15 = dark→bright)
- **Diffusion**: Controls clarity (0.5→0.9 = clear→diffuse)
- **Modulation**: Adds movement (0.05→0.5 = subtle→ethereal)
- **Early Level**: Balance of direct vs late reverb

### Volume Compensation
The reverb processor includes automatic gain compensation:
- Below 50% mix: No compensation needed
- 50-75% mix: Gradual gain boost from 1.0x to 3.0x
- 75-100% mix: Aggressive gain boost from 3.0x to 8.0x
- At 100% mix: Complete wet signal with 8.0x gain boost
- This creates an overwhelming wash effect at maximum settings

## Character Progression

The reverb character evolves smoothly across the range:

| Range | Character | Key Features |
|-------|-----------|--------------|
| 0-10% | Dry | No reverb to barely noticeable |
| 10-30% | Subtle | Light ambience, darker tone, minimal movement |
| 30-50% | Present | Noticeable reverb, balanced tone, gentle movement |
| 50-70% | Spacious | Prominent reverb, brighter tone, more diffusion |
| 70-85% | Immersive | Enveloping reverb, bright and diffuse, swirling movement |
| 85-100% | Extreme Wash | 100% wet signal, ultra-bright, extreme modulation wobble |

This approach provides a musical, artifact-free reverb control that ranges from completely dry to an extreme wash effect without any clicking, popping, or pitch artifacts.