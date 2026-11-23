import SwiftUI

struct MemoryView: View {
    @State private var memory: FirstEncounterMemory?
    @State private var confirmDeletion = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Memory").font(.caption2).tracking(1.4).foregroundStyle(.secondary)
                Text("你告诉我的事。").font(.largeTitle.bold())
                Text("这里展示首次相遇时你亲自提供的回答，而不是智能体推断出的性格标签。")
                    .font(.footnote).foregroundStyle(.secondary)
                if let memory {
                    VStack(alignment: .leading, spacing: 14) {
                        if let value = memory.selfDescription {
                            memoryRow("关于自己", value)
                        }
                        if let value = memory.relationshipsDescription {
                            memoryRow("家人和朋友", value)
                        }
                        if memory.selfDescription == nil && memory.relationshipsDescription == nil {
                            Text("首次相遇时跳过了文字回答。")
                        }
                        Button("删除首次相遇记忆", role: .destructive) {
                            confirmDeletion = true
                        }
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
                } else {
                    ContentUnavailableView("暂无首次相遇记忆",
                                           systemImage: "brain.head.profile",
                                           description: Text("完成首次初始化后，回答将显示在这里。"))
                }
                if let errorMessage {
                    Text(errorMessage).font(.footnote).foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .onAppear { memory = FirstEncounterMemoryStore().load() }
        .confirmationDialog("删除首次相遇的回答？",
                            isPresented: $confirmDeletion,
                            titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if FirstEncounterMemoryStore().delete() {
                    memory = nil
                } else {
                    errorMessage = "删除失败，请重试。"
                }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("这不会重置身份或已选择的声音。")
        }
    }

    private func memoryRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.body)
        }
    }
}
