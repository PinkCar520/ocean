import React from 'react';
import { BugCard } from './BugCard';
import { PipelineCard } from './PipelineCard';
import { TaskPlan } from './TaskPlan';
import { motion } from 'framer-motion';

export function UIGallery() {
  return (
    <div className="p-10 space-y-12 overflow-y-auto h-full bg-slate-50/30">
      <header>
        <h2 className="text-2xl font-bold text-slate-900">Generative UI Gallery</h2>
        <p className="text-slate-500 text-sm">Visual regression testing for all intelligent components.</p>
      </header>

      {/* 1. Bug Cards Section */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 border-b border-blue-100 pb-2">1. Bug Tracking (ZenTao)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BugCard 
            bugId="BUG-2048"
            title="Core gateway timeout when handling large payload"
            status="active"
            assignee="Wang Er"
            severity="high"
            description="The system fails to process JSON files larger than 50MB, causing the worker thread to hang."
          />
          <BugCard 
            bugId="BUG-1024"
            title="Localization missing for settings page"
            status="resolved"
            assignee="Li Si"
            severity="low"
          />
        </div>
      </section>

      {/* 2. Pipeline Cards Section */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 border-b border-emerald-100 pb-2">2. CI/CD Pipelines (Jenkins)</h3>
        <div className="grid grid-cols-1 gap-8">
          <PipelineCard 
            id="742"
            name="Production Deployment - Main Branch"
            branch="main"
            status="running"
            startTime="2 minutes ago"
            steps={[
              { name: 'Security Audit', status: 'success', duration: '45s' },
              { name: 'Unit Testing', status: 'success', duration: '2m 10s' },
              { name: 'Docker Build & Push', status: 'running' },
              { name: 'Blue/Green Deploy', status: 'waiting' }
            ]}
          />
          <PipelineCard 
            id="741"
            name="Hotfix: Bug-2048 Patch"
            branch="hotfix/gateway-timeout"
            status="failed"
            startTime="1 hour ago"
            steps={[
              { name: 'Static Analysis', status: 'success', duration: '12s' },
              { name: 'Build Artifact', status: 'failed', duration: '3s' }
            ]}
          />
        </div>
      </section>

      {/* 3. Task Planning Section */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600 border-b border-indigo-100 pb-2">3. Strategic Planning (Plan Mode)</h3>
        <div className="grid grid-cols-1 gap-6">
          <TaskPlan 
            title="Workflow: Automated Bug Resolution"
            steps={[
              { tool: 'tools-zentao', label: 'Extract Bug Context', description: 'Analyze BUG-2048 requirement and stack trace.' },
              { tool: 'tools-gitlab', label: 'Locate Faulty Code', description: 'Scan repository for gateway middleware logic.' },
              { tool: 'tools-local-fs', label: 'Apply AST Patch', description: 'Modify timeout limits in server.ts.' },
              { tool: 'tools-jenkins', label: 'Trigger Validation', description: 'Run CI pipeline #743 to verify fix.' }
            ]}
            onConfirm={() => alert('Plan Confirmed')}
            onCancel={() => alert('Plan Rejected')}
          />
        </div>
      </section>
    </div>
  );
}
