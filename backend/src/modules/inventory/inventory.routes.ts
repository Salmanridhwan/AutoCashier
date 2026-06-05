import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/rbacMiddleware.js';
import { getInventory, createProduct, updateProduct, deleteProduct } from './inventory.controller.js';

const router = Router();

// Apply Authentication to all routes in this module
router.use(requireAuth);

// Allow both Branch Admins and Super Admins to access these routes
router.use(requireRole(['branch_admin', 'super_admin', 'superadmin', 'admin']));

router.get('/', getInventory);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.patch('/:id', updateProduct); // alias
router.delete('/:id', deleteProduct);

export default router;
