import SwiftUI

struct SuggestionCard: View {
    let icon: String
    let title: String
    let description: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .foregroundColor(.uclawAccent)
                    .font(.system(size: 16, weight: .bold))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.uclawTextPrimary)
                    Text(description)
                        .font(.system(size: 11))
                        .foregroundColor(.uclawTextSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .uclawCardStyle()
        }
        .buttonStyle(.plain)
    }
}

struct NewChatView: View {
    @Binding var isChatActive: Bool
    @State private var inputText: String = ""
    @StateObject private var api = APIClient.shared
    
    let suggestions = [
        ("ladybug.fill", "修复 Bug", "分析禅道上的支付报错并给出修改建议"),
        ("doc.text.fill", "撰写 PRD", "基于业务需求生成标准的产品需求文档"),
        ("terminal.fill", "排查日志", "检索过去 15 分钟的 ELK 异常堆栈"),
        ("sparkles", "代码巡检", "对最近的 GitLab MR 进行合规性检查")
    ]
    
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.uclawBackground.ignoresSafeArea()
            
            VStack(spacing: 30) {
                Spacer()
                
                // Web style Welcome Icon
                VStack(spacing: 20) {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 80, height: 80)
                        .overlay(
                            Image(systemName: "sparkles")
                                .font(.system(size: 40))
                                .foregroundColor(.uclawAccent)
                        )
                        .uclawCardStyle()
                    
                    VStack(spacing: 8) {
                        Text("我是 uClaw，你的 AI 研发助手")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.uclawTextPrimary)
                        
                        Text("今天有什么我可以帮你的？")
                            .font(.system(size: 14))
                            .foregroundColor(.uclawTextSecondary)
                    }
                }
                
                // Suggestion Grid (Web style)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(suggestions, id: \.1) { item in
                        SuggestionCard(icon: item.0, title: item.1, description: item.2) {
                            startChat(with: item.1)
                        }
                    }
                }
                .padding(.horizontal, 20)
                
                Spacer()
                Spacer()
            }
            
            // Web style Floating Input Bar
            VStack {
                HStack(spacing: 12) {
                    TextField("你想聊点什么？", text: $inputText)
                        .font(.system(size: 15))
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                    
                    Button(action: { startChat(with: inputText) }) {
                        Circle()
                            .fill(inputText.isEmpty ? Color.uclawTextSecondary.opacity(0.3) : Color.uclawAccent)
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                            )
                    }
                    .padding(.trailing, 8)
                }
                .background(Color.uclawSurface)
                .cornerRadius(100)
                .overlay(
                    Capsule().stroke(Color.uclawBorder, lineWidth: 1)
                )
                .modifier(UClawShadow())
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
        }
    }
    
    private func startChat(with text: String) {
        guard !text.isEmpty else { return }
        api.currentMessages = []
        Task {
            isChatActive = true
            await api.streamMessage(text, conversationId: nil)
        }
    }
}
