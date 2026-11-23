import SwiftUI
#if canImport(RiveRuntime)
import RiveRuntime
#endif

/// OLO's visible presence on a body. Renders the seven `OLOState`s as
/// motion — the same identity expresses itself the same way on any body.
///
/// Phase 2 only animates state; real voice / agent wiring lands in Phase 3+.
/// The entity reads `OLOCenter.state` so any body that hosts an `OLOCenter`
/// gets the entity's behaviour for free.
struct OLOEntityView: View {
    @Environment(OLOCenter.self) private var center

    @State private var breathing = false
    @State private var pulsing = false
    @State private var flash = false
    @State private var eyeBlink = false
    @State private var eyeBlinkTask: Task<Void, Never>?
    @State private var faceYaw: Double = 0
    @State private var facePitch: Double = 0
    @State private var gazeYaw: Double = 0
    @State private var gazePitch: Double = 0
    @State private var preferRiveEye = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Real microphone amplitude, forwarded by the Voice host.
    var audioLevel: Float = 0
    var isResponding: Bool = false

    var body: some View {
        ZStack {
            orb
            spatialFace
            if !center.privacyMode { cameraDot }
        }
        .animation(.easeInOut(duration: 0.35), value: showsLuminousPresence)
        .frame(width: 205, height: 205)
        .overlay {
            Circle().stroke(borderColor, lineWidth: 7)
        }
        .shadow(color: .black.opacity(0.32), radius: 28, y: 22)
        .overlay(flashOverlay)
        .scaleEffect(currentScale)
        .offset(x: shakeOffset)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 8)
                .onChanged { value in
                    guard !center.privacyMode, !reduceMotion else { return }
                    let targetYaw = min(55, max(-55, Double(value.translation.width) * 0.55))
                    let targetPitch = min(30, max(-30, -Double(value.translation.height) * 0.4))
                    // The light core anticipates the slower face movement.
                    withAnimation(.easeOut(duration: 0.12)) {
                        gazeYaw = targetYaw
                        gazePitch = targetPitch
                    }
                    withAnimation(.spring(response: 0.48, dampingFraction: 0.82)) {
                        faceYaw = targetYaw
                        facePitch = targetPitch
                    }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.9, dampingFraction: 0.78)) {
                        faceYaw = 0
                        facePitch = 0
                        gazeYaw = 0
                        gazePitch = 0
                    }
                }
        )
        .onChange(of: center.state) { old, new in
            startAnimations(for: new)
            if old != new { blinkEye() }
        }
        .onChange(of: isResponding) { old, new in
            if old != new { blinkEye() }
        }
        .onDisappear { eyeBlinkTask?.cancel() }
        .onChange(of: center.privacyMode) { _, _ in
            withAnimation(.easeInOut(duration: 0.35)) {}
        }
        .task(id: center.state == .done) { await runDoneReset() }
        .onAppear { startAnimations(for: center.state) }
    }

    private var showsLuminousPresence: Bool {
        !center.privacyMode && (center.state == .listening || center.state == .thinking || isResponding)
    }

    // MARK: - Parts

    /// Fixed shell with a curved, independently oriented face.
    /// Face parts are projected from spherical coordinates instead of rotating
    /// one flat 205pt card. No physical shell or camera movement.
    private var spatialFace: some View {
        ZStack {
            projectedEye
            projectedMouth
        }
        .frame(width: 205, height: 205)
        .clipShape(Circle())
        .opacity(center.privacyMode ? 0 : 1)
        .accessibilityHint("拖动以预览 OLO 面部的空间转向")
    }

    private var projectedEye: some View {
        let pose = FaceProjection.project(x: -25, y: -35, yaw: faceYaw, pitch: facePitch)
        return ambientEye
            .offset(x: pose.x + 25, y: pose.y + 35)
            .rotation3DEffect(.degrees(faceYaw), axis: (x: 0, y: 1, z: 0), perspective: 0)
            .rotation3DEffect(.degrees(facePitch), axis: (x: 1, y: 0, z: 0), perspective: 0)
            .opacity(pose.visibility)
    }

    private var projectedMouth: some View {
        let pose = FaceProjection.project(x: 0, y: 64, yaw: faceYaw, pitch: facePitch)
        return Group {
            if showsLuminousPresence {
                OLOLuminousPresence(level: audioLevel, state: center.state, responding: isResponding)
                    .frame(width: 112, height: 48)
                    .transition(.opacity)
            } else {
                mouthBar
            }
        }
        .offset(x: pose.x, y: pose.y)
        .rotation3DEffect(.degrees(faceYaw), axis: (x: 0, y: 1, z: 0), perspective: 0)
        .rotation3DEffect(.degrees(facePitch), axis: (x: 1, y: 0, z: 0), perspective: 0)
        .opacity(pose.visibility)
    }

    /// Only the Eye is replaceable. The mouth and stationary outer shell stay native.
    /// Until the real artboard is exported and bundled, use the existing Eye.
    @ViewBuilder
    private var ambientEye: some View {
        #if canImport(RiveRuntime)
        if preferRiveEye, Bundle.main.url(forResource: "olo_ambient_eye", withExtension: "riv") != nil {
            OLOAnimatedRiveEye()
        } else {
            logo
        }
        #else
        logo
        #endif
    }

    private var orb: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [Color(white: 0.20), .black],
                    center: UnitPoint(x: 0.33, y: 0.22),
                    startRadius: 2,
                    endRadius: 120
                )
            )
    }

    /// Dual-layer Ambient Eye: stable soft-gray outer eye and a smaller
    /// luminous white core. Attention is expressed by light, not eyelids.
    private var logo: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
            let phase = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate * (2 * Double.pi / 3.6)
            let breath = reduceMotion ? 0 : (sin(phase) + 1) * 0.5
            let microphone = center.state == .listening
                ? min(1, max(0, Double(audioLevel))) : 0
            let thinking = center.state == .thinking

            ZStack {
                // Preserve the original soft radial-gradient outer eye.
                Ellipse()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.white.opacity(0.96),
                                Color(white: 0.88).opacity(0.80),
                                Color(white: 0.68).opacity(0.22)
                            ],
                            center: UnitPoint(x: 0.42, y: 0.38),
                            startRadius: 2,
                            endRadius: 65
                        )
                    )
                    .frame(width: 84, height: 48)

                // Inner light core: a separate, softly graduated oval.
                // Small optical shifts convey focus without distorting the eye.
                Ellipse()
                    .fill(
                        RadialGradient(
                            colors: [Color.white, Color(white: 0.97), Color(white: 0.89)],
                            center: UnitPoint(x: 0.42, y: 0.38),
                            startRadius: 1,
                            endRadius: 28
                        )
                    )
                    .frame(width: 49, height: 29)
                    .offset(
                        x: (thinking ? 3 : (reduceMotion ? 0 : CGFloat(sin(phase * 0.5)) * 1.2)) + CGFloat(gazeYaw / 55 * 4),
                        y: (thinking ? 1 : 0) - CGFloat(gazePitch / 30 * 3)
                    )
                    .opacity(min(1, 0.90 + 0.07 * breath + 0.03 * microphone))
                    .shadow(color: .white.opacity(eyeBlink ? 0.50 : 0.15), radius: eyeBlink ? 9 : 3)
                    .scaleEffect(eyeBlink ? 1.07 : 1)
                    .animation(.easeInOut(duration: 0.42), value: thinking)
                    .animation(.easeInOut(duration: 0.20), value: eyeBlink)
            }
            .rotationEffect(.degrees(-35))
            .offset(x: -25, y: -35)
            .accessibilityHidden(true)
        }
    }

    /// A brief optical glint on state changes, never a vertical squash.
    private func blinkEye() {
        guard !reduceMotion, !center.privacyMode else { return }
        eyeBlinkTask?.cancel()
        eyeBlinkTask = Task { @MainActor in
            withAnimation(.easeInOut(duration: 0.10)) { eyeBlink = true }
            try? await Task.sleep(for: .milliseconds(110))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.11)) { eyeBlink = false }
        }
    }

    private var mouthBar: some View {
        Group {
            if center.privacyMode {
                Circle()
                    .fill(Color(white: 0.6))
                    .frame(width: 12, height: 12)
            } else {
                Capsule()
                    .fill(.white)
                    .frame(width: barWidth, height: barHeight)
                    .shadow(color: .white.opacity(0.9), radius: glowRadius)
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: center.state)
        .animation(.spring(response: 0.35), value: center.privacyMode)
    }

    /// The small black dot near the top of the orb — OLO's "eye". Matches the
    /// OLO One physical prototype and is hidden in privacy mode.
    private var cameraDot: some View {
        Circle()
            .fill(Color(white: 0.02))
            .overlay(Circle().stroke(.gray.opacity(0.7), lineWidth: 1))
            .frame(width: 8, height: 8)
            .offset(y: -82)
    }

    private var flashOverlay: some View {
        Circle()
            .fill(.white)
            .opacity(flash ? 0.55 : 0)
            .allowsHitTesting(false)
    }

    // MARK: - State-driven values

    private var currentScale: CGFloat {
        let breath = (breathing && center.state == .thinking) ? 0.03 : 0
        let pulse = (pulsing && center.state == .listening) ? 0.035 : 0
        let base: CGFloat
        switch center.state {
        case .acting: base = 0.04
        case .needYou: base = 0.015
        default: base = 0
        }
        return 1.0 + base + breath + pulse
    }

    private var barWidth: CGFloat {
        switch center.state {
        case .idle, .done, .error: 30
        case .listening: 72
        case .thinking: 10
        case .needYou: 12
        case .acting: 88
        case .privacy, .powerOff: 0
        }
    }

    private var barHeight: CGFloat {
        center.state == .thinking || center.state == .needYou ? 10 : 4
    }

    private var glowRadius: CGFloat {
        center.state == .idle ? 12 : 18
    }

    private var borderColor: Color {
        center.state == .error ? Color(red: 0.85, green: 0.25, blue: 0.2) : Color(white: 0.67)
    }

    private var shakeOffset: CGFloat {
        guard center.state == .error, pulsing else { return 0 }
        return 3.0
    }

    // MARK: - Animation lifecycle

    private func startAnimations(for state: OLOState) {
        switch state {
        case .thinking:
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { breathing = true }
            pulsing = false
        case .listening:
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { pulsing = true }
            breathing = false
        case .error:
            // brief shake
            withAnimation(.easeInOut(duration: 0.05).repeatCount(6, autoreverses: true)) { pulsing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { pulsing = false }
            breathing = false
        case .done:
            breathing = false; pulsing = false
            flash = true
            withAnimation(.easeOut(duration: 0.4)) { flash = false }
        default:
            breathing = false; pulsing = false
        }
    }

    @MainActor
    private func runDoneReset() async {
        guard center.state == .done else { return }
        try? await Task.sleep(for: .seconds(1.3))
        guard center.state == .done else { return }
        withAnimation { center.state = .idle }
    }
}

/// Orthographic projection onto the visible hemisphere of a fixed orb.
/// Inputs are the original 2D facial anchor coordinates; their depth is
/// recovered from the sphere before rotating about its center.
private enum FaceProjection {
    static func project(x: Double, y: Double, yaw: Double, pitch: Double) -> (x: CGFloat, y: CGFloat, visibility: Double) {
        let radius = 98.0
        let z = sqrt(max(0, radius * radius - x * x - y * y))
        let a = yaw * .pi / 180
        let b = pitch * .pi / 180
        let rotatedX = x * cos(a) + z * sin(a)
        let rotatedZ = z * cos(a) - x * sin(a)
        let rotatedY = y * cos(b) - rotatedZ * sin(b)
        let depth = y * sin(b) + rotatedZ * cos(b)
        // Fade only as the face approaches the rear hemisphere.
        let visibility = min(1.0, max(0.0, (depth + 8) / 18))
        return (CGFloat(rotatedX), CGFloat(rotatedY), visibility)
    }
}

/// A SwiftUI Canvas light ribbon inspired by the supplied Siri interaction
/// reference. This is OLO's own rendering, not Apple's proprietary effect.
/// Lives at the entity's mouth position, replacing its static light bar during voice activity.
private struct OLOLuminousPresence: View {
    let level: Float
    let state: OLOState
    let responding: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            Canvas(opaque: false, rendersAsynchronously: true) { context, size in
                let listening = state == .listening
                let energy = listening ? min(1, max(0.06, Double(level))) : (responding ? 0.36 : 0.16)
                let centerY = size.height * 0.5
                let width = size.width
                let halfWidth = width * 0.46
                let height = 1.5 + energy * 8
                let phase = time * (listening ? 4.8 : 2.1)
                var ribbon = Path()
                for step in 0...100 {
                    let fraction = Double(step) / 100
                    let x = width * 0.5 + (fraction * 2 - 1) * halfWidth
                    let envelope = pow(max(0, 1 - pow(fraction * 2 - 1, 2)), 1.6)
                    let wave = sin(fraction * 12.5 - phase) * height * envelope
                    let secondary = sin(fraction * 6.2 + phase * 0.65) * height * 0.3 * envelope
                    let point = CGPoint(x: x, y: centerY + wave + secondary)
                    if step == 0 { ribbon.move(to: point) }
                    else { ribbon.addLine(to: point) }
                }
                let start = CGPoint(x: width * 0.06, y: centerY)
                let end = CGPoint(x: width * 0.94, y: centerY)
                context.drawLayer { glow in
                    glow.addFilter(.blur(radius: 13))
                    glow.stroke(ribbon, with: .linearGradient(
                        Gradient(colors: [.clear, Color(white: 0.62).opacity(0.6), .white, Color(white: 0.82).opacity(0.7), .clear]),
                        startPoint: start, endPoint: end
                    ), style: StrokeStyle(lineWidth: 9, lineCap: .round))
                }
                context.stroke(ribbon, with: .linearGradient(
                    Gradient(colors: [.clear, Color(white: 0.62).opacity(0.65), .white, Color(white: 0.82).opacity(0.8), .clear]),
                    startPoint: start, endPoint: end
                ), style: StrokeStyle(lineWidth: 2.5 + energy * 1.5, lineCap: .round))
                context.stroke(ribbon, with: .color(.white.opacity(0.9)),
                               style: StrokeStyle(lineWidth: 0.8, lineCap: .round))
            }
        }
        .accessibilityLabel(state == .listening ? "OLO 正在聆听" : responding ? "OLO 正在回应" : "OLO 正在思考")
        .accessibilityIdentifier("olo.entity.luminous")
        .allowsHitTesting(false)
    }
}

#if canImport(RiveRuntime)
/// Rive runtime adapter for the first Eye-only proof of concept.
/// The .riv artboard should use a transparent 205×205 canvas with the original
/// Eye anchored at (-25, -35); the surrounding sphere is never in this asset.
/// State machine: AmbientEye. Missing assets use the SwiftUI fallback above.
private struct OLOAnimatedRiveEye: View {
    @StateObject private var model = RiveViewModel(
        fileName: "olo_ambient_eye",
        stateMachineName: "AmbientEye"
    )

    var body: some View {
        model.view()
            .frame(width: 205, height: 205)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
#endif
