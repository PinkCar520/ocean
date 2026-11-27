// Preserve the existing entry point's visual defaults; shared behavior has one implementation.
import { createDialogPrimitives } from './dialog-implementation'

export const { DialogOverlay, DialogContent } = createDialogPrimitives('shared')
export { Dialog, DialogPortal, DialogTrigger, DialogClose, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './dialog-implementation'
