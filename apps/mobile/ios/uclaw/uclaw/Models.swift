import Foundation
import Combine // 必须导入

// MARK: - Models
struct User: Codable, Identifiable {
    let id: String
    let workId: String
    let name: String
    let avatar: String?
}

struct Message: Codable, Identifiable {
    var id: String = UUID().uuidString
    let role: String // "user" or "assistant"
    var content: String
    let timestamp: Date
}

struct Conversation: Codable, Identifiable {
    let id: String
    var title: String
    var lastMessage: String?
    var timestamp: Date
    var messages: [Message]?
}

// MARK: - Statistic Models
struct BugTrend: Identifiable, Codable {
    let id = UUID()
    let day: String
    let count: Int
}

struct TaskDistribution: Identifiable, Codable {
    let id = UUID()
    let category: String
    let value: Double
    let colorName: String
}

// MARK: - Skill Models
struct Skill: Identifiable, Codable {
    let id: String
    let icon: String
    let title: String
    let description: String
    let category: String
    var usageCount: Int
}

// MARK: - Knowledge Models
enum SyncStatus: String, Codable {
    case synced = "已同步"
    case syncing = "同步中"
    case failed = "失败"
}

struct KnowledgeDocument: Identifiable, Codable {
    let id: String
    let name: String
    let type: String // "pdf", "docx", "md"
    let size: String
    let updatedAt: Date
    let status: SyncStatus
}

// MARK: - API Client
class APIClient: ObservableObject {
    static let shared = APIClient()
    private let baseURL = "http://localhost:3000/api"
    private let token = "mock-dev-token-xyz567"
    private let workId = "9527"
    
    @Published var conversations: [Conversation] = []
    @Published var currentMessages: [Message] = []
    @Published var isStreaming: Bool = false
    
    // Fetch real conversation history
    func fetchConversations() async {
        guard let url = URL(string: "\(baseURL)/session") else { return }
        var request = URLRequest(url: url)
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue(workId, forHTTPHeaderField: "x-user-id")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let decoded = try JSONDecoder().decode([Conversation].self, from: data)
            DispatchQueue.main.async {
                self.conversations = decoded
            }
        } catch {
            print("Failed to fetch history: \(error)")
        }
    }
    
    // Load specific conversation messages
    func fetchMessages(for conversationId: String) async {
        // Implementation for loading historical messages
    }
    
    // Native SSE Streaming Implementation
    func streamMessage(_ content: String, conversationId: String?) async {
        guard let url = URL(string: "\(baseURL)/chat/stream") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue(workId, forHTTPHeaderField: "x-user-id")
        
        let body: [String: Any] = [
            "message": content,
            "sessionId": conversationId as Any,
            "model": "gpt-4o"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            DispatchQueue.main.async {
                self.isStreaming = true
                let userMsg = Message(role: "user", content: content, timestamp: Date())
                self.currentMessages.append(userMsg)
                // Add initial empty AI bubble
                self.currentMessages.append(Message(role: "assistant", content: "", timestamp: Date()))
            }
            
            let (result, _) = try await URLSession.shared.bytes(for: request)
            
            for try await line in result.lines {
                if line.hasPrefix("data: ") {
                    let dataString = String(line.dropFirst(6))
                    if dataString == "[DONE]" { break }
                    
                    // Simple parsing for chunks (adjust according to your API format)
                    DispatchQueue.main.async {
                        if var lastMsg = self.currentMessages.last, lastMsg.role == "assistant" {
                            lastMsg.content += dataString
                            self.currentMessages[self.currentMessages.count - 1] = lastMsg
                        }
                    }
                }
            }
            
            DispatchQueue.main.async { self.isStreaming = false }
        } catch {
            print("Streaming failed: \(error)")
            DispatchQueue.main.async { self.isStreaming = false }
        }
    }
}
