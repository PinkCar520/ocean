"use client"

// Preserve the existing entry point's visual defaults; shared behavior has one implementation.
import { createDropdownMenuPrimitives } from './dropdown-menu-implementation'

export const { DropdownMenuSubContent, DropdownMenuContent, DropdownMenuItem } = createDropdownMenuPrimitives('shared')
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from './dropdown-menu-implementation'
