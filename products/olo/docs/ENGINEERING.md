# OLO engineering guide

This is the shared implementation standard for humans and coding agents working on the OLO iOS and watchOS apps.

## Product integrity

- A prototype describes intended behavior and appearance. It is not executable truth and cannot override a direct user request.
- Keep demos visibly labeled as demos. Never return a timed or hard-coded success result for an operation that did not happen.
- Model agent work as a lifecycle: request, interpretation, confirmation when required, execution, verification, persisted result, and user-visible outcome.
- Persist enough failure information to explain what happened and allow a safe retry. Do not convert an error into a completed state.

## Architecture

- `OLO/Core` contains platform-independent models, protocols, and business rules. It must not depend on SwiftUI or concrete Apple service implementations.
- `OLO/Services` contains adapters for Apple frameworks and external services.
- `OLO/Persistence` owns SwiftData models and container setup. Do not expose persistence models as the domain API when a Core model is appropriate.
- `OLO/Features` owns SwiftUI screens and feature-local presentation logic. Views call services through the app composition layer and do not configure system frameworks directly.
- `OLO/App` owns dependency construction, navigation, and application-wide state.
- Keep watchOS behavior behind the same Core contracts where possible. Do not copy iOS service logic into the watch target.

## Swift and SwiftUI

- Use Swift 6 concurrency rules. New mutable shared state must have explicit ownership through `@MainActor`, an actor, or a lock-protected `Sendable` boundary.
- Keep SwiftUI and observable UI state on `@MainActor`. Do not perform blocking I/O, CPU-heavy work, or waits on the main actor.
- Prefer structured concurrency and cancellation propagation. Store unstructured tasks only when lifecycle cancellation is explicit.
- Avoid `Task.detached` unless the work truly has no actor, priority, task-local, or cancellation relationship with its caller.
- Prefer small views and extracted domain operations over large view methods. User-facing strings should be ready for localization.
- Avoid force unwraps and `try!` in application paths. Handle unknown enum cases from system frameworks.

### System presentations and Liquid Glass

- Prefer native SwiftUI presentation and navigation structures such as `sheet`, `popover`, `alert`, `confirmationDialog`, `NavigationStack`, `Form`, and `toolbar`. On iOS 26 and later, let these system components provide Liquid Glass automatically.
- Do not recreate a system sheet as a material card inside `.sheet`, add a manual grabber, or override `presentationBackground` unless an approved product requirement needs a custom presentation.
- Put modal cancellation and confirmation actions in standard `cancellationAction` and `confirmationAction` toolbar placements. When the product calls for icon-only actions, use SF Symbols with localized accessibility labels and preserve disabled, loading, cancellation, and duplicate-submission behavior.
- Treat exact requested control content and placement—such as icon versus text and leading versus trailing—as acceptance criteria. Verify the rendered presentation in addition to compiling it.

## Framework callback boundary

Core Audio, Speech, notification, and other Apple frameworks may invoke callbacks on private or real-time queues.

- Framework callbacks must not access actor-isolated state from the wrong executor. Non-realtime callbacks may explicitly hop to the owning actor; realtime audio callbacks use a bounded session-local bridge.
- Give callback factories explicit nonisolated ownership; file scope alone is insufficient when default actor isolation changes. Use `@Sendable` and document synchronization invariants for `@unchecked Sendable` types.
- Pass callback data through a small thread-safe gateway or `AsyncStream`. Consume the stream on the intended actor.
- Keep real-time audio callbacks bounded: no UI mutation, task creation, logging loops, allocation-heavy transforms, or synchronous main-queue dispatch.
- Make start and stop idempotent. Remove taps, finish audio input, cancel recognition, deactivate the audio session, finish streams, and return state to idle on every exit path.
- Do not rely on a successful build to validate callback queue correctness. Run with the debugger and inspect Runtime Issues for `dispatch_assert_queue_fail` and actor-isolation failures.

## Permissions and privacy

- Add a clear purpose string for every protected resource in `Info.plist`. A purpose string does not grant access.
- Read the current permission state before requesting. Request access in response to a user action and only when the feature is about to use it.
- Microphone recording and speech recognition are separate permissions. Require both before starting a speech session.
- Handle `notDetermined`, granted, denied, restricted, and unknown states explicitly. A denied state must provide a useful route to Settings; repeated API calls will not show the system prompt again.
- Do not start or configure capture as if it were active until microphone permission is granted. Stop active capture immediately when privacy mode is enabled.
- Test permission flows after resetting privacy permissions or reinstalling the app. Test first request, partial grant, denial, Settings changes, background interruption, and retry.

## Model and Agent boundaries

- Model output is untrusted input. Parse it into a constrained domain type, validate tool identifiers and arguments, and apply trust policy in the runtime before any side effect.
- Models may propose plans; only registered tools execute actions. A model must never grant itself confirmation, authentication, or a capability that the runtime did not expose.
- Check on-device model availability, language support, cancellation, timeout, refusal, and malformed-output paths. Make fallback behavior visible; do not describe deterministic rules as model intelligence.
- Never embed or collect a provider API key in the iOS client. Cloud model requests go through an OLO-owned backend that stores credentials and enforces schemas, tool allowlists, rate limits, and audit records.
- Follow-up answers for missing information must refine the existing task and preserve its identity. Do not represent a clarification as a second independent task.
- Route every side effect through the registered Tool, Trust Policy, and Verification boundaries. Feature-specific views must not execute system adapters directly.

## Xcode project ownership

- `project.yml` is the source of truth for generated project structure and shared build settings.
- After adding, moving, or deleting source files, run `xcodegen generate` and review the generated target membership.
- Do not commit build output, DerivedData, user breakpoints, or `xcuserdata`.
- Keep signing identities and developer-specific settings out of shared project files.

## Validation

Use the narrowest relevant checks first, then the full affected target:

```sh
xcodegen generate
xcodebuild -project OLO.xcodeproj -scheme OLO -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project OLO.xcodeproj -scheme OLO -configuration Debug \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

For concurrency-sensitive changes, also build with complete checking before merging:

```sh
xcodebuild -project OLO.xcodeproj -scheme OLO -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO \
  SWIFT_STRICT_CONCURRENCY=complete build
```

Add focused tests for parsers, scheduling rules, permission-state mapping, persistence conversions, and agent lifecycle transitions when a test target exists. UI gestures and system permission sheets require simulator or device checks rather than implementation-mirroring unit tests.

## Review checklist

- Does the feature perform a real, verifiable operation?
- Can repeated taps or concurrent calls create duplicate work?
- Are permission denial and Settings changes reflected without relaunching?
- Can cancellation or interruption leave a microphone, task, stream, tap, or audio session active?
- Does any framework callback inherit actor isolation accidentally?
- Are new files included in the correct app and watch targets?
- Were the reported validation steps actually run?
- Do sheets and modal actions use the requested native presentation, icon/text form, and toolbar placement without redundant custom controls?

## Official references

- OpenAI model guidance on clear, non-conflicting repository instructions: https://developers.openai.com/api/docs/guides/latest-model
- Claude Code project memory and imports: https://docs.anthropic.com/zh-CN/docs/claude-code/memory
- Apple MainActor documentation: https://developer.apple.com/documentation/swift/mainactor
- Apple, “Embracing Swift concurrency”: https://developer.apple.com/videos/play/wwdc2025/268/
- Apple microphone authorization: https://developer.apple.com/documentation/avfaudio/avaudioapplication/requestrecordpermission(completionhandler:)
- Apple speech authorization: https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition
- Apple live speech recognition: https://developer.apple.com/documentation/speech/recognizing-speech-in-live-audio
