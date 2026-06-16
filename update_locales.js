const fs = require('fs');
const paths = [
  'apps/web/src/locales/zh.json',
  'apps/web/src/locales/en.json',
  'packages/ui/src/locales/zh.json',
  'packages/ui/src/locales/en.json'
];

paths.forEach(p => {
  const isZh = p.includes('zh.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  
  if (!data.user_center.tabs.instructions) {
    data.user_center.tabs.instructions = isZh ? "自定义指令" : "Custom Instructions";
  }
  if (!data.user_center.tabs.permissions) {
    data.user_center.tabs.permissions = isZh ? "权限与安全" : "Permissions";
  }
  
  if (!data.user_center.common) data.user_center.common = {};
  if (!data.user_center.common.search) {
    data.user_center.common.search = isZh ? "搜索" : "Search";
  }
  if (!data.user_center.common.settings) {
    data.user_center.common.settings = isZh ? "设置" : "Settings";
  }
  
  if (!data.user_center.usage) data.user_center.usage = {};
  if (!data.user_center.usage.total_sessions) {
    data.user_center.usage.total_sessions = isZh ? "总对话数" : "Total Sessions";
  }
  if (!data.user_center.usage.messages_sent) {
    data.user_center.usage.messages_sent = isZh ? "已发消息数" : "Messages Sent";
  }
  if (!data.user_center.usage.delete_all_chats) {
    data.user_center.usage.delete_all_chats = isZh ? "删除所有对话" : "Delete All Chats";
  }
  if (!data.user_center.usage.export_data) {
    data.user_center.usage.export_data = isZh ? "导出我的数据 (.JSON)" : "Export My Data (.JSON)";
  }

  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
});
console.log('Locales updated successfully');
