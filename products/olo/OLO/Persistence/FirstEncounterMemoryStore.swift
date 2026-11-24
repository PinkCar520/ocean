import Foundation
import Security

struct FirstEncounterMemory: Codable, Equatable {
    let selfDescription: String?
    let relationshipsDescription: String?
    let recordedAt: Date
}

struct FirstEncounterDraft: Codable, Equatable {
    let nextQuestion: Int
    let selfDescription: String?
    let relationshipsDescription: String?
    let voiceChoice: String?
}

@MainActor
protocol FirstEncounterMemoryStoring {
    func load() -> FirstEncounterMemory?
    func save(_ memory: FirstEncounterMemory) -> Bool
    func delete() -> Bool
    func loadDraft() -> FirstEncounterDraft?
    func saveDraft(_ draft: FirstEncounterDraft) -> Bool
    func deleteDraft() -> Bool
}

/// Stores sensitive first-encounter answers only in the local Keychain.
@MainActor
final class FirstEncounterMemoryStore: FirstEncounterMemoryStoring {
    private let service: String
    private let account: String

    init(service: String = "app.olo.first-encounter.v1", account: String = "first-encounter-answers") {
        self.service = service
        self.account = account
    }


    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() -> FirstEncounterMemory? { read(FirstEncounterMemory.self) }

    private func read<T: Decodable>(_ type: T.Type) -> T? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    func save(_ memory: FirstEncounterMemory) -> Bool { write(memory) }

    private func write<T: Encodable>(_ memory: T) -> Bool {
        guard let data = try? JSONEncoder().encode(memory) else { return false }
        var request = query
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(request as CFDictionary, nil)
        if status == errSecSuccess { return true }
        guard status == errSecDuplicateItem else { return false }
        return SecItemUpdate(query as CFDictionary,
                             [kSecValueData as String: data] as CFDictionary) == errSecSuccess
    }

    private var draftStore: FirstEncounterMemoryStore {
        FirstEncounterMemoryStore(service: service, account: "first-encounter-draft")
    }

    func loadDraft() -> FirstEncounterDraft? { draftStore.read(FirstEncounterDraft.self) }
    func saveDraft(_ draft: FirstEncounterDraft) -> Bool { draftStore.write(draft) }
    func deleteDraft() -> Bool { draftStore.delete() }

    func delete() -> Bool {
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
