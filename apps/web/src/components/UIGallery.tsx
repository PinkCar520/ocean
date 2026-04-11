import { useTranslation } from 'react-i18next';
import { BugCard } from './BugCard';
import { PipelineCard } from './PipelineCard';
import { TaskPlan } from './TaskPlan';
import { ZenTaoTaskCard } from './ZenTaoTaskCard';
import { LeaveRequestForm } from './LeaveRequestForm';
import { DiffViewer } from './DiffViewer';
import { PrintConsole } from './PrintConsole';
import { ThinkingPills } from './ThinkingPills';
import { ThinkingList } from './ThinkingList';

export function UIGallery() {
  const { t } = useTranslation();

  return (
    <div className="p-10 space-y-16 overflow-y-auto h-full bg-[#fcf9f8]">
      <header>
        <h2 className="text-2xl font-bold text-[#1C1B1B]">{t('gallery.title')}</h2>
        <p className="text-[#716B67] text-sm mt-1">{t('gallery.description')}</p>
      </header>

      {/* 0. Thinking Pills */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EC5B14] border-b border-[#E8E4E2] pb-2">0. {t('gallery.sections.thinking_pills')}</h3>
        <div className="space-y-4">
          {/* Active state */}
          <div className="bg-white rounded-[16px] p-6 border border-[#E8E4E2]">
            <span className="text-[10px] text-[#716B67] font-bold uppercase tracking-[0.15em]">{t('gallery.labels.pills_active')}</span>
            <ThinkingPills
              steps={[
                { label: t('gallery.demo_data.thinking.checking_zentao'), status: 'done' },
                { label: t('gallery.demo_data.thinking.fetching_member'), status: 'active' },
                { label: t('gallery.demo_data.thinking.optimizing_allocation'), status: 'pending' },
              ]}
            />
          </div>

          {/* All done */}
          <div className="bg-white rounded-[16px] p-6 border border-[#E8E4E2]">
            <span className="text-[10px] text-[#716B67] font-bold uppercase tracking-[0.15em]">{t('gallery.labels.pills_all_done')}</span>
            <ThinkingPills
              steps={[
                { label: t('gallery.demo_data.thinking.locating_report'), status: 'done' },
                { label: t('gallery.demo_data.thinking.checking_printer'), status: 'done' },
              ]}
            />
          </div>

          {/* List variant */}
          <div className="max-w-[400px]">
            <span className="text-[10px] text-[#716B67] font-bold uppercase tracking-[0.15em] mb-2 block">{t('gallery.labels.list_variant')}</span>
            <ThinkingList
              steps={[
                { label: t('gallery.demo_data.thinking.reading_gitlab'), status: 'done' },
                { label: t('gallery.demo_data.thinking.comparing_oauth'), status: 'done' },
                { label: t('gallery.demo_data.thinking.identifying_leakage'), status: 'active' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* 1. ZenTao Task Integration Card */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EC5B14] border-b border-[#E8E4E2] pb-2">1. {t('gallery.sections.zentao_task')} ({t('gallery.stitch_labels.image_1')})</h3>
        <div className="space-y-6">
          <ZenTaoTaskCard
            title={t('gallery.demo_data.zentao.title')}
            assignees={[
              { name: t('gallery.demo_data.zentao.assignee_1'), avatar: '' },
              { name: t('gallery.demo_data.zentao.assignee_2'), avatar: '' },
            ]}
            assigneeCount={4}
            priority="High"
            assignee={t('gallery.demo_data.zentao.assignee_1')}
            sprintName={t('gallery.demo_data.zentao.sprint_name')}
            sprintStartsIn={t('gallery.demo_data.zentao.sprint_starts')}
            onCreateTask={(data) => alert(`Created: ${JSON.stringify(data)}`)}
          />
        </div>
      </section>

      {/* 2. Leave Request Form */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EC5B14] border-b border-[#E8E4E2] pb-2">2. {t('gallery.sections.leave_request')} ({t('gallery.stitch_labels.image_2')})</h3>
        <LeaveRequestForm
          remainingDays={18}
          defaultDates="2023-10-23"
          onSubmit={(data) => alert(`Submitted: ${JSON.stringify(data)}`)}
          onQuickAction={(action) => alert(`Quick action: ${action}`)}
        />
      </section>

      {/* 3. Code Diff Viewer */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EC5B14] border-b border-[#E8E4E2] pb-2">3. {t('gallery.sections.code_diff')} ({t('gallery.stitch_labels.image_3')})</h3>
        <DiffViewer
          fileName={t('gallery.demo_data.diff_viewer.file_name')}
          draft
          diff={[
            { lineNumber: 24, type: 'context', content: "const authHeader = `Bearer ${token}`;" },
            { lineNumber: 25, type: 'deletion', content: "console.log(`Request sent with ${authHeader}`);" },
            { lineNumber: 25, type: 'addition', content: "logger.debug('Request sent', { correlationId }); // Redact tokens" },
            { lineNumber: 26, type: 'context', content: "return await fetch(url, { headers: { authHeader } });" },
          ]}
          onApply={() => alert('Applying fix to GitLab...')}
        />
      </section>

      {/* 4. Print Console */}
      <section className="space-y-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EC5B14] border-b border-[#E8E4E2] pb-2">4. {t('gallery.sections.print_console')} ({t('gallery.stitch_labels.image_4')})</h3>
        <PrintConsole
          printerName={t('gallery.demo_data.print_console.printer_name')}
          location={t('gallery.demo_data.print_console.location')}
          status="online"
          paperPercent={92}
          paperTray={t('gallery.demo_data.print_console.paper_tray')}
          inkLevels={{ c: 85, m: 70, y: 90, k: 60 }}
          documentName={t('gallery.demo_data.print_console.document_name')}
          documentPages={12}
          documentSize="4.2 MB"
          documentGenerated={t('gallery.demo_data.print_console.document_generated')}
          securityPass
          securityMessage={t('gallery.demo_data.print_console.security_message')}
          onConfirmPrint={() => alert('Printing...')}
          onQuickAction={(action) => alert(`Print action: ${action}`)}
        />
      </section>
    </div>
  );
}
