'use client'

import dynamic from 'next/dynamic'

const ProductDetailPage = dynamic(
  () => import('@/components/customer/product-detail-page').then(m => ({ default: m.ProductDetailPage })),
  { ssr: false }
)

export default function ProductPageRoute() {
  return <ProductDetailPage />
}
