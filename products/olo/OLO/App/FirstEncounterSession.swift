import Foundation
import Observation

@MainActor
@Observable
final class FirstEncounterSession {
    enum Phase: Equatable {
        case question(Int)
        case awakening
        case completed
    }
    enum VoiceChoice: String, Codable {
        case masculine, feminine
    }

    static let questions = [
        "你觉得自己是个什么样的人？",
        "你希望我使用男性声音，还是女性声音？",
        "你会如何描述自己与家人、朋友的关系？"
    ]

    private(set) var phase: Phase
    private(set) var voiceChoice: VoiceChoice?
    private(set) var errorMessage: String?

    private let defaults: UserDefaults
    private let memoryStore: any FirstEncounterMemoryStoring
    private let completionKey = "olo.encounter.completed.v1"
    private let voiceKey = "olo.encounter.voice.v1"
    private var selfDescription: String?
    private var relationshipsDescription: String?

    init(defaults: UserDefaults = .standard,
         memoryStore: any FirstEncounterMemoryStoring = FirstEncounterMemoryStore()) {
        self.defaults = defaults
        self.memoryStore = memoryStore
        phase = defaults.bool(forKey: completionKey) ? .completed : .question(0)
        voiceChoice = defaults.string(forKey: voiceKey).flatMap(VoiceChoice.init(rawValue:))
        if phase == .completed {
            _ = memoryStore.deleteDraft()
        } else if let draft = memoryStore.loadDraft(), (0...3).contains(draft.nextQuestion) {
            selfDescription = draft.selfDescription
            relationshipsDescription = draft.relationshipsDescription
            voiceChoice = draft.voiceChoice.flatMap(VoiceChoice.init(rawValue:))
            phase = draft.nextQuestion >= 2 && voiceChoice == nil ? .question(1) : (draft.nextQuestion == 3 ? .awakening : .question(draft.nextQuestion))
        }
    }

    var isFinished: Bool { phase == .completed }
    var currentQuestion: String? {
        guard case .question(let index) = phase,
              Self.questions.indices.contains(index) else { return nil }
        return Self.questions[index]
    }

    func answer(_ text: String) {
        guard case .question(let index) = phase, index != 1 else { return }
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            errorMessage = "可以回答，也可以跳过。"
            return
        }
        advance(index, selfAnswer: index == 0 ? text : selfDescription,
                relationshipAnswer: index == 2 ? text : relationshipsDescription, voice: voiceChoice)
    }

    func chooseVoice(_ choice: VoiceChoice) {
        guard phase == .question(1) else { return }
        advance(1, selfAnswer: selfDescription, relationshipAnswer: relationshipsDescription, voice: choice)
    }

    func skip() {
        guard case .question(let index) = phase else { return }
        guard index != 1 else {
            errorMessage = "请选择一个声音。"
            return
        }
        advance(index, selfAnswer: selfDescription, relationshipAnswer: relationshipsDescription, voice: voiceChoice)
    }

    private func advance(_ index: Int, selfAnswer: String?, relationshipAnswer: String?, voice: VoiceChoice?) {
        guard memoryStore.saveDraft(FirstEncounterDraft(nextQuestion: index + 1, selfDescription: selfAnswer, relationshipsDescription: relationshipAnswer, voiceChoice: voice?.rawValue)) else {
            errorMessage = "无法安全保存进度，请重试。"
            return
        }
        selfDescription = selfAnswer
        relationshipsDescription = relationshipAnswer
        voiceChoice = voice
        errorMessage = nil
        phase = index == 2 ? .awakening : .question(index + 1)
    }

    func finishAwakening() {
        guard phase == .awakening, voiceChoice != nil else { return }
        guard memoryStore.save(FirstEncounterMemory(
            selfDescription: selfDescription,
            relationshipsDescription: relationshipsDescription,
            recordedAt: .now
        )) else {
            errorMessage = "无法安全保存回答，请重试。"
            return
        }
        defaults.set(voiceChoice?.rawValue, forKey: voiceKey)
        defaults.set(true, forKey: completionKey)
        _ = memoryStore.deleteDraft()
        selfDescription = nil
        relationshipsDescription = nil
        phase = .completed
    }
}
