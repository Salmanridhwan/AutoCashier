import { Router } from 'express';
import {
  getProfileController,
  updateProfileController,
  updatePasswordController,
  getMemberPointsController,
  uploadProfilePhotoController,
} from './profile.controller.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { upload } from '../../middleware/upload.js';

const router = Router();

// Apply auth middleware to all profile routes
router.use(requireAuth);

// GET /api/shared/profile - fetch current user profile + member_points from DB
router.get('/', getProfileController);

// PUT /api/shared/profile - update name, email, whatsapp
router.put('/', updateProfileController);

// PUT /api/shared/profile/password - change password
router.put('/password', updatePasswordController);

// GET /api/shared/profile/points - get member points balance
router.get('/points', getMemberPointsController);

// POST /api/shared/profile/photo - upload profile photo
router.post('/photo', upload.single('photo'), uploadProfilePhotoController);

export default router;
