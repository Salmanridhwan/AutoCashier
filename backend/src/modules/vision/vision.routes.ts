import { Router } from 'express';
import * as visionController from './vision.controller.js';

const router = Router();

// Vision server proxy routes
router.post('/register', visionController.register);
router.get('/products', visionController.getVisionProducts);
router.delete('/products/:id', visionController.deleteVisionProduct);
router.get('/health', visionController.healthCheck);
router.post('/sync', visionController.sync);

export default router;
