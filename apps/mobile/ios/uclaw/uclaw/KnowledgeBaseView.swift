import SwiftUI
import UniformTypeIdentifiers

struct DocumentRow: View {
    let doc: KnowledgeDocument
    
    var iconName: String {
        switch doc.type.lowercased() {
        case "pdf": return "doc.append.fill"
        case "docx", "doc": return "doc.richtext.fill"
        case "md", "txt": return "doc.text.fill"
        default: return "doc.fill"
        }
    }
    
    var statusColor: Color {
        switch doc.status {
        case .synced: return .green
        case .syncing: return .blue
        case .failed: return .red
        }
    }
    
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: iconName)
                .font(.title2)
                .foregroundColor(.uclawAccent.opacity(0.8))
                .frame(width: 40, height: 40)
                .background(Color.uclawAccent.opacity(0.05))
                .cornerRadius(8)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(doc.name)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.uclawTextPrimary)
                
                HStack {
                    Text(doc.size)
                    Text("•")
                    Text(doc.updatedAt, format: .dateTime.month().day())
                }
                .font(.system(size: 12))
                .foregroundColor(.uclawTextSecondary)
            }
            
            Spacer()
            
            // Sync Status Badge
            HStack(spacing: 4) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 6, height: 6)
                Text(doc.status.rawValue)
                    .font(.system(size: 10, weight: .medium))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.1))
            .foregroundColor(statusColor)
            .cornerRadius(10)
        }
        .padding(.vertical, 8)
    }
}

struct KnowledgeBaseView: View {
    @State private var searchText = ""
    @State private var showingFileImporter = false
    
    @State private var documents = [
        KnowledgeDocument(id: "1", name: "2024年第一季度研发规范.pdf", type: "pdf", size: "1.2 MB", updatedAt: Date(), status: .synced),
        KnowledgeDocument(id: "2", name: "支付系统架构设计.docx", type: "docx", size: "4.5 MB", updatedAt: Date(), status: .synced),
        KnowledgeDocument(id: "3", name: "内网 API 鉴权说明.md", type: "md", size: "12 KB", updatedAt: Date(), status: .syncing),
        KnowledgeDocument(id: "4", name: "Jenkins 部署流水线配置.pdf", type: "pdf", size: "850 KB", updatedAt: Date(), status: .failed)
    ]
    
    var filteredDocs: [KnowledgeDocument] {
        if searchText.isEmpty { return documents }
        return documents.filter { $0.name.lowercased().contains(searchText.lowercased()) }
    }
    
    var body: some View {
        List {
            Section {
                // Upload Action Button
                Button(action: { showingFileImporter = true }) {
                    HStack {
                        Image(systemName: "plus.app.fill")
                            .font(.title2)
                        VStack(alignment: .leading) {
                            Text("上传新文档")
                                .font(.system(size: 14, weight: .bold))
                            Text("支持 PDF, Word, Markdown, TXT")
                                .font(.system(size: 11))
                                .foregroundColor(.uclawTextSecondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .foregroundColor(.uclawAccent)
            }
            
            Section("我的文档") {
                ForEach(filteredDocs) { doc in
                    DocumentRow(doc: doc)
                }
                .onDelete { indexSet in
                    documents.remove(atOffsets: indexSet)
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #else
        .listStyle(.inset)
        #endif
        .navigationTitle("知识库")
        .searchable(text: $searchText, prompt: "在知识库中搜索...")
        .fileImporter(
            isPresented: $showingFileImporter,
            allowedContentTypes: [.pdf, .text, .rtf, .flatRTFD],
            allowsMultipleSelection: true
        ) { result in
            // Handle file selection logic here
        }
        .toolbar {
            #if os(iOS)
            EditButton()
            #endif
        }
    }
}
