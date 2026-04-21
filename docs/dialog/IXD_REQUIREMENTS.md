# Interaction Design (IxD) Optimization Requirements: Chat Interface

## 1. Executive Summary
This document outlines the interaction design (IxD) optimization requirements for the `ChatInput` component and its integration within the `ChatSession` context. Grounded in the **"Kinetic Minimalist"** design philosophy, the goal is to transform the input area from a static command box into a multi-dimensional, state-aware intent builder without adding visual clutter.

## 2. Current Architecture & Status
Based on the codebase analysis (`apps/web/src/components/chat/ChatInput.tsx` and `apps/web/src/components/ChatSession.tsx`):
- **Component Relationship**: `ChatInput` is a presentational/stateless-like component controlled entirely by its parent (`ChatSession.tsx`).
- **State Management**: Modes like `isSearchMode` and `isKnowledgeMode` are independent boolean states.
- **Model Selection**: Passed as `selectedModelId` and updated per-message, located inside the input box.
- **File Handling**: Relies on a hidden `<input type="file" />` triggered via the Paperclip icon. Chips are rendered above the textarea with a solid bottom border, breaking the visual flow.
- **Textarea**: Uses standard HTML `textarea` with `resize-none`, `min-h-[44px]`, and `max-h-[200px]`. Auto-resizing based on `scrollHeight` is not implemented.
- **Visual Feedback**: Sending/loading states rely on hardcoded color toggles (`bg-[#eeece9]` to `bg-[#EC5B14]`), lacking smooth motion or focus glows.

## 3. Core Problems to Solve
1. **Modality Collision**: Web search and Knowledge Base are independent boolean toggles, leading to unclear routing priorities and a lack of explicit "Addressing" (knowing exactly *what* is being searched).
2. **Disconnected Context Visualization**: Uploaded files appear as chips *outside* the semantic flow of the prompt. 
3. **Rigid Textarea**: Long prompts trigger an internal scrollbar in a single-line view rather than expanding the input box organically.
4. **Missing Power-User Flows**: No global drag-and-drop, clipboard image paste, or Slash/Arrow-Up commands, causing high interaction friction.
5. **Binary "Stop" Mechanism**: The stop action during `isLoading` instantly halts the process without state awareness of *what* is being stopped (e.g., streaming vs. tool execution).

## 4. Proposed Interaction Enhancements & Requirements

### 4.1. Context Mentions (@ System)
**Requirement**: Replace standalone boolean toggles (`isSearchMode`, `isKnowledgeMode`) with an explicit "Mention" system.
- **Trigger**: Typing `@` inside the input box opens a floating contextual menu (Popover).
- **Options**: Web Search, specific Knowledge Bases (e.g., LexisNexis), or specific tools.
- **Result**: Selecting an option inserts a non-editable `Chip` inline within the textarea (or structurally floating inside the text flow). 
- **Refactoring Impact**: `isSearchMode` and `isKnowledgeMode` states in `ChatSession.tsx` should be migrated to an array of `activeMentions` (e.g., `['web', 'db:lexisnexis']`).

### 4.2. Auto-Resizing & Fluid Height
**Requirement**: The textarea must adapt its height dynamically based on content.
- **Behavior**: As the user types, the `textarea` height expands seamlessly up to `max-h-[200px]` (or 35% of viewport height).
- **Implementation**: Use a React `useLayoutEffect` to set `ref.current.style.height = 'auto'` then `ref.current.style.height = ref.current.scrollHeight + 'px'` on every `localInput` change. Ensure smooth easing (`transition-height`).

### 4.3. Power-User Input Flows (Drag & Drop / Paste)
**Requirement**: Support seamless file attachment via clipboard and drag-and-drop.
- **Drag & Drop**: Implement a global or container-level drag listener. When a file is dragged over the `ChatInput`, display a dropzone overlay ("Drop files to attach").
- **Clipboard Paste**: Add an `onPaste` event listener to the `textarea`. If `e.clipboardData.files.length > 0`, intercept the paste and append files to `selectedFiles` state.
- **Pre-upload Validation**: Introduce immediate validation for file size and MIME type before generating the Chip.

### 4.4. State Morphing & Kinetic Feedback
**Requirement**: Add organic, fluid transitions (Kinetic Minimalism) to user interactions.
- **Focus Glow**: When `textarea` is focused, transition the outer `ring` to a soft orange outer glow (`ring-[#EC5B14]/30 shadow-orange-500/15`).
- **Send -> Stop Morph**: Instead of swapping distinct icons, use `framer-motion` to animate the `ArrowUp` icon morphing into a `Square` (Stop) icon when `isLoading` becomes true. 
- **Action Button Gradient**: Ensure the active send button utilizes the `primary-gradient` rather than a flat color.

### 4.5. Model Selector Relocation (Optional but Recommended)
**Requirement**: Re-evaluate the position of the Model Selector.
- **Logic**: If the model applies to the entire session, it should be moved to the Top App Bar or the Chat Header.
- **If kept in Input**: It should be visually distinct from the message payload tools, perhaps defaulting to "Auto" routing.

## 5. Phased Development Plan

**Phase 1: "Kinetic" Foundation (Low effort, High impact)**
- Implement `textarea` auto-resize logic.
- Add Focus Glow to the input container.
- Add Framer Motion transitions for the Send/Stop button morphing.
- Integrate `onPaste` clipboard file capture.

**Phase 2: Context & Modality Refactor**
- Migrate from Boolean Toggles to the Mention/Chip UI.
- Move File Chips *inside* the main input container, removing the separating border.
- Add Drag-and-Drop Dropzone logic to `ChatSession.tsx`.

**Phase 3: Advanced Tooling**
- Implement the `/` (Slash Command) popup menu.
- Implement the `Arrow Up` key logic to fetch the last sent message.
- Add safety checks to the `handleStop` functionality based on Agent state.
