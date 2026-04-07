import SwiftUI
import Charts

struct DashboardView: View {
    let bugTrends: [BugTrend] = [
        BugTrend(day: "Mon", count: 12),
        BugTrend(day: "Tue", count: 18),
        BugTrend(day: "Wed", count: 15),
        BugTrend(day: "Thu", count: 25),
        BugTrend(day: "Fri", count: 10),
        BugTrend(day: "Sat", count: 5),
        BugTrend(day: "Sun", count: 8)
    ]
    
    let taskData: [TaskDistribution] = [
        TaskDistribution(category: "禅道 Bug", value: 45, colorName: "orange"),
        TaskDistribution(category: "GitLab MR", value: 25, colorName: "blue"),
        TaskDistribution(category: "Jenkins 构建", value: 30, colorName: "green")
    ]
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header (Web Style)
                VStack(alignment: .leading, spacing: 4) {
                    Text("工作流概览")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.uclawTextPrimary)
                    Text("最近 7 天的业务线 P0 缺陷报表")
                        .font(.caption)
                        .foregroundColor(.uclawTextSecondary)
                }
                .padding(.horizontal)
                
                // 1. Bug Trend Chart (Area/Line)
                VStack(alignment: .leading, spacing: 16) {
                    Text("缺陷趋势 (P0)")
                        .font(.headline)
                        .foregroundColor(.uclawTextPrimary)
                    
                    Chart(bugTrends) { item in
                        AreaMark(
                            x: .value("Day", item.day),
                            y: .value("Count", item.count)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.uclawAccent.opacity(0.3), Color.uclawAccent.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        
                        LineMark(
                            x: .value("Day", item.day),
                            y: .value("Count", item.count)
                        )
                        .foregroundStyle(Color.uclawAccent)
                        .symbol(.circle)
                    .uclawCardStyle()
                    .padding(.horizontal)

                    // 2. Task Distribution (Sector/Pie Chart)
                    VStack(alignment: .leading, spacing: 16) {
                        Text("智能体任务分布")
                            .font(.headline)
                            .foregroundColor(.uclawTextPrimary)

                        Chart(taskData) { item in
                            SectorMark(
                                angle: .value("Value", item.value),
                                innerRadius: .ratio(0.6),
                                angularInset: 1.5
                            )
                            .cornerRadius(5)
                            .foregroundStyle(by: .value("Category", item.category))
                        }
                        .frame(height: 200)
                        .chartLegend(position: .bottom, spacing: 20)
                    }
                    .padding()
                    .uclawCardStyle()
                    .padding(.horizontal)
                    ...
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .uclawCardStyle()
                    }
                    }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    StatCard(title: "待处理 Bug", value: "12", icon: "ladybug.fill", color: .red)
                    StatCard(title: "活跃 MR", value: "8", icon: "arrow.triangle.pull", color: .blue)
                    StatCard(title: "流水线成功率", value: "98%", icon: "checkmark.seal.fill", color: .green)
                    StatCard(title: "剩余配额", value: "2.4k", icon: "cpu", color: .purple)
                }
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .background(Color.uclawBackground)
        .navigationTitle("Dashboard")
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .font(.headline)
                Spacer()
            }
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.uclawTextPrimary)
            Text(title)
                .font(.caption2)
                .foregroundColor(.uclawTextSecondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .uclawCard()
    }
}
