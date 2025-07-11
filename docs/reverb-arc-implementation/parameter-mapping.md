# Reverb Parameter Mapping Reference

## Arc Value to Reverb Space Mapping

This document provides the exact parameter values for each range of the Arc reverb control.

### Zone 1: Nearly Dry (0-5%)
**Arc Value**: 0.00 - 0.05  
**Description**: "Dry Studio"  
**Character**: Just a hint of space, barely noticeable

| Parameter | Start (0%) | End (5%) | Notes |
|-----------|------------|----------|--------|
| mix | 0.00 | 0.20 | Linear increase |
| roomSize | 0.10 | 0.10 | Fixed tiny size |
| decay | 0.10 | 0.10 | Very short tail |
| damping | 0.90 | 0.90 | Heavily damped |
| preDelay | 0ms | 0ms | No pre-delay |
| diffusion | 0.30 | 0.30 | Low density |
| modulation | 0.05 | 0.05 | Minimal movement |
| earlyLevel | 0.90 | 0.90 | Mostly early reflections |

### Zone 2: Small Room (5-25%)
**Arc Value**: 0.05 - 0.25  
**Description**: "Small Room"  
**Character**: Intimate, warm, close space

| Parameter | Start (5%) | End (25%) | Formula |
|-----------|------------|-----------|----------|
| mix | 0.20 | 0.35 | 0.2 + local * 0.15 |
| roomSize | 0.10 | 0.30 | 0.1 + local * 0.2 |
| decay | 0.10 | 0.40 | 0.1 + local * 0.3 |
| damping | 0.90 | 0.60 | 0.9 - local * 0.3 |
| preDelay | 0ms | 10ms | local * 10 |
| diffusion | 0.30 | 0.60 | 0.3 + local * 0.3 |
| modulation | 0.05 | 0.15 | 0.05 + local * 0.1 |
| earlyLevel | 0.90 | 0.60 | 0.9 - local * 0.3 |

*Note: `local = (position - 0.05) / 0.2`*

### Zone 3: Chamber/Studio (25-50%)
**Arc Value**: 0.25 - 0.50  
**Description**: "Chamber"  
**Character**: Professional studio or chamber music space

| Parameter | Start (25%) | End (50%) | Formula |
|-----------|-------------|-----------|----------|
| mix | 0.35 | 0.45 | 0.35 + local * 0.1 |
| roomSize | 0.30 | 0.55 | 0.3 + local * 0.25 |
| decay | 0.40 | 0.60 | 0.4 + local * 0.2 |
| damping | 0.60 | 0.45 | 0.6 - local * 0.15 |
| preDelay | 10ms | 25ms | 10 + local * 15 |
| diffusion | 0.60 | 0.75 | 0.6 + local * 0.15 |
| modulation | 0.15 | 0.20 | 0.15 + local * 0.05 |
| earlyLevel | 0.60 | 0.45 | 0.6 - local * 0.15 |

*Note: `local = (position - 0.25) / 0.25`*

### Zone 4: Concert Hall (50-75%)
**Arc Value**: 0.50 - 0.75  
**Description**: "Concert Hall"  
**Character**: Large performance space with rich acoustics

| Parameter | Start (50%) | End (75%) | Formula |
|-----------|-------------|-----------|----------|
| mix | 0.45 | 0.55 | 0.45 + local * 0.1 |
| roomSize | 0.55 | 0.75 | 0.55 + local * 0.2 |
| decay | 0.60 | 0.70 | 0.6 + local * 0.1 |
| damping | 0.45 | 0.35 | 0.45 - local * 0.1 |
| preDelay | 25ms | 35ms | 25 + local * 10 |
| diffusion | 0.75 | 0.85 | 0.75 + local * 0.1 |
| modulation | 0.20 | 0.25 | 0.2 + local * 0.05 |
| earlyLevel | 0.45 | 0.35 | 0.45 - local * 0.1 |

*Note: `local = (position - 0.5) / 0.25`*

### Zone 5: Cathedral (75-90%)
**Arc Value**: 0.75 - 0.90  
**Description**: "Cathedral"  
**Character**: Massive space with long, ethereal decay

