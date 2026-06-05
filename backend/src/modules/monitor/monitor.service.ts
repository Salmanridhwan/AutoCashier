import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

const client = () => supabaseAdmin || supabase;

export async function getProductSalesData(params: {
  location_id?: string;
  timeframe?: string;
}) {
  const { location_id = 'ALL', timeframe = 'weekly' } = params;
  const db = client();

  try {
    // 1. Calculate timeframe dates
    const currentEnd = new Date();
    const currentStart = new Date();
    if (timeframe === 'monthly') {
      currentStart.setMonth(currentEnd.getMonth() - 1);
    } else if (timeframe === 'yearly') {
      currentStart.setFullYear(currentEnd.getFullYear() - 1);
    } else {
      // weekly
      currentStart.setDate(currentEnd.getDate() - 7);
    }
    currentStart.setHours(0, 0, 0, 0);

    // 2. Fetch transactions with transaction items and product details
    let query = db
      .from('transactions')
      .select(`
        id,
        total_price,
        created_at,
        branch_id,
        transaction_items (
          quantity,
          subtotal,
          product_id,
          products (
            id,
            name,
            sku,
            category,
            price
          )
        )
      `)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString());

    if (location_id && location_id !== 'ALL') {
      query = query.eq('branch_id', location_id);
    }

    const { data: transactions, error } = await query;
    if (error) throw error;

    const filteredTransactions = transactions || [];

    // 4. Aggregate product metrics
    const productStatsMap = new Map<string, {
      id: string;
      name: string;
      sku: string;
      category: string;
      price: number;
      quantitySold: number;
      revenue: number;
    }>();

    let totalItemsSold = 0;
    let totalRevenue = 0;

    filteredTransactions.forEach((t: any) => {
      const items = t.transaction_items || [];
      items.forEach((item: any) => {
        const prod = item.products;
        if (!prod) return;

        const qty = Number(item.quantity) || 0;
        const sub = Number(item.subtotal) || 0;

        totalItemsSold += qty;
        totalRevenue += sub;

        if (productStatsMap.has(prod.id)) {
          const stats = productStatsMap.get(prod.id)!;
          stats.quantitySold += qty;
          stats.revenue += sub;
        } else {
          productStatsMap.set(prod.id, {
            id: prod.id,
            name: prod.name,
            sku: prod.sku,
            category: prod.category || 'Uncategorized',
            price: Number(prod.price) || 0,
            quantitySold: qty,
            revenue: sub
          });
        }
      });
    });

    const productsList = Array.from(productStatsMap.values());

    // Sort by revenue descending to get top products
    const topProducts = [...productsList]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Aggregate category sales
    const categoryStatsMap = new Map<string, { name: string; value: number }>();
    productsList.forEach(p => {
      const catName = p.category;
      if (categoryStatsMap.has(catName)) {
        categoryStatsMap.get(catName)!.value += p.revenue;
      } else {
        categoryStatsMap.set(catName, { name: catName, value: p.revenue });
      }
    });
    const categoryBreakdown = Array.from(categoryStatsMap.values());

    // 5. Generate daily/monthly trends for the chart
    const trendsMap = new Map<string, number>();
    const labels: string[] = [];

    if (timeframe === 'yearly') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.forEach(m => trendsMap.set(m, 0));

      filteredTransactions.forEach((t: any) => {
        const date = new Date(t.created_at);
        const mLabel = months[date.getMonth()];
        if (trendsMap.has(mLabel)) {
          trendsMap.set(mLabel, trendsMap.get(mLabel)! + Number(t.total_price));
        }
      });
      months.forEach(m => labels.push(m));
    } else {
      // Weekly or Monthly - group by day
      const days = timeframe === 'monthly' ? 30 : 7;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        trendsMap.set(dateStr, 0);
        labels.push(dateStr);
      }

      filteredTransactions.forEach((t: any) => {
        const date = new Date(t.created_at);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (trendsMap.has(dateStr)) {
          trendsMap.set(dateStr, trendsMap.get(dateStr)! + Number(t.total_price));
        }
      });
    }

    const salesTrend = labels.map(label => ({
      date: label,
      revenue: trendsMap.get(label) || 0
    }));

    return {
      ok: true,
      data: {
        totalItemsSold,
        totalRevenue,
        topProducts,
        categoryBreakdown,
        salesTrend,
        productsList: productsList.sort((a, b) => b.quantitySold - a.quantitySold)
      }
    };
  } catch (err: any) {
    console.error('[getProductSalesData] Error:', err);
    return { ok: false, error: err?.message || 'Failed to fetch product sales data' };
  }
}
