import React from 'react';
import { 
  Database, Cloud, UploadCloud, ArrowRight,
  FileText, Table as TableIcon, Webhook,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

export function KnowledgeBase() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#FCF9F8] font-sans text-[#1C1B1B] p-10 relative pb-32">
      <div className="max-w-7xl mx-auto space-y-12 w-full">
        
        {/* Hero / Header Section */}
        <section className="flex flex-col md:flex-row justify-between items-end gap-6">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-display font-extrabold tracking-tight text-[#1C1B1B] mb-2">Knowledge Base</h2>
            <p className="text-[#716B67] text-lg">Manage your organization's legal, operational, and policy data sources to power precise AI interactions.</p>
          </div>
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-[#ffdbce] text-[#783112] rounded-lg text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#EC5B14] animate-pulse"></span>
              Index Healthy
            </div>
          </div>
        </section>

        {/* Stats & Ingest Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Stats Column */}
          <div className="md:col-span-4 space-y-6">
            
            <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#716B67] mb-1">Active Sources</p>
                <h3 className="text-3xl font-display font-bold">124</h3>
              </div>
              <div className="w-12 h-12 rounded-lg bg-[#EC5B14]/10 flex items-center justify-center">
                <Database className="text-[#EC5B14] w-6 h-6" />
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#716B67] mb-1">Data Indexed</p>
                <h3 className="text-3xl font-display font-bold">4.2 <span className="text-lg font-medium text-[#716B67]">TB</span></h3>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <Cloud className="text-blue-600 w-6 h-6" />
              </div>
            </div>

          </div>

          {/* Ingest Area */}
          <div className="md:col-span-8 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-8 flex flex-col items-center justify-center border-2 border-dashed border-[#E8E4E2] hover:border-[#EC5B14]/40 group hover:bg-[#FCF9F8] transition-all cursor-pointer">
            <div className="w-16 h-16 rounded-full bg-[#F6F3F2] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
               <UploadCloud className="text-[#EC5B14] w-8 h-8" />
            </div>
            <h4 className="text-xl font-display font-bold mb-2">Ingest New Data</h4>
            <p className="text-[#716B67] text-center max-w-sm mb-6">Drag and drop documents, SQL dumps, or API endpoints to synchronize with your uClaw context.</p>
            <button className="bg-[#1C1B1B] text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-md hover:bg-[#1C1B1B]/80 transition-colors">Select Files</button>
          </div>
        </section>

        {/* Recent Projects Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-display font-bold tracking-tight">Recent Projects</h3>
            <button className="text-[#EC5B14] font-semibold text-sm flex items-center gap-1 hover:underline">
              View all projects <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Project Card 1 */}
            <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-transparent hover:border-[#E8E4E2] overflow-hidden group transition-all">
              <div className="h-32 bg-[#F6F3F2] relative overflow-hidden">
                <img 
                  className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700 mix-blend-multiply" 
                  src="https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&q=80&w=800" 
                  alt="Legal Review" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-6 pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 bg-[#EC5B14]/10 text-[#EC5B14] text-[10px] font-bold uppercase tracking-widest rounded-md">Legal</span>
                  <span className="text-[10px] text-[#716B67] font-medium">Updated 2h ago</span>
                </div>
                <h4 className="text-lg font-display font-bold mb-1">Q3 Legal Review</h4>
                <p className="text-[#716B67] text-sm mb-4 line-clamp-2">Quarterly audit of all internal contracts and compliance documentation.</p>
                <div className="flex -space-x-2">
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="user" />
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jack" alt="user" />
                  <div className="w-6 h-6 rounded-full bg-[#1C1B1B] text-white border-2 border-white flex items-center justify-center text-[8px] font-bold">+4</div>
                </div>
              </div>
            </div>

            {/* Project Card 2 */}
            <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-transparent hover:border-[#E8E4E2] overflow-hidden group transition-all">
              <div className="h-32 bg-[#F6F3F2] relative overflow-hidden">
                <img 
                  className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700 mix-blend-multiply" 
                  src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&q=80&w=800" 
                  alt="Supply Chain" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-6 pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-widest rounded-md">Operations</span>
                  <span className="text-[10px] text-[#716B67] font-medium">Updated 5h ago</span>
                </div>
                <h4 className="text-lg font-display font-bold mb-1">Supply Chain v4</h4>
                <p className="text-[#716B67] text-sm mb-4 line-clamp-2">Optimization analysis for global logistics and warehouse management.</p>
                <div className="flex -space-x-2">
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" alt="user" />
                  <div className="w-6 h-6 rounded-full bg-[#1C1B1B] text-white border-2 border-white flex items-center justify-center text-[8px] font-bold">+2</div>
                </div>
              </div>
            </div>

            {/* Project Card 3 */}
            <div className="bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-transparent hover:border-[#E8E4E2] overflow-hidden group transition-all">
              <div className="h-32 bg-[#F6F3F2] relative overflow-hidden">
                <img 
                  className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700 mix-blend-multiply" 
                  src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&q=80&w=800" 
                  alt="Policy Training" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-6 pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-widest rounded-md">HR</span>
                  <span className="text-[10px] text-[#716B67] font-medium">Updated 1d ago</span>
                </div>
                <h4 className="text-lg font-display font-bold mb-1">Policy Training</h4>
                <p className="text-[#716B67] text-sm mb-4 line-clamp-2">Updated internal employee conduct guidelines and automated training modules.</p>
                <div className="flex -space-x-2">
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=John" alt="user" />
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alice" alt="user" />
                  <img className="w-6 h-6 rounded-full border-2 border-white object-cover" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Robert" alt="user" />
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Knowledge Assets Table & Sidebar Segment */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          <div className="lg:col-span-3 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-8 overflow-hidden">
            <h3 className="text-2xl font-display font-bold mb-6">Recent Knowledge Assets</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[#716B67] text-xs font-bold uppercase tracking-widest border-b border-[#E8E4E2]">
                    <th className="pb-4 font-bold">Asset Name</th>
                    <th className="pb-4 font-bold">Type</th>
                    <th className="pb-4 font-bold">Last Synced</th>
                    <th className="pb-4 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F6F3F2]">
                  
                  <tr className="group hover:bg-[#FCF9F8] transition-colors cursor-default">
                    <td className="py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                         <FileText className="text-[#EC5B14] w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">global_tax_compliance_2023.pdf</span>
                    </td>
                    <td className="py-4 text-[#716B67] text-sm">PDF Document</td>
                    <td className="py-4 text-[#716B67] text-sm">Oct 12, 14:30</td>
                    <td className="py-4 text-right">
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-widest">Indexed</span>
                    </td>
                  </tr>

                  <tr className="group hover:bg-[#FCF9F8] transition-colors cursor-default">
                    <td className="py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                         <TableIcon className="text-blue-500 w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">customer_retention_data_v2</span>
                    </td>
                    <td className="py-4 text-[#716B67] text-sm">SQL Database</td>
                    <td className="py-4 text-[#716B67] text-sm">Oct 12, 09:15</td>
                    <td className="py-4 text-right">
                      <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full uppercase tracking-widest">Syncing</span>
                    </td>
                  </tr>

                  <tr className="group hover:bg-[#FCF9F8] transition-colors cursor-default">
                    <td className="py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                         <Webhook className="text-purple-500 w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">Salesforce_Connector_Production</span>
                    </td>
                    <td className="py-4 text-[#716B67] text-sm">API Endpoint</td>
                    <td className="py-4 text-[#716B67] text-sm">Oct 11, 23:45</td>
                    <td className="py-4 text-right">
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-widest">Indexed</span>
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* AI Insights Sidebar */}
          <div className="space-y-6">
            
            <div className="bg-gradient-to-br from-[#cc4900] to-[#EC5B14] p-6 rounded-[16px] text-white shadow-lg shadow-[#EC5B14]/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <h4 className="text-lg font-display font-bold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#ffb599]" />
                uClaw Insight
              </h4>
              <p className="text-sm text-white/90 leading-relaxed mb-6 font-medium">
                You have 12 orphaned documents in the "Library" that aren't linked to any active project.
              </p>
              <button className="text-[11px] uppercase tracking-widest font-black bg-white text-[#cc4900] px-4 py-2 rounded-lg hover:bg-[#F6F3F2] shadow-sm transition-colors w-full">
                Clean Assets
              </button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
              <h4 className="text-[11px] font-bold text-[#716B67] uppercase tracking-widest mb-4">Suggested Chips</h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 bg-[#ffdbce] text-[#783112] rounded-full text-[11px] font-bold cursor-pointer hover:bg-[#EC5B14] hover:text-white transition-colors">Tax Review</span>
                <span className="px-3 py-1.5 bg-[#ffdbce] text-[#783112] rounded-full text-[11px] font-bold cursor-pointer hover:bg-[#EC5B14] hover:text-white transition-colors">HR Policies</span>
                <span className="px-3 py-1.5 bg-[#ffdbce] text-[#783112] rounded-full text-[11px] font-bold cursor-pointer hover:bg-[#EC5B14] hover:text-white transition-colors">GDPR Audit</span>
              </div>
            </div>

          </div>

        </section>

      </div>
    </div>
  );
}
