import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import authRoutes from '../modules/auth/auth.routes.js';
import productRoutes from '../modules/products/products.routes.js';
import branchRoutes from '../modules/inventory/branch.routes.js';
import profileRoutes from '../modules/users/profile.routes.js';

const router = Router();

// --- Auth routes (public - no auth required for login/register) ---
router.use('/auth', authRoutes);

// --- Products routes (public read, protected write - handled inside products.routes) ---
router.use('/products', productRoutes);

// --- Branches routes (protected) ---
router.use('/branches', requireAuth, branchRoutes);

// --- Profile routes (protected - handled inside profile.routes) ---
router.use('/profile', profileRoutes);

export default router;
