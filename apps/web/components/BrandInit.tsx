'use client'
import { useEffect } from 'react'
import { initBrand } from '@/store/brand'

export default function BrandInit() {
  useEffect(() => { initBrand() }, [])
  return null
}
