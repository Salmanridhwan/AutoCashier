import { Router } from 'express';
import { getProductAnalytics } from './monitor.controller.js';

const router = Router();

router.get('/products', getProductAnalytics);

export default router;
