import { Router } from 'express';
import { loginController, meController, registerController, verifyOtpController } from './auth.controller.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.post('/login', loginController);
router.post('/register', registerController);
router.post('/verify-otp', verifyOtpController);
router.get('/me', requireAuth, meController);

export default router;
