import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

const client = () => supabaseAdmin || supabase;

export async function getOverviewData(params: {
  location_id?: string;
  timeframe?: string;
  year?: string;
  month?: string;
  week?: string;
}) {
  const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentYearStr = new Date().getFullYear().toString();
  const currentMonthStr = monthsList[new Date().getMonth()];

  const { 
    location_id = 'ALL', 
    timeframe = 'weekly', 
    year = currentYearStr, 
    month = currentMonthStr 
  } = params;
  const isBranchFilter = location_id && location_id !== 'ALL';

  try {
    const db = client();

    // ── 1. Date ranges ──────────────────────────────────────────────
    const yearNum = Number(year) || new Date().getFullYear();
    const monthIdx = monthsList.indexOf(month) !== -1 ? monthsList.indexOf(month) : new Date().getMonth();

    let currentStart: Date;
    let currentEnd: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (timeframe === 'yearly') {
      currentStart = new Date(yearNum, 0, 1);
      currentEnd = new Date(yearNum, 11, 31, 23, 59, 59);
      previousStart = new Date(yearNum - 1, 0, 1);
      previousEnd = new Date(yearNum - 1, 11, 31, 23, 59, 59);
    } else if (timeframe === 'monthly') {
      currentStart = new Date(yearNum, monthIdx, 1);
      currentEnd = new Date(yearNum, monthIdx + 1, 0, 23, 59, 59);
      previousStart = new Date(yearNum, monthIdx - 1, 1);
      previousEnd = new Date(yearNum, monthIdx, 0, 23, 59, 59);
    } else {
      // weekly - last 7 days
      currentEnd = new Date();
      currentStart = new Date();
      currentStart.setDate(currentEnd.getDate() - 6);
      currentStart.setHours(0,0,0,0);
      
      previousEnd = new Date(currentStart);
      previousEnd.setMilliseconds(-1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousEnd.getDate() - 6);
      previousStart.setHours(0,0,0,0);
    }

    // ── 2. Revenue — filtered by branch if needed ──────────────────
    let currQuery = db
      .from('transactions')
      .select(`
        total_price,
        created_at,
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

    let prevQuery = db
      .from('transactions')
      .select('total_price, created_at')
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    if (isBranchFilter) {
      currQuery = currQuery.eq('branch_id', location_id);
      prevQuery = prevQuery.eq('branch_id', location_id);
    }

    const { data: currData } = await currQuery;
    const { data: prevData } = await prevQuery;

    const currentRevenue = currData?.reduce((acc: number, t: any) => acc + Number(t.total_price), 0) ?? 0;
    const previousRevenue = prevData?.reduce((acc: number, t: any) => acc + Number(t.total_price), 0) ?? 0;

    let revenueChange = 0;
    if (previousRevenue > 0) {
      revenueChange = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentRevenue > 0) {
      revenueChange = 100;
    }

    // ── 3. Total Transactions ──────────────────────────────────────
    let salesCountQuery = db
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    if (isBranchFilter) {
      salesCountQuery = salesCountQuery.eq('branch_id', location_id);
    }
    const { count: totalSales } = await salesCountQuery;

    // ── 4. Products / Inventory Stats ─────────────────────────────
    let totalProducts = 0;
    let stockData: { stock: number; price: number }[] = [];
    let totalStock = 0;
    let inventoryValue = 0;
    let lowStockCount = 0;
    let validatedCount = 0;

    if (isBranchFilter) {
      // Use branch_inventory for branch-specific data (uses `stock` column)
      const { data: branchStock } = await db
        .from('branch_inventory')
        .select('stock, products(price, ai_label)')
        .eq('branch_id', location_id);

      totalProducts = branchStock?.length ?? 0;
      totalStock = branchStock?.reduce((acc: number, item: any) => acc + (item.stock ?? 0), 0) ?? 0;
      inventoryValue = branchStock?.reduce((acc: number, item: any) => {
        const price = (item.products as any)?.price ?? 0;
        return acc + ((item.stock ?? 0) * price);
      }, 0) ?? 0;
      lowStockCount = branchStock?.filter((item: any) => (item.stock ?? 0) < 10).length ?? 0;
      validatedCount = branchStock?.filter((item: any) => (item.products as any)?.ai_label != null).length ?? 0;
    } else {
      // All branches — use master products table
      const { count: prodCount } = await db
        .from('products')
        .select('*', { count: 'exact', head: true });
      totalProducts = prodCount ?? 0;

      const { data: rawStockData } = await db.from('products').select('stock, price');
      stockData = rawStockData ?? [];
      totalStock = stockData.reduce((acc, p) => acc + (p.stock ?? 0), 0);
      inventoryValue = stockData.reduce((acc, p) => acc + ((p.stock ?? 0) * (p.price ?? 0)), 0);

      const { count: lsCount } = await db.from('products').select('*', { count: 'exact', head: true }).lt('stock', 10);
      lowStockCount = lsCount ?? 0;
      const { count: valCount } = await db.from('products').select('*', { count: 'exact', head: true }).not('ai_label', 'is', null);
      validatedCount = valCount ?? 0;
    }

    // ── 5. Branches count (always all) ────────────────────────────
    let branchesCountQuery = db
      .from('branches')
      .select('*', { count: 'exact', head: true });
    if (isBranchFilter) branchesCountQuery = branchesCountQuery.eq('id', location_id);
    const { count: totalBranches } = await branchesCountQuery;

    // ── 6. Promo count (table is member_promos) ───────────────────
    let promoCount = 0;
    if (isBranchFilter) {
      const { data: promoRows } = await db.from('member_promos').select('conditions');
      promoCount = (promoRows || []).filter((promo: any) => {
        const scope = promo?.conditions?.scope || 'ALL';
        return scope === 'ALL' || scope === location_id;
      }).length;
    } else {
      const { count } = await db
        .from('member_promos')
        .select('*', { count: 'exact', head: true });
      promoCount = count ?? 0;
    }

    // ── 7. Chart Data ─────────────────────────────────────────────
    let labels: string[] = [];
    if (timeframe === 'yearly') {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    } else if (timeframe === 'monthly') {
      const daysInMonth = new Date(yearNum, monthIdx + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
    } else {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(currentEnd);
        d.setDate(d.getDate() - i);
        labels.push(days[d.getDay()]);
      }
    }

    const chartMap = new Map<string, number>();
    labels.forEach(l => chartMap.set(l, 0));

    currData?.forEach((t: any) => {
      const d = new Date(t.created_at);
      let label = '';
      if (timeframe === 'yearly') {
        label = monthsList[d.getMonth()].substring(0, 3);
      } else if (timeframe === 'monthly') {
        label = d.getDate().toString();
      } else {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        label = days[d.getDay()];
      }
      
      if (chartMap.has(label)) {
        chartMap.set(label, chartMap.get(label)! + Number(t.total_price));
      }
    });

    const chartData = labels.map(name => ({
      name,
      total: chartMap.get(name) || 0
    }));

    // ── 8. Latest products ────────────────────────────────────────
    let latestProducts: any[] = [];
    if (isBranchFilter) {
      const { data: branchLatest } = await db
        .from('branch_inventory')
        .select('stock, products(id, name, sku, price, ai_label, category, image_url, created_at)')
        .eq('branch_id', location_id)
        .order('last_updated', { ascending: false })
        .limit(5);
      latestProducts = branchLatest?.map((item: any) => ({ ...(item.products as any), stock: item.stock })) ?? [];
    } else {
      const { data: latest } = await db
        .from('products')
        .select('id, name, sku, price, stock, ai_label, category, image_url, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      latestProducts = latest ?? [];
    }

    // ── 9. Category breakdown ─────────────────────────────────────
    let catData: any[] | null = null;
    if (isBranchFilter) {
      const { data } = await db
        .from('branch_inventory')
        .select('products(category)')
        .eq('branch_id', location_id);
      catData = (data || []).map((item: any) => item.products).filter(Boolean);
    } else {
      const { data } = await db.from('products').select('category');
      catData = data;
    }
    const categoryMap: Record<string, number> = {};
    catData?.forEach((p: any) => {
      const cat = p.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + 1;
    });

    // ── 9b. Aggregate product sales and category contribution metrics ──
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
    currData?.forEach((t: any) => {
      const items = (t as any).transaction_items || [];
      items.forEach((item: any) => {
        const prod = item.products;
        if (!prod) return;

        const qty = item.quantity || 0;
        const sub = item.subtotal || (qty * (prod.price || 0));
        totalItemsSold += qty;

        const key = prod.id;
        if (productStatsMap.has(key)) {
          const stats = productStatsMap.get(key)!;
          stats.quantitySold += qty;
          stats.revenue += sub;
        } else {
          productStatsMap.set(key, {
            id: prod.id,
            name: prod.name,
            sku: prod.sku,
            category: prod.category || 'Other',
            price: prod.price || 0,
            quantitySold: qty,
            revenue: sub
          });
        }
      });
    });

    const productsList = Array.from(productStatsMap.values());
    const topProducts = [...productsList]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const categoryStatsMap = new Map<string, { name: string; value: number }>();
    productsList.forEach(p => {
      const catName = p.category;
      if (categoryStatsMap.has(catName)) {
        categoryStatsMap.get(catName)!.value += p.revenue;
      } else {
        categoryStatsMap.set(catName, { name: catName, value: p.revenue });
      }
    });
    const categorySalesBreakdown = Array.from(categoryStatsMap.values());

    // ── 10. Network Health Score (0-100) ──────────────────────────
    const stockCoverage = totalProducts > 0
      ? (isBranchFilter
          ? (totalStock > 0 ? 1 : 0)
          : (stockData.filter(p => (p.stock ?? 0) > 0).length / totalProducts))
      : 1;

    let salesScore = 30;
    if (revenueChange < 0) {
      salesScore = Math.max(0, 30 + (revenueChange / 2));
    } else if (revenueChange > 20) {
      salesScore = 35;
    }

    const aiRate = totalProducts > 0 ? (validatedCount ?? 0) / totalProducts : 1;
    const lowStockPenalty = totalProducts > 0 ? (lowStockCount ?? 0) / totalProducts : 0;

    const healthScore = Math.round(
      (stockCoverage * 30) +
      salesScore +
      (aiRate * 20) +
      ((1 - lowStockPenalty) * 20)
    );

    return {
      ok: true,
      data: {
        revenue: currentRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        sales: totalSales ?? 0,
        inventoryCount: totalProducts ?? 0,
        totalStock,
        healthScore: Math.min(100, Math.max(0, healthScore)),
        healthBreakdown: {
          inventory: Math.round(stockCoverage * 30),
          sales: Math.round(salesScore),
          ai: Math.round(aiRate * 20),
          lowStock: Math.round((1 - lowStockPenalty) * 20)
        },
        inventoryValue,
        stockHealth: totalStock > 50 ? 'Healthy' : 'Low',
        chartData,
        categoryBreakdown: Object.entries(categoryMap).map(([name, count]) => ({ name, count })),
        categorySalesBreakdown,
        totalItemsSold,
        topProducts,
        productsList,
        latestProducts,
        locations: totalBranches ?? 0,
        promos: promoCount,
        timeframe,
        year,
        month,
        filteredBranch: isBranchFilter ? location_id : null,
      },
    };
  } catch (err: any) {
    console.error('[overviewService] Error:', err);
    return { ok: false, error: err?.message || 'Gagal mengambil data overview' };
  }
}
