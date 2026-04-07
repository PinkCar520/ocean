import SwiftUI

struct MessageBubble: View {
    let message: Message
    var isUser: Bool { message.role == "user" }
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if !isUser {
                // Web style AI Icon
                Circle()
                    .fill(Color.uclawAccent.opacity(0.1))
                    .frame(width: 32, height: 32)
                    .overlay(Image(systemName: "sparkles").font(.caption).foregroundColor(.uclawAccent))
                    .padding(.top, 4)
            } else { Spacer(minLength: 50) }
            
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                // The Bubble (Web Style - Asymmetric Corners)
                Text((try? AttributedString(markdown: message.content)) ?? AttributedString(message.content))
                    .font(.system(size: 15))
                    .lineSpacing(4)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .background(isUser ? Color.uclawAccent : Color.uclawSurface)
                    .foregroundColor(isUser ? .white : .uclawTextPrimary)
                    // Custom Uneven Rounded Rect for High Fidelity
                    .clipShape(UnevenRoundedRectangle(
                        topLeadingRadius: 16,
                        bottomLeadingRadius: isUser ? 16 : 4,
                        bottomTrailingRadius: isUser ? 4 : 16,
                        topTrailingRadius: 16
                    ))
                    .overlay(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 16,
                            bottomLeadingRadius: isUser ? 16 : 4,
                            bottomTrailingRadius: isUser ? 4 : 16,
                            topTrailingRadius: 16
                        )
                        .stroke(isUser ? Color.uclawAccent : Color.uclawBorder, lineWidth: 1)
                    )
                    .modifier(UClawShadow())
                
                Text(message.timestamp, format: .dateTime.hour().minute())
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.uclawTextSecondary)
                    .padding(.horizontal, 4)
            }
            
            if isUser {
                // Web style User Initials
                Circle()
                    .fill(Color.uclawBackground)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Circle().stroke(Color.uclawBorder, lineWidth: 1)
                    )
                    .overlay(Text("95").font(.system(size: 11, weight: .bold)).foregroundColor(.uclawTextSecondary))
                    .padding(.top, 4)
            } else { Spacer(minLength: 50) }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}

struct NativeChatView: View {
    @StateObject private var api = APIClient.shared
    @State private var inputText: String = ""
    
    var body: some View {
        ZStack(alignment: .bottom) {
            Color.uclawBackground.ignoresSafeArea()
            
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(api.currentMessages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding(.top, 20)
                    .padding(.bottom, 120) // Floating input height
                }
                .onChange(of: api.currentMessages.count) { _ in
                    if let last = api.currentMessages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
            
            // Web Style Floating Input
            VStack {
                HStack(spacing: 12) {
                    TextField("你想聊点什么？", text: $inputText)
                        .font(.system(size: 15))
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                    
                    Button(action: sendMessage) {
                        Circle()
                            .fill(api.isStreaming || inputText.isEmpty ? Color.uclawTextSecondary.opacity(0.3) : Color.uclawAccent)
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: api.isStreaming ? "square.fill" : "arrow.up")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                            )
                    }
                    .disabled(inputText.isEmpty && !api.isStreaming)
                    .padding(.trailing, 8)
                }
                .background(Color.uclawSurface)
                .cornerRadius(100) // Pill shape
                .overlay(
                    Capsule().stroke(Color.uclawBorder, lineWidth: 1)
                )
                .modifier(UClawShadow())
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
        }
        .navigationTitle("uClaw")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
    
    private func sendMessage() {
        let text = inputText
        inputText = ""
        Task { await api.streamMessage(text, conversationId: nil) }
    }
}
