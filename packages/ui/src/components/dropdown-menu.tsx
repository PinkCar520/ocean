// Preserve the existing entry point's visual defaults; shared behavior has one implementation.
import { createDropdownMenuPrimitives } from './ui/dropdown-menu-implementation'

export const { DropdownMenuSubContent, DropdownMenuContent, DropdownMenuItem } = createDropdownMenuPrimitives('legacy')
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from './ui/dropdown-menu-implementation'
