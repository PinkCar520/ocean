import React from 'react';
import { 
  BarChart3, Users, CheckCircle2, AlertCircle, 
  GitBranch, Terminal, Activity, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { t } = useTranslation();
  
  const stats = [
    { label: t('dashboard.stats.total_bugs'), value: '12', change: '-2', icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: t('dashboard.stats.active_prs'), value: '5', change: '+1', icon: GitBranch, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: t('dashboard.stats.sys_health'), value: '98%', change: 'Stable', icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: t('dashboard.stats.team_velocity'), value: '42', change: '+12%', icon: Activity, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="p-8 space-y-8 overflow-y-auto h-full bg-[#F9FAFB]/50">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('dashboard.title')}</h2>
        <p className="text-sm text-slate-500">{t('dashboard.desc')}</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2.5 rounded-2xl", stat.bg)}>
                <stat.icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                stat.change.startsWith('+') ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                stat.change.startsWith('-') ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-slate-50 text-slate-500 border-slate-200"
              )}>
                {stat.change}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Chart Area Placeholder */}
        <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 min-h-[400px]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
               <BarChart3 className="w-4 h-4 text-blue-500" />
               {t('dashboard.throughput')}
            </h3>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-[10px] font-bold bg-slate-50 text-slate-500 rounded-lg border border-slate-200 uppercase tracking-tight">7 Days</button>
              <button className="px-3 py-1 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-lg border border-blue-100 uppercase tracking-tight">30 Days</button>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center h-64 text-center">
             <div className="w-full h-full flex items-end justify-around gap-4 px-4">
                {[45, 60, 40, 80, 55, 90, 70, 85, 50, 65, 75, 95].map((h, i) => (
                  <motion.div 
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: 0.5 + i * 0.05, duration: 1 }}
                    className="w-full max-w-[20px] bg-blue-100 rounded-t-lg relative group"
                  >
                    <div className="absolute inset-0 bg-blue-500 rounded-t-lg scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom duration-300 opacity-20" />
                  </motion.div>
                ))}
             </div>
             <p className="text-xs text-slate-400 mt-6 font-medium">Daily contribution activity across all repositories</p>
          </div>
        </div>

        {/* Side Panel: Active Nodes */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-8 flex items-center gap-2">
             <Terminal className="w-4 h-4 text-emerald-500" />
             {t('dashboard.nodes')}
          </h3>
          <div className="space-y-6">
            {[
              { name: 'PinkCar', status: 'Online', load: '12%', color: 'bg-emerald-500' },
              { name: 'BlueDragon', status: 'Standby', load: '2%', color: 'bg-blue-400' },
              { name: 'RedHawk', status: 'Offline', load: '0%', color: 'bg-slate-300' }
            ].map(node => (
              <div key={node.name} className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all hover:bg-white hover:border-blue-200 cursor-default">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", node.color)} />
                    <span className="text-sm font-bold text-slate-700">{node.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{node.status}</span>
                </div>
                <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className={cn("h-full", node.color)} style={{ width: node.load }} />
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-colors">
            {t('dashboard.manage_nodes')}
          </button>
        </div>
      </div>
    </div>
  );
}
