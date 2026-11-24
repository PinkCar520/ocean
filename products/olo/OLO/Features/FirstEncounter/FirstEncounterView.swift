import SwiftUI
import FoundationModels

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
    @State private var recognition: Task<Void, Never>?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 26) {
                Spacer()
                if case .question(let index) = session.phase {
                    waveform
                    if let voiceError {
                        Text(voiceError)
                            .font(.footnote)
                            .foregroundStyle(.orange)
                        Button("重试语音") { ask(index) }
                            .disabled(listening)
                    }
                } else if session.phase == .awakening {
                    OLOEntityView(audioLevel: 0, isResponding: greeted && !greetingFinished)
                        .frame(height: 240)
                        .transition(.opacity)
                    if naming { ProgressView().tint(.white) }
                    if greetingFinished, session.errorMessage != nil {
                        Button("重试保存") { completeEncounter() }
                    }
                }
                if let error = session.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.orange)
                }
                Spacer()
            }
            .padding(24)
        }
        .animation(.easeInOut(duration: 0.6), value: session.phase)
        .onChange(of: session.phase) { _, _ in answer = ""; voiceError = nil }
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
                voiceError = "语音已暂停，请重试。"
            }
        }
        .onDisappear { speech.stop(); recognition?.cancel(); voice.setLevelHandler(nil); Task { await voice.stop() } }
    }

    private func ask(_ index: Int) {
        guard session.phase == .question(index), !listening,
              let question = session.currentQuestion else { return }
        voiceError = nil
        speaking = true
        speech.say(question) {
            speaking = false
            guard session.phase == .question(index), scenePhase == .active else { return }
            listen(index)
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
                        else { voiceError = "请选择男性或女性声音。" }
                    } else if ["跳过", "不想回答", "暂时不回答"].contains(answer.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))) {
                        session.skip()
                    } else if !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        session.answer(answer)
                    } else {
                        voiceError = "没有听清，请重新回答。"
                    }
                    return
                }
                await voice.stop()
                if !Task.isCancelled { voiceError = "没有收到完整回答，请重试。" }
            } catch is CancellationError {
                await voice.stop()
            } catch {
                await voice.stop()
                voiceError = "语音不可用，请检查麦克风与语音识别权限后重试。"
            }
        }
    }

    private func completeEncounter() {
        session.finishAwakening()
        if session.isFinished { center.pendingFirstConversation = true }
    }

    private var waveform: some View {
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { index in
                Capsule()
                    .fill(.white.opacity(0.8))
                    .frame(width: 4, height: CGFloat([14, 25, 37, 44, 37, 25, 14][index]) * (listening ? 0.45 + CGFloat(microphoneLevel) : 1))
            }
        }
        .frame(height: 64)
        .opacity(speaking || listening ? 1 : 0.45)
        .animation(.easeInOut(duration: 0.15), value: microphoneLevel)
        .accessibilityLabel(listening ? "正在聆听" : speaking ? "正在说话" : "初始化系统")
    }
}
