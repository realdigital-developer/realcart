import type { Metadata, Viewport } from 'next'
import CustomerLayoutClient from './customer-layout-client'

export const metadata: Metadata = {
  title: 'RealCart - Shop Smarter, Live Better',
  description: 'Discover millions of products at unbeatable prices. From electronics to fashion, home essentials to groceries — everything you need, delivered to your doorstep.',
  keywords: ['RealCart', 'Shopping', 'E-commerce', 'Online Shopping', 'Fashion', 'Electronics'],
}

/**
 * Customer panel viewport — disables pinch-zoom and manual zoom on
 * mobile devices. This applies ONLY to /customer/* routes (Next.js
 * App Router merges this with the root layout's viewport, with the
 * more specific layout taking precedence).
 *
 * - maximumScale=1 + userScalable=false: prevents pinch-zoom on iOS/Android
 * - This is the most reliable way to prevent mobile zoom; JS event
 *   listeners alone can't fully prevent pinch-zoom on iOS Safari.
 *
 * Desktop zoom prevention (ctrl+wheel, ctrl+keyboard, trackpad pinch)
 * is handled by the CustomerInteractionLock component via JS event
 * listeners.
 *
 * Note: Disabling zoom is generally discouraged for accessibility
 * (users with poor vision can't zoom in to read). This is implemented
 * per the project owner's explicit request for the customer panel
 * (storefront) only — admin/seller/delivery panels keep default zoom.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerLayoutClient>{children}</CustomerLayoutClient>
}
