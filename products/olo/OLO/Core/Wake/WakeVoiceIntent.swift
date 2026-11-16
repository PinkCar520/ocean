import Foundation

enum WakeVoiceIntent {
    static func matches(_ input: String) -> Bool {
        let normalized = input
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        guard !normalized.isEmpty else { return false }
        let wakeTerms = ["起床", "叫醒", "闹钟", "wake me", "wake up", "alarm"]
        let planningTerms = ["安排", "计划", "几点", "什么时候", "明天", "日程", "schedule", "set"]
        return wakeTerms.contains(where: normalized.contains)
            && planningTerms.contains(where: normalized.contains)
    }
}
