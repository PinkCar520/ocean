import Foundation

struct ReminderIntent: Sendable, Equatable {
    var title: String
    var dueDate: Date

    static func parse(_ input: String, now: Date = .now, calendar: Calendar = .current) -> ReminderIntent? {
        guard input.contains("提醒"), !["每", "周", "星期", "月", "号", "分钟后", "小时后"].contains(where: input.contains) else { return nil }
        let pattern = #"(?:(上午|中午|下午|晚上|凌晨)\s*)?([零〇一二两三四五六七八九十\d]{1,3})(?:[:：]([零〇一二两三四五六七八九十\d]{1,3})|[点时](半|[零〇一二两三四五六七八九十\d]{1,3}分?)?)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let matches = regex.matches(in: input, range: NSRange(input.startIndex..., in: input))
        guard matches.count == 1, let match = matches.first else { return nil }
        func group(_ index: Int) -> String {
            Range(match.range(at: index), in: input).map { String(input[$0]) } ?? ""
        }
        guard var hour = number(group(2)), (0...23).contains(hour) else { return nil }
        let minuteText = group(3).isEmpty ? group(4) : group(3)
        guard let minute = minuteText.isEmpty ? 0 : minuteText == "半" ? 30 : number(minuteText.replacingOccurrences(of: "分", with: "")), (0...59).contains(minute) else { return nil }
        let period = group(1)
        if !period.isEmpty {
            guard (1...12).contains(hour) else { return nil }
            if ["下午", "晚上"].contains(period), hour < 12 { hour += 12 }
            if ["凌晨", "上午"].contains(period), hour == 12 { hour = 0 }
            if period == "中午", hour < 11 { hour += 12 }
        }
        let days = ["今天", "明天", "后天"].filter(input.contains)
        guard days.count <= 1 else { return nil }
        let offset = days.first == "后天" ? 2 : days.first == "明天" ? 1 : 0
        guard let day = calendar.date(byAdding: .day, value: offset, to: now),
              let date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day), date > now else { return nil }
        var title = regex.stringByReplacingMatches(in: input, range: NSRange(input.startIndex..., in: input), withTemplate: "")
        for token in ["提醒我", "提醒", "今天", "明天", "后天"] { title = title.replacingOccurrences(of: token, with: "") }
        title = title.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        guard !title.isEmpty else { return nil }
        return ReminderIntent(title: title, dueDate: date)
    }

    /// Resolves a short follow-up such as “三点半” against the day and
    /// day-period already present in the original request.
    static func parseClarifiedTime(
        _ answer: String,
        originalInput: String,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> Date? {
        let dayToken = ["今天", "明天", "后天"].first(where: originalInput.contains) ?? ""
        let periodToken = ["凌晨", "上午", "中午", "下午", "晚上"].first(where: originalInput.contains) ?? ""
        let synthetic = "\(dayToken)\(periodToken)\(answer)提醒我补充事项"
        if let parsed = parse(synthetic, now: now, calendar: calendar) { return parsed.dueDate }

        // With no explicit day, use the next future occurrence. This keeps
        // “下午提醒我… / 三点半” useful even after today's 15:30 has passed.
        guard dayToken.isEmpty else { return nil }
        return parse("明天\(periodToken)\(answer)提醒我补充事项", now: now, calendar: calendar)?.dueDate
            ?? parse("明天\(answer)提醒我补充事项", now: now, calendar: calendar)?.dueDate
    }

    private static func number(_ text: String) -> Int? {
        if let value = Int(text) { return value }
        let digits: [Character: Int] = ["零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9]
        if text.contains("十") {
            let parts = text.split(separator: "十", omittingEmptySubsequences: false)
            guard parts.count == 2, parts.allSatisfy({ $0.count <= 1 }) else { return nil }
            guard let tens = parts[0].isEmpty ? 1 : parts[0].first.flatMap({ digits[$0] }),
                  let units = parts[1].isEmpty ? 0 : parts[1].first.flatMap({ digits[$0] }) else { return nil }
            return tens * 10 + units
        }
        guard !text.isEmpty else { return nil }
        return text.reduce(Optional(0)) { value, char in
            guard let value, let digit = digits[char] else { return nil }
            return value * 10 + digit
        }
    }
}

@MainActor
protocol ReminderExecuting {
    func authorize() async throws
    func create(_ intent: ReminderIntent) throws -> String
    func verify(identifier: String, intent: ReminderIntent) throws
}

@MainActor
protocol AgentTaskSaving {
    func save(_ task: AgentTask) throws
}
