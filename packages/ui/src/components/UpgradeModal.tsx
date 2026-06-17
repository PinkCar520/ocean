import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles, Zap, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const plans = [
    {
      name: 'Free',
      description: 'Meet Ocean AI',
      price: '$0',
      period: '',
      buttonText: 'Your current plan',
      buttonVariant: 'secondary',
      icon: <Sparkles className="w-5 h-5 text-muted-foreground" />,
      features: [
        'Chat on web, iOS, Android, and desktop',
        'Generate code and visualize data',
        'Connect Slack and Google Workspace',
        'Extended thinking for complex work',
        'Built-in web search'
      ]
    },
    {
      name: 'Pro',
      description: 'Research, code, and organize',
      price: billingCycle === 'yearly' ? '$19' : '$24',
      period: 'USD / month',
      periodSubtext: billingCycle === 'yearly' ? 'billed annually' : 'billed monthly',
      buttonText: 'Get Pro plan',
      buttonVariant: 'primary',
      icon: <Zap className="w-5 h-5 text-amber-500" />,
      highlight: true,
      featuresTitle: 'Everything in Free and:',
      features: [
        'Ocean AI directly in your codebase',
        'Power through tasks with Cowork',
        'Higher usage limits',
        'Access to more core models',
        'Memory that carries across conversations'
      ]
    },
    {
      name: 'Max',
      description: 'Higher limits, priority access',
      price: billingCycle === 'yearly' ? '$110' : '$130',
      period: 'USD / month',
      periodSubtext: billingCycle === 'yearly' ? 'billed annually' : 'billed monthly',
      buttonText: 'Get Max plan',
      buttonVariant: 'primary',
      icon: <Crown className="w-5 h-5 text-indigo-500" />,
      featuresTitle: 'Everything in Pro, plus:',
      features: [
        'Up to 20x more usage than Pro*',
        'Recommended for team & enterprise',
        'Early access to advanced features',
        'Higher output limits for all tasks',
        'Priority access at high traffic times'
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-[#FAFAFA] dark:bg-[#121212] rounded-[28px] shadow-2xl flex flex-col"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="p-8 sm:p-12 flex flex-col items-center">
              <h2 className="text-3xl sm:text-4xl font-bold font-serif text-foreground mb-8 text-center">Plans that grow with you</h2>
              
              {/* Toggle */}
              <div className="flex items-center bg-muted/50 p-1 rounded-full mb-10 border border-border/50">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    billingCycle === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    billingCycle === 'yearly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Yearly
                  <span className="text-[10px] text-[#2563EB] bg-[#DBEAFE] dark:bg-[#1E3A8A] dark:text-[#93C5FD] px-1.5 py-0.5 rounded-full font-bold">Save 17%</span>
                </button>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                {plans.map((plan, idx) => (
                  <div
                    key={plan.name}
                    className={`relative flex flex-col bg-card rounded-3xl p-6 sm:p-8 transition-all ${
                      plan.highlight 
                        ? 'border-2 border-primary/20 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(255,255,255,0.05)] md:scale-[1.02]' 
                        : 'border border-border/50 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {plan.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                        Most Popular
                      </div>
                    )}
                    
                    <div className="mb-6">
                      <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
                        {plan.icon}
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-1">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
                    </div>

                    <div className="mb-6 min-h-[80px]">
                      <div className="flex items-baseline gap-1">
                        {plan.name === 'Max' && <span className="text-xl font-medium text-muted-foreground mr-1">From</span>}
                        <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                        {plan.period && (
                          <div className="flex flex-col ml-1">
                            <span className="text-xs text-muted-foreground leading-tight">{plan.period}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">{plan.periodSubtext}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      className={`w-full py-3 rounded-xl font-medium text-sm transition-all mb-8 ${
                        plan.buttonVariant === 'primary'
                          ? 'bg-foreground text-background hover:opacity-90 shadow-sm'
                          : 'bg-muted/50 text-foreground border border-border/50 hover:bg-muted'
                      }`}
                    >
                      {plan.buttonText}
                    </button>

                    <div className="flex-1">
                      {plan.featuresTitle && (
                        <p className="text-sm font-bold text-foreground mb-4">{plan.featuresTitle}</p>
                      )}
                      <ul className="space-y-3">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <Check className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="text-sm text-muted-foreground leading-tight">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mt-12 text-center max-w-2xl">
                *Usage limits apply. Prices and plans are subject to change at Ocean's discretion.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
