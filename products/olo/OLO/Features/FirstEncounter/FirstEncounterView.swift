import SwiftUI
import FoundationModels
import UIKit

/// Neutral initialization surface, distinct from the personal agent.
struct FirstEncounterView: View {
    @Environment(OLOCenter.self) private var center
    @Bindable var session: FirstEncounterSession
    @State private var answer = ""
    @State private var speech = OLOSpeechResponder()
    @State private var greeted = false
    @State private var naming = false
    @State private var greetingFinished = false
    @State private var voice = AVVoiceService()
    @State private var listening = false
    @State private var microphoneLevel: Float = 0
    @State private var speaking = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var voiceError: String?
    @State private var waiting = false
    @State private var permissionBlocked = false
    @State private var retryCount = 0
    @State private var recognition: Task<Void, Never>?

    private let accent = SwiftUI.Color(.sRGB, red: 244.0 / 255.0, green: 125.0 / 255.0, blue: 53.0 / 255.0, opacity: 1)

    var body: some View {
        ZStack {
            SwiftUI.Color.white.ignoresSafeArea()
            if case .question(let index) = session.phase {
                waveform
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
                if waiting && !permissionBlocked {
                    Button {
                        retryCount = 0
                        ask(index)
                    } label: {
                        SwiftUI.Color.clear.contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .ignoresSafeArea()
                    .accessibilityLabel("轻触恢复语音")
                }
            }
            VStack(spacing: 26) {
                Spacer()
                if case .question = session.phase {
                    if permissionBlocked {
                        Text("请在系统设置中允许麦克风和语音识别。")
                            .font(.footnote).foregroundStyle(SwiftUI.Color.black.opacity(0.7))
                            .padding(.horizontal, 24)
                        Button("打开设置") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                } else if session.phase == .awakening {
                    OLOEntityView(audioLevel: 0, isResponding: greeted && !greetingFinished)
                        .frame(height: 240)
                        .transition(.opacity)
                    if naming { ProgressView().tint(accent) }
                    if greetingFinished, session.errorMessage != nil {
                        Button("重试保存") { completeEncounter() }
                    }
                }
                if let error = session.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.orange)
                }
                Spacer()
            }
            .padding(.vertical, 24)
        }
        .preferredColorScheme(.light)
        .tint(accent)
        .animation(.easeInOut(duration: 0.6), value: session.phase)
        .onChange(of: session.phase) { _, _ in answer = ""; voiceError = nil; retryCount = 0; waiting = false }
        .task(id: session.currentQuestion) {
            if case .question(let index) = session.phase { ask(index) }
        }
        .task(id: session.phase == .awakening) {
            guard session.phase == .awakening, !greeted else { return }
            naming = true
            let store = OLOIdentityStore()
            if let existing = store.load() {
                center.identity = existing
            } else {
                var name: String?
                if SystemLanguageModel.default.isAvailable {
                    let model = LanguageModelSession(instructions: "Choose a short personal name for yourself, distinct from OLO. Return only the name, no explanation.")
                    if let response = try? await model.respond(to: "Choose your own name.") {
                        let candidate = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
                        if (1...24).contains(candidate.count),
                           candidate.allSatisfy({ $0.isLetter || $0 == " " }),
                           candidate.lowercased() != "olo" {
                            name = candidate
                        }
                    }
                }
                guard !Task.isCancelled else { naming = false; return }
                center.identity = store.loadOrCreate(name: name)
            }
            naming = false
            greeted = true
            speech.say("你好。", voiceChoice: session.voiceChoice) {
                greetingFinished = true
                completeEncounter()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                speech.stop()
                recognition?.cancel()
                voice.setLevelHandler(nil)
                Task { await voice.stop() }
                speaking = false
                waiting = true
            } else if phase == .active, waiting, case .question(let index) = session.phase {
                permissionBlocked = false
                retryCount = 0
                ask(index)
            }
        }
        .onDisappear { speech.stop(); recognition?.cancel(); voice.setLevelHandler(nil); Task { await voice.stop() } }
    }