| Parameter | Start (75%) | End (90%) | Formula |
|-----------|-------------|-----------|----------|
| mix | 0.55 | 0.70 | 0.55 + local * 0.15 |
| roomSize | 0.75 | 0.85 | 0.75 + local * 0.1 |
| decay | 0.70 | 0.80 | 0.7 + local * 0.1 |
| damping | 0.35 | 0.30 | 0.35 - local * 0.05 |
| preDelay | 35ms | 45ms | 35 + local * 10 |
| diffusion | 0.85 | 0.90 | 0.85 + local * 0.05 |
| modulation | 0.25 | 0.35 | 0.25 + local * 0.1 |
| earlyLevel | 0.35 | 0.25 | 0.35 - local * 0.1 |

*Note: `local = (position - 0.75) / 0.15`*

### Zone 6: Infinite Space (90-100%)
**Arc Value**: 0.90 - 1.00  
**Description**: "Infinite Space"  
**Character**: Extreme wash, almost drowning the dry signal

| Parameter | Start (90%) | End (100%) | Formula |
|-----------|-------------|------------|----------|
| mix | 0.70 | 0.85 | 0.7 + local * 0.15 |
| roomSize | 0.85 | 0.90 | 0.85 + local * 0.05 |
| decay | 0.80 | 0.85 | 0.8 + local * 0.05 |
| damping | 0.30 | 0.15 | 0.3 - local * 0.15 |
| preDelay | 45ms | 70ms | 45 + local * 25 |
| diffusion | 0.90 | 0.90 | Fixed at 0.9 |
| modulation | 0.35 | 0.50 | 0.35 + local * 0.15 |
| earlyLevel | 0.25 | 0.10 | 0.25 - local * 0.15 |

*Note: `local = (position - 0.9) / 0.1`*

## Key Design Decisions

### Non-Linear Scaling
The Arc value is transformed using `position = Math.pow(arcValue, 1.2)` to provide:
- More resolution in the lower range (small rooms)
- Compressed range for extreme settings
- Natural feeling progression

### Mix Philosophy
- Mix reaches up to 85% for extreme wash effects
- Gradual increase through zones for natural progression
- Final zone creates an almost overwhelming reverb wash
- Decay is capped at 0.85 to prevent runaway feedback

### Correlated Parameters
As the space gets larger:
- **Decay** increases (longer reverb tails, capped at 0.85 to prevent feedback)
- **Damping** decreases (brighter reverb, down to 0.15 for ethereal brightness)
- **Pre-delay** increases (larger spaces have longer initial reflection times)
- **Diffusion** increases (more complex reflections)
- **Early reflections** decrease (less prominent in large spaces)
- **Modulation** increases significantly in extreme zone (creates unstable, ethereal character)

### Tonal Color
- Small spaces: Bright (damping 0.9 → 0.6)
- Medium spaces: Balanced (damping 0.6 → 0.45)
- Large spaces: Darker (damping 0.45 → 0.25)

This creates natural-sounding spaces where small rooms are more present and larger spaces are more diffuse and distant.

## Testing Values

For testing specific positions:

| Arc % | Description | Mix | Size | Decay |
|-------|-------------|-----|------|-------|
| 0% | Completely dry | 0.00 | 0.10 | 0.10 |
| 2.5% | Hint of space | 0.10 | 0.10 | 0.10 |
| 10% | Small room | 0.26 | 0.18 | 0.23 |
| 25% | Room/chamber boundary | 0.35 | 0.30 | 0.40 |
| 37.5% | Studio space | 0.40 | 0.43 | 0.50 |
| 50% | Chamber/hall boundary | 0.45 | 0.55 | 0.60 |
| 62.5% | Medium hall | 0.48 | 0.65 | 0.68 |
| 75% | Hall/cathedral boundary | 0.55 | 0.75 | 0.70 |
| 87.5% | Large cathedral | 0.66 | 0.82 | 0.77 |
| 90% | Cathedral/infinite boundary | 0.70 | 0.85 | 0.80 |
| 95% | Deep infinite space | 0.78 | 0.88 | 0.83 |
| 100% | Maximum infinite wash | 0.85 | 0.90 | 0.85 |