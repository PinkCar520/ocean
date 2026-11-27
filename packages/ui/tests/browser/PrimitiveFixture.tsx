'use client'

import * as React from 'react'
import { Button, Input } from '../../src/index'
import * as LegacyDialog from '../../src/components/dialog'
import * as SharedDialog from '../../src/components/ui/dialog'
import * as LegacyMenu from '../../src/components/dropdown-menu'
import * as SharedMenu from '../../src/components/ui/dropdown-menu'

function Profile({ profile }: { profile: 'legacy' | 'shared' }) {
  const D = profile === 'legacy' ? LegacyDialog : SharedDialog
  const M = profile === 'legacy' ? LegacyMenu : SharedMenu
  const [selection, setSelection] = React.useState('none')
  return (
    <section aria-label={profile} className="flex flex-col items-start gap-4 border rounded-lg p-4">
      <h2>{profile}</h2>
      <D.Dialog>
        <D.DialogTrigger asChild><Button>Open {profile} dialog</Button></D.DialogTrigger>
        <D.DialogContent>
          <D.DialogTitle>{profile} dialog</D.DialogTitle>
          <D.DialogDescription>Primitive profile fixture</D.DialogDescription>
          <Input aria-label={profile + ' dialog input'} defaultValue="initial" />
        </D.DialogContent>
      </D.Dialog>
      <M.DropdownMenu>
        <M.DropdownMenuTrigger asChild><Button variant="outline">Open {profile} menu</Button></M.DropdownMenuTrigger>
        <M.DropdownMenuContent>
          <M.DropdownMenuItem onSelect={() => setSelection('selected')}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="currentColor" /></svg>
            Select item
          </M.DropdownMenuItem>
          <M.DropdownMenuItem disabled>Disabled item</M.DropdownMenuItem>
        </M.DropdownMenuContent>
      </M.DropdownMenu>
      <output aria-label={profile + ' selection'}>{selection}</output>
    </section>
  )
}
export default function PrimitiveFixture() {
  const [clicks,setClicks] = React.useState(0)
  return (
    <main className="max-w-3xl mx-auto p-8 flex flex-col gap-6">
      <h1>Ocean primitive regression fixture</h1>
      <div className="flex gap-4 items-center">
        <Button onClick={() => setClicks(n => n+1)}>Increment</Button>
        <Button disabled onClick={() => setClicks(n => n+1)}>Disabled</Button>
        <Button asChild><a href="#anchor">Link</a></Button>
        <Input aria-label="Email" type="email" placeholder="Email" />
        <output aria-label="Clicks">{clicks}</output>
      </div>
      <Profile profile="legacy" />
      <Profile profile="shared" />
    </main>
  )
}