    private func ask(_ index: Int) {
        guard session.phase == .question(index), !listening, !speaking, scenePhase == .active,
              let question = session.currentQuestion else { return }
        voiceError = nil
        waiting = false
        speaking = true
        recognition = Task {
            let authorization = await voice.requestAuthorization()
            guard !Task.isCancelled, session.phase == .question(index) else {
                speaking = false
                return
            }
            guard authorization == .granted else {
                speaking = false
                permissionBlocked = true
                waiting = true
                speech.say("请允许麦克风和语音识别权限。") {}
                return
            }
            permissionBlocked = false
            // System permission alerts can temporarily make the scene inactive.
            // Resume on activation rather than speaking behind an alert.
            guard scenePhase == .active else {
                speaking = false
                waiting = true
                return
            }
            speech.say(question) {
                speaking = false
                guard session.phase == .question(index), scenePhase == .active else { return }
                listen(index)
            }
        }
    }

    private func listen(_ index: Int) {
        speech.stop()
        listening = true
        voiceError = nil
        voice.setLevelHandler { level in
            Task { @MainActor in microphoneLevel = level }
        }
        recognition = Task {
            defer { listening = false; microphoneLevel = 0; voice.setLevelHandler(nil) }
            do {
                let stream = try await voice.start()
                for try await fragment in stream {
                    try Task.checkCancellation()
                    guard session.phase == .question(index) else { break }
                    answer = fragment.text
                    guard fragment.isFinal else { continue }
                    await voice.stop()
                    listening = false
                    guard !Task.isCancelled, session.phase == .question(index) else { return }
                    if index == 1 {
                        let text = fragment.text
                        if text.contains("男") && !text.contains("女") { session.chooseVoice(.masculine) }
                        else if text.contains("女") && !text.contains("男") { session.chooseVoice(.feminine) }
                        else { recover(index, prompt: "你希望我使用男性声音，还是女性声音？") }
                    } else if ["跳过", "不想回答", "暂时不回答"].contains(answer.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))) {
                        session.skip()
                    } else if !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        session.answer(answer)
                    } else {
                        recover(index)
                    }
                    return
                }
                await voice.stop()
                if !Task.isCancelled { recover(index) }
            } catch is CancellationError {
                await voice.stop()
            } catch VoiceError.unauthorized {
                await voice.stop()
                guard !Task.isCancelled else { return }
                permissionBlocked = true
                waiting = true
                speech.say("请允许麦克风和语音识别权限。") {}
            } catch {
                await voice.stop()
                guard !Task.isCancelled else { return }
                recover(index)
            }
        }
    }

    private func recover(_ index: Int, prompt: String = "刚才没有听清，可以再说一次吗？") {
        guard scenePhase == .active, session.phase == .question(index) else { return }
        if retryCount >= 1 {
            waiting = true
            speech.say("准备好后，轻触波形，我们继续。") {}
            return
        }
        retryCount += 1
        speaking = true
        speech.say(prompt) {
            speaking = false
            guard scenePhase == .active, session.phase == .question(index) else { return }
            listen(index)
        }
    }

    private func completeEncounter() {
        session.finishAwakening()
        if session.isFinished { center.pendingFirstConversation = true }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var waveEpoch = Date()

    private var waveform: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: reduceMotion)) { timeline in
            EncounterFluidFrame(time: reduceMotion ? 0 : timeline.date.timeIntervalSince(waveEpoch))
        }
        .accessibilityLabel(listening ? "正在聆听" : speaking ? "正在说话" : "初始化系统")
    }
}

/// Shared production and deterministic snapshot rendering surface.
struct EncounterFluidFrame: View {
    let time: TimeInterval
    private let accent = SwiftUI.Color(.sRGB, red: 244.0 / 255.0, green: 125.0 / 255.0, blue: 53.0 / 255.0, opacity: 1)

    var body: some View {
            Canvas { context, size in
                guard size.width > 0, size.height > 0 else { return }
                let t = time
                let h = size.height
                let w = size.width
                // Keep the approved prototype amplitude in every state.
                let activity = 1.0
                for j in 0..<7 {
                    var path = Path()
                    let layer = Double(j)
                    for x in stride(from: 0.0, through: Double(w), by: 2) {
                        let u = x / Double(w)
                        let envelope = 0.12 + 0.88 * pow(max(0, sin(u * .pi)), 1.4)
                        let displacement = sin(u * 9 + t * 1.4 + layer * 0.23) * Double(h) * 0.16
                            + cos(u * 12 - t * 0.8 + layer * 0.37) * Double(h) * 0.07
                        let point = CGPoint(x: x, y: Double(h) / 2 + envelope * displacement * activity)
                        if x == 0 { path.move(to: point) } else { path.addLine(to: point) }
                    }
                    context.stroke(path, with: .color(accent
                        .opacity(0.2 + layer * 0.09)), style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                }
            }
        .background(SwiftUI.Color.white)
    }
}
