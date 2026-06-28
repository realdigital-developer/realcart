'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const SellerProfilePage = dynamic(
  () => import('@/components/customer/seller-profile-page').then(m => ({ default: m.SellerProfilePage })),
  { ssr: false }
)

export default function SellerPage() {
  return (
    <Suspense fallback={null}>
      <SellerProfilePage />
    </Suspense>
  )
}
