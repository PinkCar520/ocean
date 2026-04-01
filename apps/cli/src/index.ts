#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import { ZentaoTool } from '@uclaw/tools-zentao';

const program = new Command();
const zentao = new ZentaoTool();

program
  .name('uclaw')
  .description('UClaw AI Workstream Terminal Node')
  .version('1.0.0');

program
  .command('start')
  .description('Start UClaw interaction pointing to a task/bug')
  .argument('[task_id]', 'ID of the ZenTao or GitLab task')
  .action(async (taskId) => {
    if (taskId) {
      console.log(`\x1b[36m[UClaw]\x1b[0m Fetching ZenTao context for: ${taskId}...`);
      const bug = await zentao.getBugInfo(taskId);
      
      if (bug) {
        console.log(`\x1b[32m[Context Found]\x1b[0m`);
        console.log(` > Title: ${bug.title}`);
        console.log(` > Assignee: ${bug.assignee}`);
        console.log(` > Severity: ${bug.severity}`);
      } else {
        console.log(`\x1b[33m[UClaw WARN]\x1b[0m No bug found with ID: ${taskId}. Proceeding with general context.`);
      }
    } else {
      console.log(`\x1b[36m[UClaw]\x1b[0m Initializing general analysis...`);
    }
    
    // Simulating Plan Mode Prompt
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPlan',
        message: 'Plan generated based on .AIGUIDE.md. Do you approve this AST refactor plan?',
        default: true
      }
    ]);
    
    if (answers.confirmPlan) {
      console.log('✅ AST Refactoring started...');
    } else {
      console.log('❌ Refactoring cancelled.');
    }
  });

program
  .command('daemon')
  .description('Start persistent UClaw node daemon to await commands from Gateway')
  .action(() => {
    console.log(`\x1b[32m[UClaw Daemon]\x1b[0m Listening for incoming Gateway RPC commands...`);
    // Daemon WebSocket Logic placeholder
  });

program.parse(process.argv);
