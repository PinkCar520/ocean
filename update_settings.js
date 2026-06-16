const fs = require('fs');

const path = 'packages/ui/src/components/SettingsDialog.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add i18n.changeLanguage
code = code.replace(
  `document.documentElement.classList.add(updates.theme);\n        }\n      }`,
  `document.documentElement.classList.add(updates.theme);\n        }\n      }\n      if (updates.language) {\n        i18n.changeLanguage(updates.language);\n      }`
);

// 2. Add dialog states and new states
code = code.replace(
  `const [editedInstructions, setEditedInstructions] = useState('');`,
  `const [editedInstructions, setEditedInstructions] = useState('');\n  const [showConfirmDelete, setShowConfirmDelete] = useState(false);\n  const [showAddCredential, setShowAddCredential] = useState(false);\n  const [credentialInput, setCredentialInput] = useState('');`
);

// 3. Update handleDeleteConversations and addCredential UX
code = code.replace(
  `const handleDeleteConversations = async () => {\n    if (!confirm(t('user_center.billing.confirm_delete', 'Are you sure you want to delete all conversations? This cannot be undone.'))) return;\n    try {\n      await api.delete('/api/sessions/all');\n      fetchProfile();\n      alert(t('user_center.billing.delete_success', 'All conversations deleted.'));\n    } catch (err: any) {\n      console.error('Delete failed:', err.message);\n    }\n  };`,
  `const executeDeleteConversations = async () => {\n    try {\n      await api.delete('/api/sessions/all');\n      fetchProfile();\n      setShowConfirmDelete(false);\n    } catch (err: any) {\n      console.error('Delete failed:', err.message);\n    }\n  };\n\n  const executeAddCredential = async () => {\n    if (!credentialInput) return;\n    try {\n      await api.post('/api/user/credentials', { systemType: 'zentao', token: credentialInput, username: 'admin' });\n      fetchProfile();\n      setShowAddCredential(false);\n      setCredentialInput('');\n    } catch (err: any) {\n      console.error('Failed to add credential:', err.message);\n    }\n  };`
);

// 4. Update sidebar hardcoded labels
code = code.replace(
  `{ id: 'instructions', label: 'Custom Instructions', icon: Sparkles }`,
  `{ id: 'instructions', label: t('user_center.tabs.instructions', 'Custom Instructions'), icon: Sparkles }`
);
code = code.replace(
  `{ id: 'permissions', label: 'Permissions', icon: Shield }`,
  `{ id: 'permissions', label: t('user_center.tabs.permissions', 'Permissions'), icon: Shield }`
);

// 5. Update Search placeholder & Settings title
code = code.replace(
  `placeholder="Search"`,
  `placeholder={t('user_center.common.search', 'Search')}`
);
code = code.replace(
  `>Settings</h3>`,
  `>{t('user_center.common.settings', 'Settings')}</h3>`
);

// 6. Profile inputs onBlur and remove bottom button
code = code.replace(
  `onChange={(e) => setEditedName(e.target.value)}`,
  `onChange={(e) => setEditedName(e.target.value)}\n                        onBlur={handleSaveProfile}`
);
code = code.replace(
  `onChange={(e) => setEditedEmail(e.target.value)}`,
  `onChange={(e) => setEditedEmail(e.target.value)}\n                        onBlur={handleSaveProfile}`
);

// Remove Profile save button
code = code.replace(
  /<div className="flex justify-end pt-4">\s*<button\s*onClick=\{handleSaveProfile\}[\s\S]*?<\/button>\s*<\/div>/g,
  ``
);

// 7. Instructions onBlur and remove save button
code = code.replace(
  `onChange={(e) => setEditedInstructions(e.target.value)}`,
  `onChange={(e) => setEditedInstructions(e.target.value)}\n                      onBlur={() => updatePreferences({ customInstructions: editedInstructions })}`
);
code = code.replace(
  /<div className="flex justify-end pt-4">\s*<button\s*onClick=\{[^}]*updatePreferences\(\{ customInstructions: editedInstructions \}\)\}[\s\S]*?<\/button>\s*<\/div>/g,
  ``
);

