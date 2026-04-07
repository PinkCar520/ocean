import SwiftUI

struct SkillCard: View {
    let skill: Skill
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(skill.icon)
                        .font(.title2)
                        .padding(10)
                        .background(Color.uclawAccent.opacity(0.1))
                        .clipShape(Circle())
                    
                    Spacer()
                    
                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 10))
                        Text("\(skill.usageCount)")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(.uclawAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.uclawAccent.opacity(0.05))
                    .cornerRadius(12)
                }
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(skill.title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.uclawTextPrimary)
                    Text(skill.description)
                        .font(.system(size: 12))
                        .foregroundColor(.uclawTextSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .uclawCardStyle()
        }
        .buttonStyle(.plain)
    }
}

struct LibraryView: View {
    @State private var searchText = ""
    @State private var selectedCategory = "全部"
    let categories = ["全部", "研发", "产品", "测试", "运维"]
    
    let skills = [
        Skill(id: "1", icon: "🐞", title: "缺陷分析", description: "深度扫描代码异常堆栈并定位根因", category: "测试", usageCount: 1205),
        Skill(id: "2", icon: "📝", title: "PRD 生成", description: "基于业务脑图自动产出标准需求文档", category: "产品", usageCount: 843),
        Skill(id: "3", icon: "🚀", title: "流水线排障", description: "诊断 Jenkins 构建失败的具体原因", category: "运维", usageCount: 2156),
        Skill(id: "4", icon: "🛡️", title: "安全审计", description: "针对 MR 进行代码合规性与漏洞扫描", category: "研发", usageCount: 532),
        Skill(id: "5", icon: "📊", title: "SQL 优化", description: "分析慢查询日志并提供索引建议", category: "研发", usageCount: 1420),
        Skill(id: "6", icon: "🤖", title: "单元测试", description: "根据函数签名自动补全 Jest/JUnit 用例", category: "研发", usageCount: 3102)
    ]
    
    var filteredSkills: [Skill] {
        skills.filter { skill in
            (selectedCategory == "全部" || skill.category == selectedCategory) &&
            (searchText.isEmpty || skill.title.contains(searchText) || skill.description.contains(searchText))
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Category Filter
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(categories, id: \.self) { cat in
                        Button(action: { selectedCategory = cat }) {
                            Text(cat)
                                .font(.system(size: 14, weight: selectedCategory == cat ? .bold : .medium))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(selectedCategory == cat ? Color.uclawAccent : Color.white)
                                .foregroundColor(selectedCategory == cat ? .white : .uclawTextSecondary)
                                .cornerRadius(20)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 20)
                                        .stroke(Color.uclawBorder, lineWidth: selectedCategory == cat ? 0 : 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .background(Color.uclawBackground)
            
            // Skill Grid
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(filteredSkills) { skill in
                        SkillCard(skill: skill) {
                            // Action: Start new chat with this skill context
                        }
                    }
                }
                .padding()
            }
            .background(Color.uclawBackground)
        }
        .navigationTitle("技能中心")
        .searchable(text: $searchText, prompt: "搜索技能...")
    }
}
