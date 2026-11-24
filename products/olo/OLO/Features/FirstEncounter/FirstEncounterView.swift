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
    @State private var voiceError: String?
    @State private var recognition: Task<Void, Never>?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 26) {
                Spacer()
                if case .question(let index) = session.phase {
                    waveform
                    Text(session.currentQuestion ?? "")
                        .font(.system(size: 27, weight: .medium))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("encounter.question.\(index)")
                    if index == 0 {
                        Text("每次提交的回答都将安全保存在本机，退出后可继续。完成后可在 Memory 中查看和删除。")
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.65))
                            .multilineTextAlignment(.center)
                    }
                    Button(listening ? "停止听取" : "语音回答") {
                        if listening { recognition?.cancel(); Task { await voice.stop() }; listening = false }
                        else { listen(index) }
                    }
                    .foregroundStyle(.white)
                    if let voiceError { Text(voiceError).font(.footnote).foregroundStyle(.orange) }
                    if index == 1 {
                        HStack(spacing: 16) {
                            Button("男性声音") { session.chooseVoice(.masculine) }
                            Button("女性声音") { session.chooseVoice(.feminine) }
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        TextField("你的回答", text: $answer, axis: .vertical)
                            .lineLimit(2...4)
                            .padding(14)
                            .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))
                            .foregroundStyle(.white)
                            .tint(.white)
                            .accessibilityIdentifier("encounter.answer")
                        Button("继续") { session.answer(answer) }
                            .buttonStyle(.borderedProminent)
                            .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Button("跳过") { session.skip() }
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Text("\(index + 1) / 3")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.5))
                } else if session.phase == .awakening {
                    OLOEntityView(audioLevel: 0, isResponding: greeted && !greetingFinished)
                        .frame(height: 240)
                        .transition(.opacity)
                    Text("你好。")
                        .font(.largeTitle).foregroundStyle(.white)
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
            if let question = session.currentQuestion { speech.say(question) {} }
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
        .onDisappear { speech.stop(); recognition?.cancel(); Task { await voice.stop() } }
    }

    private func listen(_ index: Int) {
        speech.stop()
        listening = true
        voiceError = nil
        recognition = Task {
            defer { listening = false }
            do {
                let stream = try await voice.start()
                for try await fragment in stream {
                    try Task.checkCancellation()
                    guard session.phase == .question(index) else { break }
                    if index != 1 { answer = fragment.text }
                    guard fragment.isFinal else { continue }
                    await voice.stop()
                    guard !Task.isCancelled, session.phase == .question(index) else { return }
                    if index == 1 {
                        let text = fragment.text
                        if text.contains("男") && !text.contains("女") { session.chooseVoice(.masculine) }
                        else if text.contains("女") && !text.contains("男") { session.chooseVoice(.feminine) }
                        else { voiceError = "请选择男性或女性声音。" }
                    } else if !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        session.answer(answer)
                    }
                    return
                }
                await voice.stop()
            } catch is CancellationError {
                await voice.stop()
            } catch {
                await voice.stop()
                voiceError = "语音不可用，可以使用文字或按钮回答。"
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
                    .frame(width: 4, height: CGFloat([14, 25, 37, 44, 37, 25, 14][index]))
            }
        }
        .frame(height: 64)
        .accessibilityLabel("初始化系统")
    }
}
