# OLO Ambient Eye · Rive PoC

This PR wires the Rive Apple runtime into the iOS OLO target and adds an **Eye-only** adapter. The existing SwiftUI Eye is the default until a real animation resource is supplied.

## Asset required (not included)

Export `olo_ambient_eye.riv` from Rive and add it to the **OLO iOS target's Copy Bundle Resources**. The file must contain a state machine named `AmbientEye`.

Artboard: transparent **205 × 205**. Preserve the existing Ambient Eye position, rotated outer oval, soft radial gradient, and luminous core. The artboard must not contain the black sphere, camera dot, or mouth ribbon. Those remain native.

The native implementation is automatically used when the asset is missing or the Rive module is unavailable. Runtime fallback on a **corrupt or incompatible** .riv asset is not yet implemented; do not ship unvalidated assets.

## Next implementation step

Bind the exported Rive view-model properties (`lookX`, `lookY`, `focus`, `mode`) to `OLOCenter` and the existing drag gesture after the resource schema is confirmed. The current adapter only plays the state machine: it does **not** yet synchronize gaze or conversation state. Compare the result against the SwiftUI Eye and test privacy, Reduce Motion, voice, and 60 fps on device.

## Validation status

No .riv asset is committed; Xcode build, package resolution, runtime rendering, and device performance have not been run in this GitHub-only environment. Keep this PR unmerged until CI/Xcode confirms the chosen runtime version and asset compatibility.
