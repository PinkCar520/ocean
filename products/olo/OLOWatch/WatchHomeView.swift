import SwiftUI

/// The watch home — the OLO One's display, on your wrist.
///
/// Model: the watch screen IS the OLO One screen. The inside of the
/// display shows only what OLO renders — two elements only:
///   1. OLO logo — centered
///   2. Status bar — the glowing pill / dot near the bottom, whose
///      shape + size is the primary carrier of OLOState (idle, listening,
///      thinking, acting, done, privacy).
///
/// Explicitly NOT shown here because they belong to the watch's physical
/// body / outside-the-display context, not to OLO's screen:
///   • no light stage gradient, no ground ellipse shadow (we are on the
///     body, not simulating a body sitting on a desk)
///   • no repeated status text label ("待命") — the pill shape carries it
///   • no silver bezel ring (that's the watch case)
///   • no camera dot (sensors sit in the bezel, not rendered)
///
/// Gestures (matches OLO One physical prototype PRD §6.2):
///   • 轻触 (tap)        — open watchOS system dictation
///   • 长按 600ms (hold) — open dictation and recognize an intentional task
///   • 双击 (double tap) — return to standby (idle)
///
/// Privacy: on OLO One this is a physical flip. On the watch (worn on
/// wrist) there's no flip equivalent, so privacy is triggered via the
/// digital crown (scroll up) instead.
struct WatchHomeView: View {
    @Environment(WatchOLOCenter.self) private var center

    @State private var tapCount = 0
    @State private var tapDebounce: Task<Void, Never>?
    @State private var longPressFired = false
    @State private var convTask: Task<Void, Never>?
    @State private var toast = ""
    @State private var toastShown = false

    var body: some View {
        ZStack {
            // Entity fills the entire watch screen — the physical watch
            // glass is already the "orb", no need to draw another circle.
            WatchOLOEntity()
        }
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .overlay(alignment: .top) {
            if toastShown {
                Text(toast)
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.12), in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.18)))
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .simultaneousGesture(
            // Hold ≈600ms → real system dictation → intent recognition.
            LongPressGesture(minimumDuration: 0.6)
                .onEnded { _ in
                    longPressFired = true
                    tapDebounce?.cancel()
                    tapCount = 0
                    startConversation()
                }
        )
        .highPriorityGesture(
            TapGesture(count: 2)
                .onEnded { standby() }
        )
        .highPriorityGesture(
            TapGesture(count: 1)
                .onEnded { enqueueSingleTap() }
        )
        // Privacy: swipe up = flip equivalent on the wrist.
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    if value.translation.height < -20 {
                        togglePrivacy()
                    }
                }
        )
    }

    // MARK: - Toast

    @MainActor
    private func showToast(_ text: String) {
        toast = text
        withAnimation(.easeOut(duration: 0.18)) { toastShown = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.easeIn(duration: 0.2)) { toastShown = false }
        }
    }

    // MARK: - Gesture dispatch

    /// Disambiguate single- vs double-tap (350 ms debounce).
    @MainActor
    private func enqueueSingleTap() {
        guard !longPressFired else { longPressFired = false; return }
        tapCount += 1
        tapDebounce?.cancel()
        tapDebounce = Task {
            try? await Task.sleep(until: .now + .milliseconds(350), clock: .continuous)
            if Task.isCancelled { return }
            let count = tapCount
            tapCount = 0
            if count == 1 { startConversation() }
        }
    }

    /// Tap or hold opens watchOS system dictation and receives recognized text.
    @MainActor
    private func startConversation() {
        guard center.state == .idle || center.state == .done else { return }
        convTask?.cancel()

        guard let voice = center.voice else {
            center.setState(.error)
            showToast("系统听写不可用")
            return
        }

        showToast("OLO 正在听")
        center.setState(.listening)
        convTask = Task { @MainActor in
            do {
                let stream = try await voice.start()
                var recognized = ""
                for try await transcript in stream {
                    recognized = transcript.text
                    if transcript.isFinal { break }
                }
                await voice.stop()
                guard !recognized.isEmpty else {
                    center.setState(.idle)
                    return
                }
                center.setState(.thinking)
                if WakeVoiceIntent.matches(recognized) {
                    center.setState(.needYou)
                    showToast("已识别起床意图 · 共享计划待同步")
                } else {
                    center.setState(.done)
                    showToast("已识别：\(recognized)")
                }
            } catch {
                await voice.stop()
                center.setState(.error)
                showToast("没听清，再试一次")
                try? await Task.sleep(for: .seconds(1.5))
                if Task.isCancelled { return }
                center.setState(.idle)
            }
        }
    }


    /// Double-tap — return to standby (matches iOS + PRD §6.2).
    @MainActor
    private func standby() {
        convTask?.cancel()
        tapDebounce?.cancel(); tapCount = 0
        center.setState(.idle)
        showToast("已回到待机")
    }

    /// Swipe up — flip privacy mode (watch has no physical flip).
    @MainActor
    private func togglePrivacy() {
        convTask?.cancel()
        tapDebounce?.cancel(); tapCount = 0
        withAnimation(.easeInOut(duration: 0.35)) {
            center.privacyMode.toggle()
        }
        center.setState(center.privacyMode ? .privacy : .idle)
        showToast(center.privacyMode ? "视觉感知已关闭" : "隐私模式已关闭")
    }

}

#Preview {
    WatchHomeView()
        .environment(WatchOLOCenter(voice: nil))
}
