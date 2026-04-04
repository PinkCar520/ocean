import React from 'react';
import { 
  Sparkles, Sliders, Settings, 
  HelpCircle, LogOut, ChevronRight, Globe 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateSettings?: () => void;
}

export function SettingsModal({ isOpen, onClose, onNavigateSettings }: SettingsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Invisible Overlay for click-outside to close */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[50]"
          />

          {/* Popover Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10, originX: 0, originY: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed left-3 bottom-[72px] w-[232px] bg-white rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] p-4 flex flex-col gap-1 z-[60] border border-[#E8E4E2]"
          >
            {/* User Profile Header */}
            <div className="flex items-center gap-3 mb-4">
              <img 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA0oS2KtsdNSGQoheV6v31oxAq-NhwZzQ47xg8__EJhv8OqGKGnZL3wep9OPHmM8x2Ik6mpZYLUp_nlIoldi6DXVNzDnTDsq10ls1jkUj-t_evdmGKwkn_t5xfFRgHK6-mmcStkVS-zdI45IF3rmBL3mH9KmAB8N9AvKqU-Dv45N0-NNrOIrD2ZlsGh9MmfkPMjEPcNRAJQVNa20KRYE9eY-Svv7Taq6vVmmqM9HxckuxqA9UWUSYJjawCeP6JhTrR_2ym5Y9kmaeo" 
                alt="profile" 
                className="w-12 h-12 rounded-full border border-[#E8E4E2] object-cover" 
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-[#1C1B1B] truncate">Alex Rivera</h4>
                <p className="text-sm text-[#716B67]">Free version</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#716B67]" />
            </div>

            {/* Nav List */}
            <div className="space-y-0.5">
              <button className="w-full flex items-center gap-3 px-2 py-3 text-[#5a4138] hover:bg-[#F6F3F2] rounded-xl transition-colors">
                <Globe className="w-5 h-5 text-[#716B67]" />
                <span className="text-sm font-medium">Language</span>
              </button>
              
              <button onClick={onNavigateSettings} className="w-full flex items-center gap-3 px-2 py-3 text-[#5a4138] hover:bg-[#F6F3F2] rounded-xl transition-colors">
                <Settings className="w-5 h-5 text-[#716B67]" />
                <span className="text-sm font-medium">Settings</span>
              </button>
              
              <div className="my-2 border-t border-[#E8E4E2]/50"></div>
              
              <button className="w-full flex items-center gap-3 px-2 py-3 text-[#5a4138] hover:bg-[#F6F3F2] rounded-xl transition-colors">
                <HelpCircle className="w-5 h-5 text-[#716B67]" />
                <span className="text-sm font-medium">Help</span>
                <ChevronRight className="w-4 h-4 text-[#716B67] ml-auto" />
              </button>
              
              <button className="w-full flex items-center gap-3 px-2 py-3 text-[#5a4138] hover:bg-[#F6F3F2] rounded-xl transition-colors">
                <LogOut className="w-5 h-5 text-[#716B67]" />
                <span className="text-sm font-medium">Sign Out</span>
                <ChevronRight className="w-4 h-4 text-[#716B67] ml-auto" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
