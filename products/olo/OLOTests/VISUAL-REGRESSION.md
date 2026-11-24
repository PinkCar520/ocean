# Fluid visual regression

The HTML reference is the approved browser prototype, independent of the production Swift renderer. Open it in a browser to preview. The simulator test renders fixed frames at 2x, compares RGB differences normalized by reference ink and total ink coverage, and attaches both images on failure. Initial tolerances (35% normalized difference, 15% coverage) allow rasterizer differences; they are not a claim of pixel identity and must be calibrated with actual CI results. Do not update the reference to silence regressions. Run OLOTests/EncounterFluidVisualTests via Xcode or the OLO iOS validation workflow. This tests the production drawing surface, not full-screen layout or real-time frame rate.

## Orientation coverage and metrics

Four sizes (390×844, 844×390, 430×932, 932×430) at four phases give 16 distinct comparisons. Each portrait size is rendered again after its landscape counterpart (24 comparisons total), with exact native pixel equality required at the same phase. This checks deterministic resize rendering, not live rotation or audio continuity. Dimensions are asserted independently. Every comparison prints OLO_VISUAL_METRIC and the test retains a metrics attachment. Keep initial thresholds until measured CI values justify calibration. The browser animation avoids PNG encoding during preview; its drawing formula is unchanged.
