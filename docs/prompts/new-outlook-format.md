# New Outlook Format Prompt

The SPC (Storm Prediction Center) is updating their outlook format on March 2nd, 2026. This means that the way that outlooks are now is changing. We've based our oulook creator around the current format, so we will need to update it to match the new format.

## OUTLOOK BUG TO FIX: HATCHING
- There is a bug in the current outlook creator where when adding hatching to polygons it only makes the hatching and not the fill color.

## OUTLOOK BUG TO FIX: PROBABILITY TO CATEGORICAL CONVERSION
- There is a bug in the current outlook creator where when converting from probability outlooks to categorical layers. Right now the layer on the categorical layer is just white which means that it is being shown as an invalid layer and isn't being categorized correctly. We need to fix this bug so that the conversion logic works correctly and shows the correct categorical layer based on the probability layer.

## NEW FEATURE REQUEST: HATCHING SEPERATE FROM FILL COLOR
- We need to make hatching be it's own layer that is seperate from the fill color so that we can have an overarching hatching layer that goes across fill colors and isn't stuck attached to one fill color layer. This will allow us to have multiple hatching styles on top of different fill colors, and have 1 hatching layer that goes across all fill colors instead of hatching per fill color layer.
- We will need to update the categorical conversion logic to be able to detect where the hatching is to apply the categorical conversion logic correctly.
- We will need to update the detection logic to be able to differentiate between different hatching styles to apply the correct categorical conversion logic.
- We should keep the old outlook style with any new outlook bug fixes as a "Legacy Mode" option for users who want to keep using the old format.

## FUNCTIONALITY CHANGE:
- Make it so that the user cannot add a categorical outlook where there is supposed to be a conversion from a probability outlook.
    - The exception to this is the TSTM (General Thunderstorm) which is only drawn on the categorical layer and does not convert from probabilities.
    - MRGL, SLGT, ENH, MDT, HIGH should all be conversions from the probability outlooks like the current logic supports.

## New Format Details

The New Outlook overhauls probabilities and introduces new hatching styles:

- **Overall Changes**
    - New triple hatching system for probabilities (CIG)
        - CIG 0: No hatching
        - CIG 1: Old Hatching Style
            - Top right to bottom left broken diagonal lines
                - Broken meaning gaps, similar to dashes
        - CIG 2: *new*
            - Design: Diagonal Line from Top-Left to Bottom-Right
                - Solid lines, no gaps
        - CIG 3: *new*
            - Design: Crosshatch (Both Diagonal Directions)
                - Solid lines, no gaps
                - Important Note: Don't make too dense
- **Tornado Probability Chart**
    - New Probabilities
        - 2%
            - Can have CIG 0, 1, or 2
        - 5%
            - Can have CIG 0, 1, or 2
        - 10%
            - Can have CIG 0, 1, 2, or 3
        - 15%
            - Can have CIG 0, 1, 2, or 3
        - 30%
            - Can have CIG 0, 1, 2, or 3
        - 45%
            - Can have CIG 0, 1, 2, or 3
        - 60%
            - Can have CIG 0, 1, 2, or 3
    - Probability to Categorical Mapping Changes
        - MRGL (Marginal)
            - 2%: CIG 0 or 1
        - SLGT (Slight)
            - 2%: CIG 2
            - 5%: CIG 0, 1
            - 10%: CIG 0
        - ENH (Enhanced)
            - 5%: CIG 2
            - 10%: CIG 1, 2, 3
            - 15%: CIG 0, 1
            - 30%: CIG 0
            - 45%: CIG 0
            - 60%: CIG 0
        - MDT (Moderate)
            - 15%: CIG 2, 3
            - 30%: CIG 1
            - 45%: CIG 1
        - HIGH (High)
            - 30%: CIG 2, 3
            - 45%: CIG 2, 3
            - 60%: CIG 1, 2, 3
- **Wind Probability Chart**
    - New Probabilities
        - 5%
            - Can have CIG 0, 1, or 2
        - 15%
            - Can have CIG 0, 1, 2
        - 30%
            - Can have CIG 0, 1, 2
        - 45%
            - Can have CIG 0, 1, 2, or 3
        - 60%
            - Can have CIG 0, 1, 2, or 3
        - 75%
            - Can have CIG 0, 1, 2, or 3
        - 90%
            - Can have CIG 0, 1, 2, or 3
    - Probability to Categorical Mapping Changes
        - MRGL (Marginal)
            - 5%: CIG 0 or 1
        - SLGT (Slight)
            - 5%: CIG 2
            - 15%: CIG 0, 1
            - 30%: CIG 0
        - ENH (Enhanced)
            - 15%: CIG 2
            - 30%: CIG 1, 2
            - 45%: CIG 0, 1
            - 60%: CIG 0
            - 75%: CIG 0
            - 90%: CIG 0
        - MDT (Moderate)
            - 45%: CIG 2
            - 60%: CIG 1
            - 75%: CIG 1
            - 90%: CIG 1
        - HIGH (High)
            - 45%: CIG 3
            - 60%: CIG 2, 3
            - 75%: CIG 2, 3
            - 90%: CIG 2, 3
- **Hail Probability Chart**
    - New Probabilities
        - 5%
            - Can have CIG 0, 1, or 2
        - 15%
            - Can have CIG 0, 1, 2
        - 30%
            - Can have CIG 0, 1, 2
        - 45%
            - Can have CIG 0, 1, 2
        - 60%
            - Can have CIG 0, 1, 2
    - Probability to Categorical Mapping Changes
        - MRGL (Marginal)
            - 5%: CIG 0 or 1
        - SLGT (Slight)
            - 5%: CIG 2
            - 15%: CIG 0, 1
            - 30%: CIG 0
        - ENH (Enhanced)
            - 15%: CIG 2
            - 30%: CIG 1, 2
            - 45%: CIG 0, 1
            - 60%: CIG 0
        - MDT (Moderate)
            - 45%: CIG 2
            - 60%: CIG 1, 2

