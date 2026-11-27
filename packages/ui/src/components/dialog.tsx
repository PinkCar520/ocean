// Preserve the existing entry point's visual defaults; shared behavior has one implementation.
import { createDialogPrimitives } from './ui/dialog-implementation'

export const { DialogOverlay, DialogContent } = createDialogPrimitives('legacy')
export { Dialog, DialogPortal, DialogTrigger, DialogClose, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './ui/dialog-implementation'
