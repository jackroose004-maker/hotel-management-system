'use client'
import React from 'react'
import { Stepper, Row, SectionLabel, FieldBlock } from './_controls'
import type { Cfg } from './_types'

interface Props { cfg: Cfg; set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void; vatPct: number }

export default function OrdersSection({ cfg, set, vatPct }: Props) {
  return (
    <>
      <SectionLabel text="Orders & VAT" />
      <Row label="VAT rate" desc="UAE standard is 5% · applied to all orders">
        <Stepper value={vatPct} onChange={v => set('vatRate', v / 100)} min={0} max={30} suffix="%" />
      </Row>
      <FieldBlock border={false}>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          At {vatPct}%, an AED 100 order includes <strong>AED {vatPct}</strong> VAT. Set to 0 to disable.
        </p>
      </FieldBlock>
    </>
  )
}
