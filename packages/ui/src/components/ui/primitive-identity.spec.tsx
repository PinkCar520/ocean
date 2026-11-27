import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { Button as LegacyButton, buttonVariants as legacyVariants } from '../button'
import { Input as LegacyInput } from '../input'
import { Button, buttonVariants } from './button'
import { Input } from './input'
import { Button as PublicButton, Input as PublicInput } from '../../index'

describe('shared primitive consolidation', () => {
  it('has one runtime identity across all supported entry paths', () => {
    expect(LegacyButton).toBe(Button)
    expect(PublicButton).toBe(Button)
    expect(legacyVariants).toBe(buttonVariants)
    expect(LegacyInput).toBe(Input)
    expect(PublicInput).toBe(Input)
  })
  it('retains button variants, disabled state, and Slot rendering', () => {
    expect(buttonVariants({ variant: 'outline', size: 'sm' })).toContain('border-input')
    expect(buttonVariants({ variant: 'outline', size: 'sm' })).toContain('h-8')
    const disabled = renderToStaticMarkup(<Button disabled>Save</Button>)
    expect(disabled).toContain('disabled=""')
    const slot = renderToStaticMarkup(<Button asChild><a href="/test">Link</a></Button>)
    expect(slot).toContain('<a ')
    expect(slot).toContain('href="/test"')
    expect(slot).not.toContain('<button')
  })
  it('retains native input attributes and style overrides', () => {
    const markup = renderToStaticMarkup(<Input type="email" disabled placeholder="Email" className="h-12" />)
    expect(markup).toContain('type="email"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('placeholder="Email"')
    expect(markup).toContain('h-12')
  })
})