// 8. General tab remove save button
code = code.replace(
  /\{\/\* Bottom Floating Bar \*\/\}\s*\{activeSubTab === 'general' && \([\s\S]*?\}\)\}/g,
  ``
);

// 9. Update Usage & Billing texts
code = code.replace(
  />Usage & Billing<\/h3>/,
  `>{t('user_center.tabs.billing', 'Usage & Billing')}</h3>`
);
code = code.replace(
  />Total Sessions<\/p>/,
  `>{t('user_center.usage.total_sessions', 'Total Sessions')}</p>`
);
code = code.replace(
  />Messages Sent<\/p>/,
  `>{t('user_center.usage.messages_sent', 'Messages Sent')}</p>`
);
code = code.replace(
  />Delete All Chats<\/button>/,
  `>{t('user_center.usage.delete_all_chats', 'Delete All Chats')}</button>`
);
code = code.replace(
  />Export My Data \(\.JSON\)<\/button>/,
  `>{t('user_center.usage.export_data', 'Export My Data (.JSON)')}</button>`
);
code = code.replace(
  `onClick={handleDeleteConversations}`,
  `onClick={() => setShowConfirmDelete(true)}`
);

// 10. Update Add Integration to use dialog
code = code.replace(
  `const token = prompt(t('user_center.common.prompt_zentao'));\n                       if (token) addCredential('zentao', token, 'admin');`,
  `setShowAddCredential(true);`
);

// 11. Add Toast indicator at the top right of the right column
const toastContent = `
              <AnimatePresence>
                {saveStatus !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute top-6 right-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card shadow-md border border-border/50 text-xs font-bold text-foreground z-10"
                  >
                    {saveStatus === 'saving' ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : (
                      <ShieldCheck className="w-3 h-3 text-green-500" />
                    )}
                    {saveStatus === 'saving' ? t('user_center.general.applying', 'Saving...') : t('user_center.general.saved', 'Saved')}
                  </motion.div>
                )}
              </AnimatePresence>
`;
code = code.replace(
  `{/* Right Column: Dynamic Content */}\n            <div className="flex-1 overflow-y-auto relative p-10 pb-24 scroll-smooth">`,
  `{/* Right Column: Dynamic Content */}\n            <div className="flex-1 overflow-y-auto relative p-10 pb-24 scroll-smooth">` + toastContent
);

// 12. Add Inline Dialogs at the end of Right Column (before closing div of right column)
const dialogsContent = `
              <AnimatePresence>
                {showConfirmDelete && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-10">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-card w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-border/50"
                    >
                      <h4 className="text-lg font-bold text-foreground mb-2">{t('user_center.usage.delete_all_chats', 'Delete All Chats')}</h4>
                      <p className="text-sm text-muted-foreground mb-6">{t('user_center.billing.confirm_delete', 'Are you sure you want to delete all conversations? This cannot be undone.')}</p>
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => setShowConfirmDelete(false)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
                        <button onClick={executeDeleteConversations} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md">Delete</button>
                      </div>
                    </motion.div>
                  </div>
                )}
                
                {showAddCredential && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-10">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-card w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-border/50"
                    >
                      <h4 className="text-lg font-bold text-foreground mb-2">{t('user_center.integrations.add', 'Add Integration')}</h4>
                      <p className="text-sm text-muted-foreground mb-4">{t('user_center.common.prompt_zentao', 'Please enter your token')}</p>
                      <input 
                        type="text" 
                        value={credentialInput}
                        onChange={(e) => setCredentialInput(e.target.value)}
                        className="w-full bg-muted border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground mb-6 focus:outline-none focus:ring-2 focus:ring-[#EC5B14]/20"
                        placeholder="Token..."
                        autoFocus
                      />
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => { setShowAddCredential(false); setCredentialInput(''); }} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all">Cancel</button>
                        <button onClick={executeAddCredential} disabled={!credentialInput} className="px-4 py-2 text-sm font-bold text-white bg-[#EC5B14] hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md">Save</button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
`;
code = code.replace(
  `            </div>\n          </motion.div>\n        </div>`,
  dialogsContent + `            </div>\n          </motion.div>\n        </div>`
);


fs.writeFileSync(path, code);
console.log('SettingsDialog.tsx updated via JS replace!');
