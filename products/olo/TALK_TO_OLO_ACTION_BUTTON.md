# Talk to OLO · iOS system entry

## What is implemented

- App Intent and App Shortcut named **Talk to OLO**
- WidgetKit **ControlWidgetButton** in a dedicated `OLOControls` extension target
- Xcode target registration, embedding and target dependency
- Foreground voice launch request delivered to the existing `HomeView.startConversation()` lifecycle
- Cold-start wait for `RootShell` to initialize `AVVoiceService`
- Existing privacy and microphone authorization checks remain in `HomeView`

## Configure

Install the OLO app on a supported iPhone. In Settings > Action Button > Controls choose **Talk to OLO**. It should also be discoverable in Control Center's controls gallery. Siri / Shortcuts can invoke the app shortcut.

This uses the **Action Button**, not the region-restricted **Side Button Access** entitlement. No entitlement is requested for the latter.

## Acceptance tests required on a Mac with Xcode

1. Build OLO and its embedded OLOControls extension for iOS 26+.
2. Confirm **Talk to OLO** appears in Control Center and Action Button configuration.
3. Cold launch with the Action Button: OLO opens to the Voice tab and starts the normal microphone permission/listening lifecycle.
4. Warm launch: tapping the control triggers listening exactly once.
5. Privacy mode: voice capture is refused and the privacy message is shown.
6. Denied microphone permission: verify the existing voice service handles denial.
7. Confirm Shortcuts invocation and app launch from a locked device behave according to system security.
8. Verify the app intent is executed in the containing app process, not the extension process.

## Known limits

- Apple has deprecated `openAppWhenRun`; this PoC uses it to request foreground execution in the containing app and should migrate to a verified `OpenIntent` route when the app navigation handoff is tested.
- No Japan-only Side Button Access entitlement or implementation.
- No hardware OLO One audio handoff or background microphone recording.
- No macOS Xcode or iOS simulator is available in the remote GitHub editing environment; build and device acceptance remain unverified.
