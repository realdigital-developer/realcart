import { NextRequest, NextResponse } from 'next/server'
import { authenticateSeller } from '@/lib/seller-api-auth'
import {
  getSellerSalesReport,
  getSellerProductReport,
  getSellerCustomerReport,
  sellerSalesToCSV,
  toCSV,
  getDefaultDateRange,
} from '@/lib/analytics-engine'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  GET /api/seller/analytics/export                                   */
/*  Generates a CSV export of the seller's analytics data.             */
/*  Query: ?type=sales|products|customers&startDate=ISO&endDate=ISO    */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { error, session } = await authenticateSeller(request)
    if (error || !session) return error

    const sellerIds = [session.id, ...session.sellerAliases]

    const type = request.nextUrl.searchParams.get('type') || 'sales'
    const validTypes = ['sales', 'products', 'customers']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be one of: sales, products, customers' },
        { status: 400 },
      )
    }

    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const range = (startDate && endDate)
      ? { startDate, endDate }
      : getDefaultDateRange(30)

    let csv = ''

    if (type === 'sales') {
      const report = await getSellerSalesReport(sellerIds, range, 'day')
      csv = sellerSalesToCSV(report)
    } else if (type === 'products') {
      const report = await getSellerProductReport(sellerIds, range)
      csv = toCSV(
        report.topProducts.map((p) => ({
          ProductID: p.productId,
          Name: p.name,
          Category: p.category,
          UnitsSold: p.unitsSold,
          Revenue: p.revenue,
          Views: p.views,
          ConversionRate: p.conversionRate,
          AvgRating: p.avgRating,
          Stock: p.stock,
        })),
      )
    } else {
      // type === 'customers'
      const report = await getSellerCustomerReport(sellerIds, range)
      csv = toCSV(
        report.topCustomers.map((c) => ({
          CustomerID: c.customerId,
          Name: c.name,
          Mobile: c.mobile,
          TotalOrders: c.totalOrders,
          TotalSpent: c.totalSpent,
          AvgOrderValue: c.avgOrderValue,
          LastOrderDate: c.lastOrderDate,
        })),
      )
    }

    const filename = `seller-${type}-report.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[Seller Analytics Export] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate export', message: (error as Error).message },
      { status: 500 },
    )
  }
}
