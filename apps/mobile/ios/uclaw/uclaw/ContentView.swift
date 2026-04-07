import SwiftUI

struct CustomSidebarItem: View {
    let icon: String
    let label: String
    var isSelected: Bool = false
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(isSelected ? .uclawAccent : .uclawTextSecondary)
                .frame(width: 20)
            
            Text(label)
                .font(.system(size: 14, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .uclawTextPrimary : .uclawTextSecondary)
            
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(isSelected ? Color.uclawAccent.opacity(0.1) : Color.clear)
        .cornerRadius(10)
        .padding(.horizontal, 8)
    }
}

struct SidebarView: View {
    @StateObject private var api = APIClient.shared
    @Binding var isChatActive: Bool
    @Binding var currentTab: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Web style Header
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundColor(.uclawAccent)
                    .font(.title3)
                Text("uClaw")
                    .font(.system(size: 18, weight: .bold))
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 20)
            
            // New Chat Button (Web style Pill)
            Button(action: { 
                isChatActive = false 
                api.currentMessages = []
                currentTab = "chat"
            }) {
                HStack {
                    Image(systemName: "plus")
                    Text("新建对话")
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.uclawAccent)
                .cornerRadius(100)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
            .buttonStyle(.plain)

            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    CustomSidebarItem(icon: "chart.bar.xaxis", label: "仪表盘", isSelected: currentTab == "stats")
                        .onTapGesture { currentTab = "stats" }
                    
                    Text("最近历史")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.uclawTextSecondary)
                        .padding(.horizontal, 20)
                        .padding(.top, 20)
                        .padding(.bottom, 8)

                    if api.conversations.isEmpty {
                        Text("暂无对话")
                            .font(.caption2)
                            .foregroundColor(.uclawTextSecondary.opacity(0.5))
                            .padding(.horizontal, 20)
                    } else {
                        ForEach(api.conversations) { conv in
                            CustomSidebarItem(icon: "message", label: conv.title, isSelected: false)
                                .onTapGesture { isChatActive = true; currentTab = "chat" }
                        }
                    }
                }
            }
        }
        .background(Color.uclawBackground)
        .task { await api.fetchConversations() }
    }
}

struct ContentView: View {
    @State private var currentTab = "chat"
    @State private var isChatActive = false
    
    var body: some View {
        #if os(macOS)
        NavigationSplitView {
            SidebarView(isChatActive: $isChatActive, currentTab: $currentTab)
                .frame(minWidth: 220)
        } detail: {
            ZStack {
                if currentTab == "chat" {
                    if isChatActive { NativeChatView() }
                    else { NewChatView(isChatActive: $isChatActive) }
                } else if currentTab == "stats" {
                    DashboardView()
                }
            }
            .frame(minWidth: 500)
        }
        #else
        // iOS: Web-style Custom Layout (No default TabView)
        VStack(spacing: 0) {
            ZStack {
                if currentTab == "chat" {
                    NavigationView {
                        if isChatActive { NativeChatView() }
                        else { NewChatView(isChatActive: $isChatActive) }
                    }
                } else if currentTab == "stats" {
                    NavigationView { DashboardView() }
                } else if currentTab == "profile" {
                    NavigationView { KnowledgeBaseView() }
                }
            }
            
            // Custom Floating Bottom Navigation (Web Style)
            HStack {
                TabButton(icon: "message.fill", label: "对话", isSelected: currentTab == "chat") { currentTab = "chat" }
                Spacer()
                TabButton(icon: "chart.pie.fill", label: "统计", isSelected: currentTab == "stats") { currentTab = "stats" }
                Spacer()
                TabButton(icon: "books.vertical.fill", label: "知识库", isSelected: currentTab == "profile") { currentTab = "profile" }
            }
            .padding(.horizontal, 30)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(Divider(), alignment: .top)
        }
        .background(Color.uclawBackground)
        #endif
    }
}

struct TabButton: View {
    let icon: String
    let label: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(label)
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundColor(isSelected ? .uclawAccent : .uclawTextSecondary)
            .frame(width: 50)
        }
        .buttonStyle(.plain)
    }
}
