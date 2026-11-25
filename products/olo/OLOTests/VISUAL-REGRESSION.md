# Fluid visual regression

The HTML reference is the approved browser prototype, independent of the production Swift renderer. Open it in a browser to preview. The simulator test renders fixed frames at 2x, compares RGB differences normalized by reference ink and total ink coverage, and attaches both images on failure. Calibrated tolerances (5% normalized difference, 0.5% coverage deviation) allow rasterizer differences; they are not a claim of pixel identity. Do not update the reference to silence regressions. Run OLOTests/EncounterFluidVisualTests via Xcode or the OLO iOS validation workflow. This tests the production drawing surface, not full-screen layout or real-time frame rate.

## Orientation coverage and metrics

Four sizes (390×844, 844×390, 430×932, 932×430) at four phases give 16 distinct comparisons. Each portrait size is rendered again after its landscape counterpart (24 comparisons total), with exact native pixel equality required at the same phase. This checks deterministic resize rendering, not live rotation or audio continuity. Dimensions are asserted independently. Every comparison prints OLO_VISUAL_METRIC and the test retains a metrics attachment. Keep calibrated thresholds unchanged. The browser animation avoids PNG encoding during preview; its drawing formula follows approved design revisions.

## Approved portrait amplitude revision

Use min(width,height) for displacement only; center remains height/2. Landscape is unchanged. Portrait amplitude is approximately 46% of the previous value on the tested phone sizes. The user requested this design change; update the independent HTML reference accordingly. RGB threshold 5%, ink coverage deviation 0.5%, validated by PR #90.

## Approved portrait amplitude 40% revision

Portrait displacement is 40% of the PR #90 short-edge baseline; landscape and square frames retain the baseline. Center, phase, color, line width and layer count are unchanged. Update the independent reference for this explicitly approved design revision only. Keep all 24 comparisons and existing thresholds.
