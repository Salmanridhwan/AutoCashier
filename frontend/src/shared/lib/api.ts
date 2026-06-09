/**
 * API service for AutoCashier Admin Dashboard
 * Updated for monorepo route structure:
 * - Shared endpoints: /api/shared/*
 * - Admin endpoints:  /api/admin/*
 */

// Use relative path so Vite proxy handles it (works in both dev and prod)
export const BACKEND_URL = '';

export type LocationID = 'ALL' | string;

export const MOCK_LOCATIONS = [
  { id: 'ALL', name: 'All Branches' },
];

export async function fetchBackend(action: string, data: any = {}) {
  try {
    let token = '';
    const savedUser = localStorage.getItem('autocashier_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.token) token = parsed.token;
      } catch (e) {}
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    switch (action) {
      case 'login': {
        const response = await fetch(`${BACKEND_URL}/api/shared/auth/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            username: data.username, 
            password: data.password 
          })
        });
        
        const resData = await response.json();
        
        if (response.ok && (resData.status === 'success' || resData.success)) {
          const user = resData.data?.user || resData.user;
          const tok = resData.data?.token || resData.token;
          return {
            status: 'success',
            data: {
              username: user.username,
              roleName: user.role === 'super_admin' ? 'Super Admin (Pusat)' : 'Branch Admin',
              role: user.role,
              location_id: user.branch_id || 'ALL',
              email: user.email || '',
              whatsapp: user.whatsapp || '',
              full_name: user.full_name || '',
              avatar_url: user.avatar_url || '',
              token: tok
            }
          };
        }
        
        return { 
          status: 'error', 
          message: resData.error === 'USER_NOT_FOUND' 
            ? 'Pengguna tidak ditemukan' 
            : resData.error === 'INVALID_PASSWORD' 
              ? 'Password salah' 
              : (resData.message || 'Login gagal. Silakan coba lagi.') 
        };
      }

      case 'getTransactions': {
        const params = new URLSearchParams();
        if (data.branch_id && data.branch_id !== 'ALL') params.set('branch_id', data.branch_id);
        if (data.status) params.set('status', data.status);
        if (data.payment_method) params.set('payment_method', data.payment_method);
        if (data.start_date) params.set('start_date', data.start_date);
        if (data.end_date) params.set('end_date', data.end_date);
        if (data.search) params.set('search', data.search);
        if (data.sort) params.set('sort', data.sort);
        if (data.page) params.set('page', String(data.page));
        if (data.limit) params.set('limit', String(data.limit));
        const response = await fetch(`${BACKEND_URL}/api/admin/transactions?${params.toString()}`, { headers });
        return await response.json();
      }

      case 'getMasterCatalog': {
        const response = await fetch(`${BACKEND_URL}/api/shared/products`, { headers });
        const json = await response.json();
        return { status: 'success', data: json.data || json.products || [] };
      }

      case 'getOverview': {
        const params = new URLSearchParams({
          location_id: data.location_id || 'ALL',
          timeframe: data.timeframe || 'weekly',
          year: data.year || new Date().getFullYear().toString(),
          month: data.month || 'April',
          week: data.week || 'Week 17',
        });
        const response = await fetch(`${BACKEND_URL}/api/admin/overview?${params.toString()}`, { headers });
        const json = await response.json();
        if (response.status === 401 || response.status === 403) {
          // Token expired/invalid — clear session and force re-login
          localStorage.removeItem('autocashier_user');
          localStorage.setItem('isAuthenticated', 'false');
          window.location.href = '/login';
          return { status: 'error', message: 'Sesi habis, silakan login ulang' };
        }
        if (!response.ok || json.status !== 'success') {
          return { status: 'error', message: json.message || json.error || `Server error (${response.status})` };
        }
        return json;
      }

      case 'getProductAnalytics': {
        const params = new URLSearchParams({
          location_id: data.location_id || 'ALL',
          timeframe: data.timeframe || 'weekly'
        });
        const response = await fetch(`${BACKEND_URL}/api/admin/monitor/products?${params.toString()}`, { headers });
        return await response.json();
      }

      case 'getPromos': {
        const response = await fetch(`${BACKEND_URL}/api/admin/promos`, { headers });
        return await response.json();
      }

      case 'createPromo': {
        const response = await fetch(`${BACKEND_URL}/api/admin/promos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'deletePromo': {
        const response = await fetch(`${BACKEND_URL}/api/admin/promos/${data.id}`, {
          method: 'DELETE',
          headers
        });
        return await response.json();
      }

      case 'validatePromo': {
        const response = await fetch(`${BACKEND_URL}/api/admin/promos/validate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'getInventory': {
        const targetLoc = data.location_id || 'ALL';
        if (targetLoc === 'ALL') {
          const response = await fetch(`${BACKEND_URL}/api/shared/products`, { headers });
          const json = await response.json();
          return { status: 'success', data: json.data || json.products || [] };
        }
        const response = await fetch(`${BACKEND_URL}/api/admin/inventory`, { headers });
        const json = await response.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        return { status: 'success', data: items };
      }

      case 'addInventory': {
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/inventory`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'adjustInventory': {
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/inventory/adjust`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'updateInventory': {
        const { id, ...updateData } = data;
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/inventory/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updateData)
        });
        return await response.json();
      }

      case 'deleteInventory': {
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/inventory/${data.id}?branch_id=${data.location_id}`, {
          method: 'DELETE',
          headers
        });
        return await response.json();
      }

      case 'deleteProduct': {
        const response = await fetch(`${BACKEND_URL}/api/shared/products/${data.id}`, {
          method: 'DELETE',
          headers
        });
        return await response.json();
      }

      case 'getBranchSummaries': {
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/summaries`, { headers });
        return await response.json();
      }

      case 'getBranchInventoryDetails': {
        const response = await fetch(`${BACKEND_URL}/api/admin/branches/${data.id}/inventory`, { headers });
        return await response.json();
      }

      case 'getInventoryMovements': {
        const url = data.product_id
          ? `${BACKEND_URL}/api/admin/branches/${data.id}/movements?product_id=${data.product_id}`
          : `${BACKEND_URL}/api/admin/branches/${data.id}/movements`;
        const response = await fetch(url, { headers });
        return await response.json();
      }

      case 'getUsers': {
        const response = await fetch(`${BACKEND_URL}/api/admin/users`, { headers });
        return await response.json();
      }

      case 'getBranches': {
        const response = await fetch(`${BACKEND_URL}/api/shared/branches`, { headers });
        return await response.json();
      }

      case 'getBroadcasts': {
        const response = await fetch(`${BACKEND_URL}/api/admin/broadcasts`, { headers });
        return await response.json();
      }

      case 'sendBroadcast': {
        const response = await fetch(`${BACKEND_URL}/api/admin/broadcasts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'createUser': {
        const response = await fetch(`${BACKEND_URL}/api/admin/users`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'updateUser': {
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${data.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'deleteUser': {
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${data.id}`, {
          method: 'DELETE',
          headers
        });
        return await response.json();
      }

      case 'assignMemberPromo': {
        const { userId, ...promoData } = data;
        const response = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/promos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(promoData)
        });
        return await response.json();
      }

      case 'getProfile': {
        const response = await fetch(`${BACKEND_URL}/api/shared/profile`, { headers });
        return await response.json();
      }

      case 'updateProfile': {
        const response = await fetch(`${BACKEND_URL}/api/shared/profile`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'updatePassword': {
        const response = await fetch(`${BACKEND_URL}/api/shared/profile/password`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data)
        });
        return await response.json();
      }

      case 'uploadProfilePhoto': {
        const uploadHeaders = { ...headers };
        delete uploadHeaders['Content-Type'];
        const response = await fetch(`${BACKEND_URL}/api/shared/profile/photo`, {
          method: 'POST',
          headers: uploadHeaders,
          body: data
        });
        return await response.json();
      }

      case 'submitProductRequest': {
        const uploadHeaders = { ...headers };
        const isFormData = data instanceof FormData;
        if (isFormData) delete uploadHeaders['Content-Type'];
        const response = await fetch(`${BACKEND_URL}/api/shared/products/requests`, {
          method: 'POST',
          headers: uploadHeaders,
          body: isFormData ? data : JSON.stringify(data)
        });
        return await response.json();
      }

      case 'getProductRequests': {
        const params = data.status ? `?status=${data.status}` : '';
        const response = await fetch(`${BACKEND_URL}/api/shared/products/requests/list${params}`, { headers });
        return await response.json();
      }

      case 'approveProductRequest': {
        const response = await fetch(`${BACKEND_URL}/api/shared/products/requests/${data.id}/approve`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ price: data.price, category: data.category })
        });
        return await response.json();
      }

      case 'rejectProductRequest': {
        const response = await fetch(`${BACKEND_URL}/api/shared/products/requests/${data.id}/reject`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ reason: data.reason })
        });
        return await response.json();
      }

      case 'cancelProductRequest': {
        const response = await fetch(`${BACKEND_URL}/api/shared/products/requests/${data.id}`, {
          method: 'DELETE',
          headers
        });
        return await response.json();
      }

      case 'addFromCatalog': {
        const response = await fetch(`${BACKEND_URL}/api/admin/inventory`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product_id: data.product_id,
            name: data.name,
            category: data.category,
            price: data.price,
            stock: data.stock || 0,
            sku: data.sku,
            _link_existing: true,
          })
        });
        return await response.json();
      }

      default:
        return { status: 'error', message: 'Action not implemented' };
    }
  } catch (err) {
    console.error(`[api] Error performing action ${action}:`, err);
    return { status: 'error', message: 'Connection to backend failed' };
  }
}
