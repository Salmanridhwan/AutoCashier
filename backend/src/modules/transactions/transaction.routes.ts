import { Router } from 'express';
import { getTransactions, checkout, getStoreSettings } from './transaction.controller.js';

const router = Router();

router.get('/', getTransactions);
router.post('/checkout', checkout);
router.get('/store-settings', getStoreSettings);

export default router;
