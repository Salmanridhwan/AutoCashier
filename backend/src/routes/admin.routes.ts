import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/rbacMiddleware.js';
import overviewRoutes from '../modules/dashboard/overview.routes.js';
import monitorRoutes from '../modules/monitor/monitor.routes.js';
import promoRoutes from '../modules/promos/promos.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import broadcastRoutes from '../modules/broadcasts/broadcast.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import transactionRoutes from '../modules/transactions/transaction.routes.js';
import {
  listBranchSummaries,
  getBranchInventoryDetails,
  addInventory,
  updateInventory,
  deleteInventory,
  adjustInventory,
  getMovements,
} from '../modules/inventory/branchInventory.controller.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(requireAuth, requireRole(['super_admin', 'branch_admin', 'admin']));

// --- Admin module routes ---
router.use('/overview', overviewRoutes);
router.use('/monitor', monitorRoutes);
router.use('/promos', promoRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/broadcasts', broadcastRoutes);
router.use('/users', userRoutes);
router.use('/transactions', transactionRoutes);

// --- Branch Inventory Management (admin-level) ---
router.get('/branches/summaries', listBranchSummaries);
router.get('/branches/:id/inventory', getBranchInventoryDetails);
router.get('/branches/:id/movements', getMovements);
router.post('/branches/inventory', addInventory);
router.put('/branches/inventory/:id', updateInventory);
router.delete('/branches/inventory/:id', deleteInventory);
router.post('/branches/inventory/adjust', adjustInventory);

export default router;
