import Foundation
import Security

struct FirstEncounterMemory: Codable, Equatable {
    let selfDescription: String?
    let relationshipsDescription: String?
    let recordedAt: Date
}

@MainActor
protocol FirstEncounterMemoryStoring {
    func load() -> FirstEncounterMemory?
    func save(_ memory: FirstEncounterMemory) -> Bool
    func delete() -> Bool
}

/// Stores sensitive first-encounter answers only in the local Keychain.
@MainActor
final class FirstEncounterMemoryStore: FirstEncounterMemoryStoring {
    private let service: String
    private let account = "first-encounter-answers"

    init(service: String = "app.olo.first-encounter.v1") {
        self.service = service
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() -> FirstEncounterMemory? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(FirstEncounterMemory.self, from: data)
    }

    func save(_ memory: FirstEncounterMemory) -> Bool {
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

    func delete() -> Bool {
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
