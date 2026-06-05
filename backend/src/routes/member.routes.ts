import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/rbacMiddleware.js';
import memberModuleRoutes from '../modules/members/member.routes.js';

const router = Router();

// All member routes require authentication + member role
router.use(requireAuth, requireRole(['member']));

// Mount member module routes
router.use('/', memberModuleRoutes);

export default router;
