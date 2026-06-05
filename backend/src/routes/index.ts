import { Router } from 'express';
import sharedRoutes from './shared.routes.js';
import adminRoutes from './admin.routes.js';
import kasirRoutes from './kasir.routes.js';
import memberRoutes from './member.routes.js';

const router = Router();

// Shared endpoints (auth, products, branches) - accessible by all authenticated users
router.use('/shared', sharedRoutes);

// Admin-only endpoints
router.use('/admin', adminRoutes);

// Kasir endpoints
router.use('/kasir', kasirRoutes);

// Member endpoints
router.use('/member', memberRoutes);

export default router;
