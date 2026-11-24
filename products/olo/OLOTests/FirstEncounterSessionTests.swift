import Foundation
import XCTest
@testable import OLO

@MainActor
private final class EncounterMemoryFake: FirstEncounterMemoryStoring {
    var memory: FirstEncounterMemory?
    var shouldSave = true
    var draft: FirstEncounterDraft?
    var shouldSaveDraft = true
    func loadDraft() -> FirstEncounterDraft? { draft }
    func saveDraft(_ draft: FirstEncounterDraft) -> Bool {
        guard shouldSaveDraft else { return false }
        self.draft = draft
        return true
    }
    func deleteDraft() -> Bool { draft = nil; return true }
    func load() -> FirstEncounterMemory? { memory }
    func save(_ memory: FirstEncounterMemory) -> Bool {
        guard shouldSave else { return false }
        self.memory = memory
        return true
    }
    func delete() -> Bool { memory = nil; return true }
}

@MainActor
final class FirstEncounterSessionTests: XCTestCase {
    func testIdentityIsCreatedAtAwakeningAndNeverRenamedOnResume() {
        let suite = "olo.identity.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = OLOIdentityStore(defaults: defaults)
        XCTAssertNil(store.load())
        let birth = Date(timeIntervalSince1970: 12345)
        let identity = store.loadOrCreate(now: birth, name: "Mira")
        XCTAssertEqual(identity.name, "Mira")
        XCTAssertEqual(identity.createdAt, birth)
        XCTAssertEqual(store.loadOrCreate(name: "Nova"), identity)
    }

    func testIdentitySurvivesRelaunchAndMemoryDeletion() {
        let suite = "olo.identity.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let birth = Date(timeIntervalSince1970: 12345)
        let identity = OLOIdentityStore(defaults: defaults).loadOrCreate(now: birth)
        XCTAssertNotEqual(identity.name, "OLO")
        XCTAssertEqual(identity.createdAt, birth)
        let memory = EncounterMemoryFake()
        XCTAssertTrue(memory.delete())
        XCTAssertEqual(OLOIdentityStore(defaults: defaults).loadOrCreate(), identity)
    }

    func testThreeQuestionsPersistUserStatementsAndVoice() {
        let suite = "olo.encounter.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = EncounterMemoryFake()
        let session = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertEqual(session.currentQuestion, "你觉得自己是个什么样的人？")
        session.answer("I am curious")
        XCTAssertEqual(session.currentQuestion, "你希望我使用男性声音，还是女性声音？")
        session.chooseVoice(.feminine)
        XCTAssertEqual(session.currentQuestion, "你会如何描述自己与家人、朋友的关系？")
        session.answer("I care about my friends")
        XCTAssertEqual(session.phase, .awakening)
        XCTAssertNil(store.load())
        session.finishAwakening()
        XCTAssertTrue(session.isFinished)
        XCTAssertEqual(store.load()?.selfDescription, "I am curious")
        XCTAssertEqual(store.load()?.relationshipsDescription, "I care about my friends")
        XCTAssertFalse(defaults.dictionaryRepresentation().description.contains("I care about my friends"))
        let reopened = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertTrue(reopened.isFinished)
        XCTAssertEqual(reopened.voiceChoice, .feminine)
    }

    func testFailedPersistencePreventsCompletionAndAllowsRetry() {
        let suite = "olo.encounter.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = EncounterMemoryFake()
        store.shouldSave = false
        let session = FirstEncounterSession(defaults: defaults, memoryStore: store)
        session.answer("Self description")
        session.chooseVoice(.masculine)
        session.skip()
        session.finishAwakening()
        XCTAssertEqual(session.phase, .awakening)
        XCTAssertFalse(session.isFinished)
        store.shouldSave = true
        session.finishAwakening()
        XCTAssertTrue(session.isFinished)
        XCTAssertNil(store.load()?.relationshipsDescription)
    }

    func testResumeDraftAndPreserveOriginalAnswer() {
        let suite = "olo.encounter.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = EncounterMemoryFake()
        let first = FirstEncounterSession(defaults: defaults, memoryStore: store)
        store.shouldSaveDraft = false
        first.answer("  original  ")
        XCTAssertEqual(first.phase, .question(0))
        store.shouldSaveDraft = true
        first.answer("  original  ")
        let resumed = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertEqual(resumed.phase, .question(1))
        resumed.chooseVoice(.feminine)
        let next = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertEqual(next.phase, .question(2))
        next.answer("Family")
        let awakening = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertEqual(awakening.phase, .awakening)
        awakening.finishAwakening()
        XCTAssertEqual(store.load()?.selfDescription, "  original  ")
        XCTAssertNil(store.loadDraft())
        XCTAssertTrue(awakening.isFinished)
    }

    func testDeletingMemoryDoesNotResetEncounterOrVoice() {
        let suite = "olo.encounter.test.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else { XCTFail(); return }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = EncounterMemoryFake()
        let session = FirstEncounterSession(defaults: defaults, memoryStore: store)
        session.answer("Hello")
        session.chooseVoice(.masculine)
        session.answer("Family")
        session.finishAwakening()
        XCTAssertTrue(store.delete())
        XCTAssertNil(store.load())
        let reopened = FirstEncounterSession(defaults: defaults, memoryStore: store)
        XCTAssertTrue(reopened.isFinished)
        XCTAssertEqual(reopened.voiceChoice, .masculine)
    }
}
