import React from 'react';
import { 
  CheckCircle2, Rocket, GitPullRequest, MessageSquare, 
  Star, Box, Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

export function SkillLibrary() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#fcf9f8] p-10 font-sans text-[#1c1b1b] relative pb-32">
      <div className="max-w-[1400px] mx-auto w-full">
        
        {/* Hero Section */}
        <section className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-[#1c1b1b] mb-3">
              Skill & MCP Library <span className="text-[#a33800]">v3</span>
            </h2>
            <p className="text-[#716B67] max-w-xl text-[17px] leading-relaxed">
              Extend uClaw's intelligence with curated Model Context Protocol connectors and specialized agent skills for your enterprise ecosystem.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="bg-[#ffdbce] text-[#783112] px-3 py-1 rounded-full text-xs font-bold">124 Total Skills</span>
            <span className="bg-[#ebe7e7] text-[#5a4138] px-3 py-1 rounded-full text-xs font-bold">12 New This Week</span>
          </div>
        </section>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-10 overflow-x-auto pb-2">
          <button className="px-5 py-2 rounded-full bg-[#EC5B14] text-white text-sm font-bold shadow-md">All Extensions</button>
          <button className="px-5 py-2 rounded-full bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67] text-sm font-bold transition-colors">Project Management</button>
          <button className="px-5 py-2 rounded-full bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67] text-sm font-bold transition-colors">CI/CD Tools</button>
          <button className="px-5 py-2 rounded-full bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67] text-sm font-bold transition-colors">Version Control</button>
          <button className="px-5 py-2 rounded-full bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67] text-sm font-bold transition-colors">Communication</button>
          <button className="px-5 py-2 rounded-full bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67] text-sm font-bold transition-colors">Data Science</button>
        </div>

        {/* Bento Grid Marketplace */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* Card 1: ZenTao PM */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mb-6">
              <CheckCircle2 className="text-[#EC5B14] w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">ZenTao PM Integration</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Sync uClaw tasks directly with ZenTao projects. Automate sprint planning and bug tracking via natural language.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">MCP Connector</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

          {/* Card 2: Jenkins CI/CD */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-6">
              <Rocket className="text-blue-600 w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">Jenkins CI/CD</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Monitor pipelines, trigger builds, and analyze build logs directly within your chat session.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">Skillset</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

          {/* Card 3: GitLab Repo */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-6">
              <GitPullRequest className="text-red-500 w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">GitLab Repo</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Advanced repository analysis. Perform code reviews and manage Merge Requests with AI-driven insights.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">MCP Connector</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

          {/* Card 4: Slack Bot */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-6">
              <MessageSquare className="text-purple-600 w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">Slack Bot Integration</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Bridge uClaw to your Slack workspace. Notify teams of AI milestones and query uClaw from channels.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">Automation</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

          {/* Card 5: Large Featured Slot */}
          <div className="md:col-span-2 bg-[#2E2825] p-8 rounded-[24px] flex flex-col md:flex-row gap-8 items-center overflow-hidden relative shadow-2xl">
            {/* Glowing orb background effect */}
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#EC5B14] opacity-[0.15] blur-[80px] rounded-full pointer-events-none"></div>
            
            <div className="relative z-10 flex-1">
              <div className="inline-flex items-center gap-1.5 bg-[#EC5B14]/20 text-[#ffb599] px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-5">
                <Star className="w-3.5 h-3.5 fill-current" />
                Featured by uClaw
              </div>
              <h3 className="font-display font-bold text-2xl text-white mb-3">Enterprise Knowledge Graph</h3>
              <p className="text-[#D3CDC9] text-[14px] leading-relaxed mb-8">
                Index your entire Confluence, Notion, and Jira workspace into a unified RAG pipeline for instant retrieval.
              </p>
              <button className="btn-kinetic px-6 py-2.5 rounded-xl text-sm font-bold hover:brightness-110 focus:outline-none">
                Enable Full Suite
              </button>
            </div>

            <div className="w-full md:w-56 h-56 rounded-2xl overflow-hidden shadow-2xl relative z-10 shrink-0 bg-gradient-to-br from-[#403733] to-[#1C1B1B] border border-white/5 flex items-center justify-center">
               <motion.div 
                 animate={{ rotate: 360 }}
                 transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                 className="absolute inset-0 opacity-30"
                 style={{
                   background: 'conic-gradient(from 0deg, transparent 0 340deg, #EC5B14 360deg)',
                 }}
               />
               <div className="absolute inset-1 rounded-[14px] bg-[#2E2825] flex items-center justify-center p-4">
                  {/* Decorative representation of a Knowledge Graph */}
                  <div className="relative w-full h-full">
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#EC5B14] blur-sm opacity-50"></div>
                     <Star className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-[#ffb599] z-10" />
                     <div className="absolute top-4 left-4 w-3 h-3 rounded-full bg-blue-400"></div>
                     <div className="absolute bottom-4 right-4 w-4 h-4 rounded-full bg-purple-400"></div>
                     <div className="absolute top-6 right-8 w-2 h-2 rounded-full bg-green-400"></div>
                     <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100">
                        <line x1="20" y1="20" x2="50" y2="50" stroke="white" strokeWidth="1" />
                        <line x1="80" y1="80" x2="50" y2="50" stroke="white" strokeWidth="1" />
                        <line x1="70" y1="20" x2="50" y2="50" stroke="white" strokeWidth="1" />
                     </svg>
                  </div>
               </div>
            </div>
          </div>

          {/* Card 6: Docker Management */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mb-6">
              <Box className="text-sky-500 w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">Docker Control</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Interface with local or remote Docker engines. Start, stop, and inspect containers via voice or text.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">DevOps</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

          {/* Card 7: Google Workspace */}
          <div className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-6">
              <Mail className="text-emerald-600 w-6 h-6" />
            </div>
            <div className="flex-grow">
              <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">Google Workspace</h3>
              <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                Draft emails, schedule calendar events, and organize Drive folders within your workflow.
              </p>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">Productivity</span>
              <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">Install</button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
