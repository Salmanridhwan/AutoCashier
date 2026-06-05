import { Router } from 'express';
import { getBroadcasts, sendBroadcast } from './broadcast.controller.js';

const router = Router();

router.get('/', getBroadcasts);
router.post('/', sendBroadcast);

export default router;
