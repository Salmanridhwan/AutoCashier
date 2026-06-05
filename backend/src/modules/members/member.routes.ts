import { Router } from 'express';
import transactionController from './transaction.controller.js';
import pointsController from './points.controller.js';
import promoController from './promo.controller.js';
import voucherController from './voucher.controller.js';
import notificationController from './notification.controller.js';

const router = Router();

// Transaction history
router.get('/transactions', transactionController.getMemberTransactions);

// Points balance and history
router.get('/points', pointsController.getBalance);
router.get('/points/history', pointsController.getHistory);

// Promos (available + claim)
router.get('/promos', promoController.getMemberPromos);
router.post('/promos/claim', promoController.claimPromo);

// Vouchers (claimed promos, redeem)
router.get('/vouchers', voucherController.getVouchers);
router.post('/vouchers/redeem', voucherController.redeemVoucher);

// Notifications
router.get('/notifications', notificationController.getNotifications);

export default router;
