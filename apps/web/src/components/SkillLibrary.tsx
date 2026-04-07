import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, Rocket, GitPullRequest, MessageSquare, 
  Star, Box, Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import { useTranslation } from 'react-i18next';

type Category = 'all' | 'pm' | 'cicd' | 'vc' | 'communication' | 'data_science';

interface LibraryCard {
  id: string;
  category: Category;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
  tagKey: string;
  isFeatured?: boolean;
}

export function SkillLibrary() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<Category>('all');

  const filters: { id: Category; label: string }[] = [
    { id: 'all', label: t('library.filters.all') },
    { id: 'pm', label: t('library.filters.pm') },
    { id: 'cicd', label: t('library.filters.cicd') },
    { id: 'vc', label: t('library.filters.vc') },
    { id: 'communication', label: t('library.filters.communication') },
    { id: 'data_science', label: t('library.filters.data_science') },
  ];

  const allCards: LibraryCard[] = [
    {
      id: 'zentao',
      category: 'pm',
      icon: <CheckCircle2 className="w-6 h-6" />,
      iconBg: 'bg-orange-50',
      iconColor: 'text-[#EC5B14]',
      titleKey: 'library.cards.zentao.title',
      descKey: 'library.cards.zentao.desc',
      tagKey: 'library.common.mcp_connector',
    },
    {
      id: 'jenkins',
      category: 'cicd',
      icon: <Rocket className="w-6 h-6" />,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      titleKey: 'library.cards.jenkins.title',
      descKey: 'library.cards.jenkins.desc',
      tagKey: 'library.common.skillset',
    },
    {
      id: 'gitlab',
      category: 'vc',
      icon: <GitPullRequest className="w-6 h-6" />,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      titleKey: 'library.cards.gitlab.title',
      descKey: 'library.cards.gitlab.desc',
      tagKey: 'library.common.mcp_connector',
    },
    {
      id: 'slack',
      category: 'communication',
      icon: <MessageSquare className="w-6 h-6" />,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      titleKey: 'library.cards.slack.title',
      descKey: 'library.cards.slack.desc',
      tagKey: 'library.common.automation',
    },
    {
      id: 'docker',
      category: 'cicd',
      icon: <Box className="w-6 h-6" />,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-500',
      titleKey: 'library.cards.docker.title',
      descKey: 'library.cards.docker.desc',
      tagKey: 'library.common.devops',
    },
    {
      id: 'google',
      category: 'communication',
      icon: <Mail className="w-6 h-6" />,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      titleKey: 'library.cards.google.title',
      descKey: 'library.cards.google.desc',
      tagKey: 'library.common.productivity',
    },
  ];

  const filteredCards = useMemo(() => {
    if (activeFilter === 'all') return allCards;
    return allCards.filter(card => card.category === activeFilter);
  }, [activeFilter]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#fcf9f8] p-10 font-sans text-[#1c1b1b] relative pb-32">
      <div className="max-w-[1400px] mx-auto w-full">
        
        {/* Hero Section */}
        <section className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-[#1c1b1b] mb-3">
              {t('library.title')} <span className="text-[#a33800]">{t('library.v3')}</span>
            </h2>
            <p className="text-[#716B67] max-w-xl text-[17px] leading-relaxed">
              {t('library.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="bg-[#ffdbce] text-[#783112] px-3 py-1 rounded-full text-xs font-bold">
              {t('library.stats.total_skills', { count: 124 })}
            </span>
            <span className="bg-[#ebe7e7] text-[#5a4138] px-3 py-1 rounded-full text-xs font-bold">
              {t('library.stats.new_this_week', { count: 12 })}
            </span>
          </div>
        </section>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-10 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-bold transition-all duration-200",
                activeFilter === filter.id 
                  ? "bg-[#EC5B14] text-white shadow-md transform scale-105" 
                  : "bg-[#F6F3F2] hover:bg-[#ebe7e7] text-[#716B67]"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Bento Grid Marketplace */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          <AnimatePresence mode="popLayout">
            {filteredCards.map((card) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                key={card.id}
                className="group card-floating p-6 flex flex-col hover:shadow-2xl hover:shadow-[#EC5B14]/5 transition-all"
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-6", card.iconBg, card.iconColor)}>
                  {card.icon}
                </div>
                <div className="flex-grow">
                  <h3 className="font-display font-bold text-lg mb-2 group-hover:text-[#EC5B14] transition-colors">{t(card.titleKey)}</h3>
                  <p className="text-[13px] text-[#716B67] leading-relaxed mb-6 font-medium">
                    {t(card.descKey)}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#a8a19c]">{t(card.tagKey)}</span>
                  <button className="text-[#EC5B14] hover:bg-[#EC5B14]/10 px-4 py-1.5 rounded-lg transition-colors text-xs font-bold">{t('library.common.install')}</button>
                </div>
              </motion.div>
            ))}

            {/* Featured Slot - Only show when "all" or specific logic applies, here we show it for "all" */}
            {activeFilter === 'all' && (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="md:col-span-2 bg-[#2E2825] p-8 rounded-[24px] flex flex-col md:flex-row gap-8 items-center overflow-hidden relative shadow-2xl"
              >
                {/* Glowing orb background effect */}
                <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#EC5B14] opacity-[0.15] blur-[80px] rounded-full pointer-events-none"></div>
                
                <div className="relative z-10 flex-1">
                  <div className="inline-flex items-center gap-1.5 bg-[#EC5B14]/20 text-[#ffb599] px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-5">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {t('library.featured.badge')}
                  </div>
                  <h3 className="font-display font-bold text-2xl text-white mb-3">{t('library.featured.title')}</h3>
                  <p className="text-[#D3CDC9] text-[14px] leading-relaxed mb-8">
                    {t('library.featured.desc')}
                  </p>
                  <button className="btn-kinetic px-6 py-2.5 rounded-xl text-sm font-bold hover:brightness-110 focus:outline-none">
                    {t('library.featured.button')}
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
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>
    </div>
  );
}
